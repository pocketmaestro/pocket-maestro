-- Pocket Maestro — initial database
-- Child safety is enforced HERE, in the database, not just in the app:
--   * Row Level Security on every table: students see only their own data,
--     teachers see only students in classes they teach.
--   * No audio from the live coach is ever stored. Practice sessions are summaries (numbers only).
--   * Playing-test clips exist only if the district turned the option on, and they auto-delete.
--   * No camera/video for students. Only teachers can upload demo videos.
--   * Teacher "cheers" are preset messages only; students cannot send messages.

-- ───────────────────────── basics ─────────────────────────
create extension if not exists pgcrypto;

create type public.user_role as enum ('student', 'teacher', 'district_admin');
create type public.coach_issue as enum ('flat', 'sharp', 'wobble');
create type public.instrument as enum ('flute','clarinet','sax','trumpet','trombone','baritone','tuba','perc','violin');

-- ───────────────────────── districts & schools ─────────────────────────
create table public.districts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- district options (see the Teacher > District options panel)
  playing_tests boolean not null default false,           -- OFF until the district turns it on
  playing_test_days int not null default 30 check (playing_test_days in (7, 14, 30)),
  playing_tests_agreement_confirmed boolean not null default false, -- privacy agreement + parent notice
  practice_summaries boolean not null default true,
  teacher_cheers boolean not null default true,
  home_use boolean not null default true,
  parent_updates boolean not null default true,
  summer_mode boolean not null default false,
  created_at timestamptz not null default now(),
  constraint playing_tests_need_agreement check (not playing_tests or playing_tests_agreement_confirmed)
);

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  district_id uuid not null references public.districts(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- ───────────────────────── people ─────────────────────────
-- Minimum info: first name + last initial. No student email, phone, photo, or location columns exist.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'student',
  display_name text not null check (char_length(display_name) between 1 and 40),
  language text not null default 'en' check (language in ('en', 'es')),
  district_id uuid references public.districts(id) on delete set null,
  accessibility jsonb not null default '{}'::jsonb,       -- large text, calm mode, read aloud, slower pace
  created_at timestamptz not null default now()
);

create table public.district_admins (
  district_id uuid not null references public.districts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (district_id, user_id)
);

-- ───────────────────────── classes ─────────────────────────
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  join_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)),
  created_at timestamptz not null default now()
);

create table public.class_teachers (
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  primary key (class_id, teacher_id)
);

create table public.class_students (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  instrument public.instrument not null default 'trumpet',
  level int not null default 1 check (level between 1 and 3),
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

-- ───────────────────────── practice (numbers only, never audio) ─────────────────────────
create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  instrument public.instrument not null,
  started_at timestamptz not null default now(),
  seconds int not null check (seconds between 0 and 900),        -- live coach sessions cap at 15 minutes
  notes_played int not null default 0 check (notes_played >= 0),
  notes_in_tune int not null default 0 check (notes_in_tune >= 0),
  top_issue public.coach_issue
);
create index on public.practice_sessions (student_id, started_at desc);

create table public.note_mastery (
  student_id uuid not null references public.profiles(id) on delete cascade,
  instrument public.instrument not null,
  pitch_class int not null check (pitch_class between 0 and 11),  -- concert pitch class
  in_tune_hits int not null default 0 check (in_tune_hits >= 0),
  primary key (student_id, instrument, pitch_class)
);

-- ───────────────────────── teaching content ─────────────────────────
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  song_ref text,                       -- built-in song key or class_music id
  tempo int check (tempo between 40 and 200),
  demo_video_path text,                -- storage path in 'demo-videos' (teacher videos only)
  due_on date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.class_music (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  musicxml text not null,
  rights_confirmed boolean not null check (rights_confirmed),   -- teacher must confirm they may share it
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.director_tips (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  issue public.coach_issue not null,
  tip_text text not null check (char_length(tip_text) <= 200),
  audio_path text,                     -- the TEACHER's voice, storage bucket 'director-tips'
  created_at timestamptz not null default now(),
  unique (teacher_id, issue)
);

-- Preset cheers only. Students can never send messages to anyone.
create table public.cheers (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  message_key text not null check (message_key in ('miss_you', 'great_week', 'keep_going', 'proud_of_you')),
  created_at timestamptz not null default now()
);

-- ───────────────────────── problem reports ─────────────────────────
create table public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('sound', 'froze', 'feedback', 'other', 'instrument')),
  note text check (char_length(note) <= 200),
  device text check (char_length(device) <= 80),
  screen text check (char_length(screen) <= 40),
  status text not null default 'new' check (status in ('new', 'teacher_helped', 'sent_to_app_team', 'fixed')),
  created_at timestamptz not null default now()
);

-- What the app team sees: no student id, no class id, no note text (a kid may have typed something personal).
create view public.app_team_reports with (security_invoker = true) as
  select id, kind, device, screen, status, created_at
  from public.problem_reports
  where status in ('sent_to_app_team', 'fixed');

-- ───────────────────────── optional playing tests (district must turn on) ─────────────────────────
create table public.playing_tests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  audio_path text not null,            -- storage bucket 'playing-tests' (sound only)
  seconds int not null check (seconds between 1 and 180),   -- 3-minute limit
  grade text check (grade in ('pass', 'again')),
  delete_after timestamptz not null,
  created_at timestamptz not null default now()
);

-- ───────────────────────── helper functions for security rules ─────────────────────────
create or replace function public.teaches_class(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from class_teachers where class_id = c and teacher_id = auth.uid());
$$;

create or replace function public.in_class(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from class_students where class_id = c and student_id = auth.uid());
$$;

create or replace function public.teaches_student(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from class_students cs join class_teachers ct on ct.class_id = cs.class_id
    where cs.student_id = s and ct.teacher_id = auth.uid());
$$;

create or replace function public.district_of_class(c uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.district_id from classes cl join schools s on s.id = cl.school_id where cl.id = c;
$$;

create or replace function public.is_district_admin(d uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from district_admins where district_id = d and user_id = auth.uid());
$$;

create or replace function public.playing_tests_on(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select d.playing_tests from districts d where d.id = public.district_of_class(c)), false);
$$;

-- ───────────────────────── row level security ─────────────────────────
alter table public.districts enable row level security;
alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.district_admins enable row level security;
alter table public.classes enable row level security;
alter table public.class_teachers enable row level security;
alter table public.class_students enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.note_mastery enable row level security;
alter table public.assignments enable row level security;
alter table public.class_music enable row level security;
alter table public.director_tips enable row level security;
alter table public.cheers enable row level security;
alter table public.problem_reports enable row level security;
alter table public.playing_tests enable row level security;

-- districts: members can read their district's options; only district admins change them
create policy "read own district" on public.districts for select
  using (id = (select district_id from profiles where id = auth.uid()) or public.is_district_admin(id));
create policy "admins update district" on public.districts for update
  using (public.is_district_admin(id)) with check (public.is_district_admin(id));

create policy "read schools in my district" on public.schools for select
  using (district_id = (select district_id from profiles where id = auth.uid()) or public.is_district_admin(district_id));

-- profiles: you see yourself; teachers see their own students; nobody else
create policy "see myself" on public.profiles for select using (id = auth.uid());
create policy "teachers see their students" on public.profiles for select using (public.teaches_student(id));
create policy "update myself" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid())); -- can't change own role

create policy "admins see admin list" on public.district_admins for select using (user_id = auth.uid());

-- classes
create policy "members see class" on public.classes for select
  using (public.teaches_class(id) or public.in_class(id));
create policy "teachers see co-teachers" on public.class_teachers for select
  using (teacher_id = auth.uid() or public.teaches_class(class_id));
create policy "roster: teacher or self" on public.class_students for select
  using (student_id = auth.uid() or public.teaches_class(class_id));
create policy "teachers manage roster" on public.class_students for all
  using (public.teaches_class(class_id)) with check (public.teaches_class(class_id));

-- practice: student writes/reads own; teacher reads their students' (if district allows summaries)
create policy "student own sessions" on public.practice_sessions for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "teacher reads summaries" on public.practice_sessions for select
  using (public.teaches_student(student_id)
         and coalesce((select d.practice_summaries from districts d join profiles p on p.district_id = d.id where p.id = student_id), true));

create policy "student own mastery" on public.note_mastery for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "teacher reads mastery" on public.note_mastery for select using (public.teaches_student(student_id));

-- teaching content
create policy "class reads assignments" on public.assignments for select
  using (public.teaches_class(class_id) or public.in_class(class_id));
create policy "teacher writes assignments" on public.assignments for all
  using (public.teaches_class(class_id)) with check (public.teaches_class(class_id) and created_by = auth.uid());

create policy "class reads music" on public.class_music for select
  using (public.teaches_class(class_id) or public.in_class(class_id));
create policy "teacher writes music" on public.class_music for all
  using (public.teaches_class(class_id)) with check (public.teaches_class(class_id) and uploaded_by = auth.uid());

create policy "teacher owns tips" on public.director_tips for all
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy "students read their teachers' tips" on public.director_tips for select
  using (exists (select 1 from class_students cs join class_teachers ct on ct.class_id = cs.class_id
                 where cs.student_id = auth.uid() and ct.teacher_id = director_tips.teacher_id));

create policy "teacher sends cheers" on public.cheers for insert
  with check (teacher_id = auth.uid() and public.teaches_student(student_id)
              and coalesce((select d.teacher_cheers from districts d join profiles p on p.district_id = d.id where p.id = auth.uid()), true));
create policy "see own cheers" on public.cheers for select using (student_id = auth.uid() or teacher_id = auth.uid());

-- problem reports: students file for their class; teachers handle them
create policy "student files report" on public.problem_reports for insert
  with check (student_id = auth.uid() and public.in_class(class_id) and status = 'new');
create policy "student sees own reports" on public.problem_reports for select using (student_id = auth.uid());
create policy "teacher handles reports" on public.problem_reports for all
  using (public.teaches_class(class_id)) with check (public.teaches_class(class_id));

-- playing tests: only when the district turned them on
create policy "student submits test" on public.playing_tests for insert
  with check (student_id = auth.uid() and public.in_class(class_id) and public.playing_tests_on(class_id));
create policy "student sees own tests" on public.playing_tests for select using (student_id = auth.uid());
create policy "student deletes own test" on public.playing_tests for delete using (student_id = auth.uid());
create policy "teacher reads and grades tests" on public.playing_tests for select using (public.teaches_class(class_id));
create policy "teacher grades tests" on public.playing_tests for update
  using (public.teaches_class(class_id)) with check (public.teaches_class(class_id));
create policy "teacher deletes tests" on public.playing_tests for delete using (public.teaches_class(class_id));

-- set delete_after automatically from the district's setting
create or replace function public.set_playing_test_expiry() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.delete_after := now() + make_interval(days => coalesce(
    (select d.playing_test_days from districts d where d.id = public.district_of_class(new.class_id)), 30));
  return new;
end $$;
create trigger playing_test_expiry before insert on public.playing_tests
  for each row execute function public.set_playing_test_expiry();

-- turning playing tests OFF deletes every clip in that district right away
create or replace function public.purge_tests_when_off() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.playing_tests and not new.playing_tests then
    delete from playing_tests pt where public.district_of_class(pt.class_id) = new.id;
  end if;
  return new;
end $$;
create trigger purge_tests_when_off after update of playing_tests on public.districts
  for each row execute function public.purge_tests_when_off();

-- new sign-ups get a student profile; teachers/admins are promoted by a district admin
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, role)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), 'Student'), 'student');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── private file storage ─────────────────────────
insert into storage.buckets (id, name, public) values
  ('playing-tests', 'playing-tests', false),
  ('director-tips', 'director-tips', false),
  ('demo-videos', 'demo-videos', false)
on conflict (id) do nothing;

-- playing-tests/<class_id>/<student_id>/<file>
create policy "student uploads own clip" on storage.objects for insert to authenticated
  with check (bucket_id = 'playing-tests' and (storage.foldername(name))[2] = auth.uid()::text
              and public.in_class(((storage.foldername(name))[1])::uuid)
              and public.playing_tests_on(((storage.foldername(name))[1])::uuid));
create policy "clip readers" on storage.objects for select to authenticated
  using (bucket_id = 'playing-tests' and ((storage.foldername(name))[2] = auth.uid()::text
         or public.teaches_class(((storage.foldername(name))[1])::uuid)));
create policy "clip deleters" on storage.objects for delete to authenticated
  using (bucket_id = 'playing-tests' and ((storage.foldername(name))[2] = auth.uid()::text
         or public.teaches_class(((storage.foldername(name))[1])::uuid)));

-- director-tips/<teacher_id>/<file> and demo-videos/<class_id>/<file>: teachers only write
create policy "teacher writes own tips audio" on storage.objects for insert to authenticated
  with check (bucket_id = 'director-tips' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "tips audio readable by signed-in users" on storage.objects for select to authenticated
  using (bucket_id = 'director-tips');
create policy "teacher uploads demo video" on storage.objects for insert to authenticated
  with check (bucket_id = 'demo-videos' and public.teaches_class(((storage.foldername(name))[1])::uuid));
create policy "class watches demo video" on storage.objects for select to authenticated
  using (bucket_id = 'demo-videos' and (public.teaches_class(((storage.foldername(name))[1])::uuid)
         or public.in_class(((storage.foldername(name))[1])::uuid)));

-- ───────────────────────── automatic deletion ─────────────────────────
-- Expired playing-test clips are deleted every hour by the edge function
-- supabase/functions/purge-expired (it removes the sound file through the Storage API,
-- then the database row). It is scheduled at deploy time with pg_cron + pg_net
-- (see README "Before any real student"). Until real students exist, nothing is stored.
