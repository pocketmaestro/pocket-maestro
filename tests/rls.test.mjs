import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const db = new PGlite();
const q = (s, p) => db.query(s, p);
// --- stand-ins for Supabase's built-in auth & storage schemas ---
await db.exec(`
create role authenticated nologin; create role anon nologin;
create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true),'')::uuid $$;
create schema storage; create table storage.buckets(id text primary key, name text, public bool);
create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
`);
let sql = fs.readFileSync(process.argv[2] || new URL("../supabase/migrations/0001_init.sql", import.meta.url), "utf8").replace(/create extension if not exists pgcrypto;/, "")
  .replace(/upper\(substr\(encode\(gen_random_bytes\(6\), 'hex'\), 1, 6\)\)/, "upper(substr(md5(random()::text),1,6))")
  .replace(/to authenticated/g, "");
await db.exec(sql);
await db.exec(`grant usage on schema public, auth, storage to authenticated; grant all on all tables in schema public to authenticated; grant all on all tables in schema storage to authenticated; grant execute on all functions in schema public, auth to authenticated;`);
console.log("✓ migration applied");

const U = { t1:"00000000-0000-0000-0000-0000000000a1", t2:"00000000-0000-0000-0000-0000000000a2", s1:"00000000-0000-0000-0000-0000000000b1", s2:"00000000-0000-0000-0000-0000000000b2", s3:"00000000-0000-0000-0000-0000000000b3", adm:"00000000-0000-0000-0000-0000000000c1"};
for (const [k,id] of Object.entries(U)) await q(`insert into auth.users(id, raw_user_meta_data) values ($1, $2)`, [id, {display_name:k}]);
const d = (await q(`insert into districts(name) values('Test ISD') returning id`)).rows[0].id;
await q(`update profiles set district_id=$1`, [d]);
await q(`update profiles set role='teacher' where id in ($1,$2)`, [U.t1,U.t2]);
await q(`insert into district_admins values($1,$2)`, [d,U.adm]);
const sch = (await q(`insert into schools(district_id,name) values($1,'Test MS') returning id`, [d])).rows[0].id;
const cA = (await q(`insert into classes(school_id,name) values($1,'Band A') returning id`, [sch])).rows[0].id;
const cB = (await q(`insert into classes(school_id,name) values($1,'Band B') returning id`, [sch])).rows[0].id;
await q(`insert into class_teachers values($1,$2),($3,$4)`, [cA,U.t1,cB,U.t2]);
await q(`insert into class_students(class_id,student_id) values($1,$2),($1,$3),($4,$5)`, [cA,U.s1,U.s2,cB,U.s3]);
await q(`insert into practice_sessions(student_id,class_id,instrument,seconds,notes_played,notes_in_tune) values ($1,$2,'trumpet',600,40,30),($3,$2,'flute',300,20,18),($4,$5,'tuba',200,10,5)`, [U.s1,cA,U.s2,U.s3,cB]);
console.log("✓ test district built (2 teachers, 3 students, 2 classes)");

let pass=0, fail=0;
const as = async (user, fn) => { await db.exec(`set role authenticated`); await db.exec(`select set_config('request.jwt.sub','${user}',false)`); try { return await fn(); } finally { await db.exec(`reset role`); } };
const check = (name, ok) => { ok ? pass++ : fail++; console.log((ok ? "  PASS " : "  FAIL ") + name); };
const tryQ = async (s,p) => { try { return {rows:(await q(s,p)).rows}; } catch(e){ return {err:e.message}; } };

// Students
await as(U.s1, async () => {
  const r = await q(`select student_id from practice_sessions`);
  check("student sees only their own practice", r.rows.length===1 && r.rows[0].student_id===U.s1);
  const p = await q(`select id from profiles`);
  check("student sees only their own profile", p.rows.length===1);
  const ins = await tryQ(`insert into practice_sessions(student_id,instrument,seconds) values($1,'trumpet',10)`, [U.s2]);
  check("student cannot write another student's practice", !!ins.err);
  const long = await tryQ(`insert into practice_sessions(student_id,instrument,seconds) values($1,'trumpet',2000)`, [U.s1]);
  check("sessions over 15 minutes rejected", !!long.err);
  const role = await tryQ(`update profiles set role='teacher' where id=$1`, [U.s1]);
  const after = await q(`select role from profiles where id=$1`, [U.s1]);
  check("student cannot make themselves a teacher", after.rows[0].role==='student');
  const pt = await tryQ(`insert into playing_tests(student_id,class_id,audio_path,seconds) values($1,$2,'x',30)`, [U.s1,cA]);
  check("playing test blocked while district option is OFF", !!pt.err);
  const cheer = await tryQ(`insert into cheers(teacher_id,student_id,message_key) values($1,$2,'miss_you')`, [U.s1,U.s2]);
  check("students cannot send messages", !!cheer.err);
  const cl = await q(`select id from classes`);
  check("student sees only their own class", cl.rows.length===1 && cl.rows[0].id===cA);
  const rep = await tryQ(`insert into problem_reports(class_id,student_id,kind,note) values($1,$2,'froze','it froze')`, [cA,U.s1]);
  check("student can file a problem report", !rep.err);
});
// Teachers
await as(U.t1, async () => {
  const r = await q(`select student_id from practice_sessions order by student_id`);
  check("teacher sees only their own students' practice", r.rows.length===2 && !r.rows.some(x=>x.student_id===U.s3));
  const p = await q(`select id from profiles where role='student'`);
  check("teacher sees only their own students' profiles", p.rows.length===2);
  const cheer = await tryQ(`insert into cheers(teacher_id,student_id,message_key) values($1,$2,'miss_you')`, [U.t1,U.s1]);
  check("teacher can send a preset cheer to their student", !cheer.err);
  const free = await tryQ(`insert into cheers(teacher_id,student_id,message_key) values($1,$2,'hey call me')`, [U.t1,U.s1]);
  check("cheers must be preset messages (no free text)", !!free.err);
  const other = await tryQ(`insert into cheers(teacher_id,student_id,message_key) values($1,$2,'miss_you')`, [U.t1,U.s3]);
  check("teacher cannot message another teacher's student", !!other.err);
  const mus = await tryQ(`insert into class_music(class_id,title,musicxml,rights_confirmed,uploaded_by) values($1,'x','<x/>',false,$2)`, [cA,U.t1]);
  check("music upload requires the rights checkbox", !!mus.err);
  const reps = await q(`select id from problem_reports`);
  check("teacher sees reports from their class", reps.rows.length===1);
});
await as(U.t2, async () => {
  const r = await q(`select student_id from practice_sessions`);
  check("other teacher sees none of class A's students", r.rows.length===1 && r.rows[0].student_id===U.s3);
  const reps = await q(`select id from problem_reports`);
  check("other teacher cannot see class A's reports", reps.rows.length===0);
});
// Playing tests option
const on1 = await tryQ(`update districts set playing_tests=true where id=$1`, [d]);
check("cannot turn on playing tests without the privacy agreement", !!on1.err);
await as(U.adm, async () => { await q(`update districts set playing_tests_agreement_confirmed=true, playing_tests=true, playing_test_days=7 where id=$1`, [d]); });
await as(U.s1, async () => {
  const pt = await tryQ(`insert into playing_tests(student_id,class_id,audio_path,seconds) values($1,$2,'a/b/c.webm',30) returning delete_after`, [U.s1,cA]);
  check("playing test allowed once district turns it on", !pt.err);
  const days = pt.rows ? (new Date(pt.rows[0].delete_after) - Date.now())/864e5 : 0;
  check("clip auto-delete date set from district setting (7 days)", days>6.9 && days<7.1);
  const long = await tryQ(`insert into playing_tests(student_id,class_id,audio_path,seconds) values($1,$2,'x',400)`, [U.s1,cA]);
  check("clips over 3 minutes rejected", !!long.err);
});
await as(U.s2, async () => { const r=await q(`select id from playing_tests`); check("another student cannot hear a classmate's clip", r.rows.length===0); });
await as(U.t2, async () => { const r=await q(`select id from playing_tests`); check("other class's teacher cannot hear the clip", r.rows.length===0); });
await as(U.t1, async () => { const r=await q(`select id from playing_tests`); check("the student's own teacher can hear the clip", r.rows.length===1); });
await as(U.adm, async () => { await q(`update districts set playing_tests=false where id=$1`, [d]); });
const left = await q(`select count(*)::int n from playing_tests`);
check("turning playing tests OFF deletes every clip", left.rows[0].n===0);
await as(U.s1, async () => { const r = await tryQ(`select * from app_team_reports`); check("app team view hides student identity", !r.err && r.rows.every(x=>!('student_id' in x) && !('note' in x))); });
console.log(`\n${pass} passed, ${fail} failed`);
