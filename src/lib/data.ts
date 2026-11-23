// All reads/writes go through here. In demo mode (no Supabase keys yet) it uses made-up data in memory.
import { DEMO, supabase } from "./supabase";
import type { InstKey, Issue } from "./instruments";

export type Role = "student" | "teacher" | "district_admin";
export type Me = { id: string; role: Role; name: string; lang: "en" | "es"; instrument: InstKey; classId: string | null };
export type SessionSummary = { seconds: number; notesPlayed: number; notesInTune: number; topIssue: Issue | null; instrument: InstKey; classId: string | null };
export type RosterRow = { id: string; name: string; instrument: InstKey; minutes: number; tunePct: number | null };

const demoSessions: (SessionSummary & { studentId: string; at: number })[] = [];
const DEMO_STUDENTS: RosterRow[] = [
  { id: "s1", name: "Maya R.", instrument: "flute", minutes: 94, tunePct: 91 },
  { id: "s2", name: "Diego M.", instrument: "trumpet", minutes: 72, tunePct: 68 },
  { id: "s3", name: "Ava T.", instrument: "clarinet", minutes: 65, tunePct: 82 },
  { id: "s4", name: "Jayden W.", instrument: "trombone", minutes: 58, tunePct: 61 },
  { id: "s5", name: "Sofía G.", instrument: "sax", minutes: 77, tunePct: 88 },
  { id: "s6", name: "Liam P.", instrument: "perc", minutes: 0, tunePct: null },
];

export async function signIn(email: string, password: string) {
  if (DEMO) return { error: null };
  const { error } = await supabase!.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}
/** Emails a one-time sign-in link. Only people already added by the school can use it (no open sign-ups). */
export async function sendLink(email: string) {
  if (DEMO) return { error: null };
  const { error } = await supabase!.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: window.location.origin } });
  return { error: error?.message ?? null };
}
export async function signOut() { if (!DEMO) await supabase!.auth.signOut(); }

export async function loadMe(demoRole?: Role): Promise<Me | null> {
  if (DEMO) return demoRole ? { id: demoRole === "student" ? "s2" : "t1", role: demoRole, name: demoRole === "student" ? "Diego" : "Mr. J", lang: "en", instrument: "trumpet", classId: "demo" } : null;
  const { data: { user } } = await supabase!.auth.getUser();
  if (!user) return null;
  const { data: p } = await supabase!.from("profiles").select("id, role, display_name, language").eq("id", user.id).single();
  if (!p) return null;
  const { data: cs } = await supabase!.from("class_students").select("class_id, instrument").eq("student_id", user.id).limit(1);
  return { id: p.id, role: p.role, name: p.display_name, lang: p.language, instrument: (cs?.[0]?.instrument ?? "trumpet") as InstKey, classId: cs?.[0]?.class_id ?? null };
}

/** Saves ONLY numbers from a coach session. No audio exists to save. */
export async function saveSession(me: Me, s: SessionSummary) {
  if (DEMO) { demoSessions.push({ ...s, studentId: me.id, at: Date.now() }); return; }
  await supabase!.from("practice_sessions").insert({
    student_id: me.id, class_id: s.classId, instrument: s.instrument, seconds: Math.min(900, Math.round(s.seconds)),
    notes_played: s.notesPlayed, notes_in_tune: s.notesInTune, top_issue: s.topIssue,
  });
}

export async function myWeekMinutes(me: Me): Promise<number> {
  const since = Date.now() - 7 * 864e5;
  if (DEMO) return 42 + Math.round(demoSessions.filter((x) => x.studentId === me.id && x.at > since).reduce((a, x) => a + x.seconds, 0) / 60);
  const { data } = await supabase!.from("practice_sessions").select("seconds").eq("student_id", me.id).gte("started_at", new Date(since).toISOString());
  return Math.round((data ?? []).reduce((a, r) => a + r.seconds, 0) / 60);
}

/** Teacher view: the database only returns students in classes this teacher teaches. */
export async function myRoster(): Promise<RosterRow[]> {
  if (DEMO) return DEMO_STUDENTS;
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: roster } = await supabase!.from("class_students").select("student_id, instrument, profiles(display_name)");
  const { data: sess } = await supabase!.from("practice_sessions").select("student_id, seconds, notes_played, notes_in_tune").gte("started_at", since);
  return (roster ?? []).map((r: any) => {
    const mine = (sess ?? []).filter((s) => s.student_id === r.student_id);
    const played = mine.reduce((a, s) => a + s.notes_played, 0), good = mine.reduce((a, s) => a + s.notes_in_tune, 0);
    return { id: r.student_id, name: r.profiles?.display_name ?? "—", instrument: r.instrument, minutes: Math.round(mine.reduce((a, s) => a + s.seconds, 0) / 60), tunePct: played ? Math.round((good / played) * 100) : null };
  });
}
