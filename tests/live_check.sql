-- Live safety check for the real Supabase database.
-- Creates made-up people, checks who can see what, then deletes everything it made.
create temp table r(test text, passed boolean);
grant all on r to authenticated, anon;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','t1@test.invalid'),
 ('00000000-0000-0000-0000-0000000000a2','t2@test.invalid'),
 ('00000000-0000-0000-0000-0000000000b1','s1@test.invalid'),
 ('00000000-0000-0000-0000-0000000000b2','s2@test.invalid');
update public.profiles set role='teacher' where id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2');
insert into public.districts (id,name) values ('00000000-0000-0000-0000-0000000000d1','Test District');
insert into public.schools (id,district_id,name) values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d1','Test School');
insert into public.classes (id,school_id,name) values
 ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000e1','Class A'),
 ('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000e1','Class B');
insert into public.class_teachers values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000a2');
insert into public.class_students (class_id,student_id) values ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000b1'),('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000b2');
insert into public.practice_sessions (student_id,instrument,seconds) values ('00000000-0000-0000-0000-0000000000b1','trumpet',600),('00000000-0000-0000-0000-0000000000b2','flute',300);

-- student s1
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}',false);
set role authenticated;
insert into r select 'Student sees only their own practice', (select count(*) from public.practice_sessions)=1;
insert into r select 'Student sees only their own profile', (select count(*) from public.profiles)=1;
insert into r select 'Student cannot see other class', (select count(*) from public.classes)=1;
do $$ begin
  update public.profiles set role='teacher' where id=auth.uid();
  insert into r values ('Student cannot make themself a teacher', false);
exception when others then insert into r values ('Student cannot make themself a teacher', true); end $$;
do $$ begin
  insert into public.practice_sessions (student_id,instrument,seconds) values ('00000000-0000-0000-0000-0000000000b2','tuba',60);
  insert into r values ('Student cannot write practice for someone else', false);
exception when others then insert into r values ('Student cannot write practice for someone else', true); end $$;
do $$ begin
  insert into public.practice_sessions (student_id,instrument,seconds) values (auth.uid(),'trumpet',1200);
  insert into r values ('Practice capped at 15 minutes', false);
exception when others then insert into r values ('Practice capped at 15 minutes', true); end $$;
do $$ begin
  insert into public.cheers (teacher_id,student_id,message_key) values (auth.uid(),'00000000-0000-0000-0000-0000000000b2','great_week');
  insert into r values ('Student cannot send messages', false);
exception when others then insert into r values ('Student cannot send messages', true); end $$;
do $$ begin
  insert into public.playing_tests (student_id,class_id,audio_path,seconds,delete_after) values (auth.uid(),'00000000-0000-0000-0000-0000000000f1','x',30,now());
  insert into r values ('Playing tests blocked until district turns them on', false);
exception when others then insert into r values ('Playing tests blocked until district turns them on', true); end $$;
reset role;

-- teacher t1
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',false);
set role authenticated;
insert into r select 'Teacher sees their own student''s practice only', (select count(*) from public.practice_sessions)=1;
insert into r select 'Teacher sees self + own student only', (select count(*) from public.profiles)=2;
insert into r select 'Teacher cannot see other teacher''s student', (select count(*) from public.profiles where id='00000000-0000-0000-0000-0000000000b2')=0;
reset role;

-- signed-out visitor
select set_config('request.jwt.claims','',false);
set role anon;
do $$ begin
  perform count(*) from public.profiles;
  insert into r values ('Signed-out visitor sees nothing', false);
exception when others then insert into r values ('Signed-out visitor sees nothing', true); end $$;
reset role;

-- storage and security settings
insert into r select 'All 3 file buckets exist and are private', (select count(*) from storage.buckets where id in ('playing-tests','director-tips','demo-videos') and not public)=3;
insert into r select 'Row-level security on all 15 tables', (select count(*) from pg_tables where schemaname='public' and rowsecurity)=15;

-- clean up the made-up data
delete from public.districts where id='00000000-0000-0000-0000-0000000000d1';
delete from auth.users where email like '%@test.invalid';
insert into r select 'Test data cleaned up', (select count(*) from auth.users where email like '%@test.invalid')=0;

select test, case when passed then 'PASS' else 'FAIL' end as result from r;
