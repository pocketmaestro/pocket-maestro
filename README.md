# Pocket Maestro

The full app screens live in `index.html` (from the approved concept). `src/bridge.ts` signs people in and connects every screen to the protected database.

A home practice coach for band students, with a teacher dashboard. English and Spanish.
**Child safety comes first.** If a feature isn't clearly safe and legal for kids, it doesn't go in.

## What's here
| Part | Where |
|---|---|
| Web app (React + Vite, works on Chromebooks, iPads, phones) | `src/` |
| Database, with child-safety rules enforced by the database itself | `supabase/migrations/0001_init.sql` |
| Auto-delete for optional playing-test clips | `supabase/functions/purge-expired/` |
| Safety tests (27 checks: who can see what) | `tests/rls.test.mjs` → `node tests/rls.test.mjs` |

Without Supabase keys the app runs in **demo mode** with made-up students.

## Safety rules built into the database
- Students see only their own data. Teachers see only students in classes they teach.
- The live coach never records. Practice is saved as numbers only (minutes, notes, % in tune).
- Students can't send messages. Teacher "cheers" are preset messages only.
- Playing tests (sound clips) are **off** until a district turns them on, which requires a signed privacy agreement. Clips are capped at 3 minutes, delete automatically (7/14/30 days), and turning the option off deletes every clip.
- Class music uploads require the teacher to confirm they have the rights.
- The app team's view of problem reports hides student identity and notes.
- Minimum student info: first name + last initial. No student email, phone, photo or location fields exist.

## Run it
```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + anon key (or leave blank for demo mode)
npm run dev
node tests/rls.test.mjs      # safety tests
```

## Before any real student uses it
1. School-law attorney reviews the app, privacy policy and terms.
2. District signs the student data privacy agreement (TX-NDPA in Texas); parents get the English/Spanish notice.
3. Supabase on the Pro plan (no auto-pausing), US region, MFA on every account.
4. Schedule `purge-expired` hourly (pg_cron + pg_net) with a `PURGE_SECRET`, and confirm it runs.
5. Replace test sign-in with school sign-in (Google / Clever / ClassLink).
6. A band director approves every lesson, tip and picture.

## Concept
Interactive concept: https://claude.ai/artifact/1thuJTAXBc4Wee13rfW16o
