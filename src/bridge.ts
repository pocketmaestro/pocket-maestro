// Pocket Maestro — connects the full app screens (index.html) to the protected Supabase database.
// The screens, sounds, coach and pictures all live in index.html. This file only:
//   • signs people in (emailed link, no open sign-ups),
//   • shows students only the student side and teachers the teacher side,
//   • swaps the sample data for real data the database allows this person to see,
//   • saves what should be saved (practice numbers, reports, tips, playing tests...).
// The database's own rules decide who can see what; this file can't widen that.
import { DEMO, supabase } from "./lib/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */
const w = window as any;
// Globals created by the main script in index.html
declare const CHECK: any, S: any, SS: any, PT: any, ROSTER: any[], NUDGE: any[], INSIGHTS: any[], SONGS: any, INST: any, SCALE: number[], I18N: any;
declare function T(k: string): any;
declare function esc(s: string): string;
declare function toast(s: string): void;

type Role = "student" | "teacher" | "district_admin";
type Me = { id: string; role: Role; name: string; lang: "en" | "es"; districtId: string | null; classIds: string[]; isAdmin: boolean };
let me: Me | null = null;
let ready = false;
const studentsById: Record<string, { name: string; inst: string; lang: string }> = {};
const L = (en: string, es: string) => (S.lang === "es" ? es : en);
const sb = () => supabase!;
const DAY = 864e5;

/* ───────────────────────── sign-in gate ───────────────────────── */
const gate = document.createElement("section");
gate.className = "view";
gate.id = "v-gate";
gate.innerHTML = `<div class="step" style="max-width:460px;margin:40px auto;text-align:center" id="gateBox"></div>`;
{ const first = document.querySelector("section.view")!; first.parentNode!.insertBefore(gate, first); }

function gateHTML(kind: "signin" | "sent" | "teacherOnly" | "noClass" | "loading") {
  const box = document.getElementById("gateBox")!;
  if (kind === "loading") box.innerHTML = `<p class="sub">${L("Loading…", "Cargando…")}</p>`;
  else if (kind === "sent") box.innerHTML = `<h2>✉️ ${L("Check your email", "Revisa tu correo")}</h2><p class="sub">${L("We sent you a sign-in link. Open it on this device.", "Te enviamos un enlace para entrar. Ábrelo en este dispositivo.")}</p>`;
  else if (kind === "teacherOnly") box.innerHTML = `<h2>🔒 ${L("For band directors", "Para directores de banda")}</h2><p class="sub">${L("This page is only for teachers.", "Esta página es solo para maestros.")}</p><a class="btn btn-navy" href="#student">${L("Go to my practice", "Ir a mi práctica")}</a>`;
  else if (kind === "noClass") box.innerHTML = `<h2>🎵 ${L("Almost ready", "Casi listo")}</h2><p class="sub">${L("Your band director hasn't added you to a class yet.", "Tu director de banda aún no te ha agregado a una clase.")}</p>`;
  else {
    box.innerHTML = `<h2>${L("Sign in", "Entrar")}</h2>
      <p class="sub">${L("Use the email your school gave you. We'll send you a sign-in link.", "Usa el correo que te dio tu escuela. Te enviaremos un enlace para entrar.")}</p>
      <input id="gateEmail" type="email" class="rp-text" style="width:100%;margin:8px 0" placeholder="${L("Email", "Correo")}" autocomplete="email">
      <button class="btn btn-navy" id="gateSend" style="width:100%">${L("Email me a sign-in link", "Envíame un enlace para entrar")}</button>
      <p class="warn" id="gateErr" style="margin:8px 0 0;color:var(--red)"></p>
      <p class="cap" style="margin:12px 0 0">🔒 ${L("No passwords. No public sign-ups. Only students and teachers your school adds can get in.", "Sin contraseñas. Sin registros públicos. Solo entran los alumnos y maestros que agrega tu escuela.")}</p>`;
  }
}
async function sendLink() {
  const email = (document.getElementById("gateEmail") as HTMLInputElement).value.trim();
  const err = document.getElementById("gateErr")!;
  if (!email) return;
  err.textContent = "";
  const { error } = await sb().auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + "/#student" } });
  if (!error) return gateHTML("sent");
  err.textContent = /signups not allowed|not found|user/i.test(error.message)
    ? L("That email isn't set up yet. Ask your band director.", "Ese correo aún no está registrado. Pregúntale a tu director de banda.")
    : /rate limit/i.test(error.message)
      ? L("Too many emails just now. Please try again in a little while.", "Demasiados correos ahora. Inténtalo de nuevo en un rato.")
      : error.message;
}

/* Header: who's signed in + sign out */
const who = document.createElement("span");
who.className = "cap";
who.style.cssText = "margin:0 6px;color:#fff;opacity:.9;white-space:nowrap";
document.getElementById("a11yBtn")!.before(who);
function renderWho() {
  who.innerHTML = me ? `${esc(me.name)} · <a href="#" id="pmOut" style="color:#fff;text-decoration:underline">${L("Sign out", "Salir")}</a>` : DEMO ? L("Demo", "Demo") : `<a href="#student" style="color:#fff;text-decoration:underline">${L("Sign in", "Entrar")}</a>`;
  const navT = document.querySelector('nav a[data-v="teacher"]') as HTMLElement | null;
  if (navT) navT.style.display = me?.role === "student" ? "none" : "";
}

/* Route guard: student/teacher pages need the right person signed in */
const origRoute = w.route;
w.route = function () {
  origRoute();
  if (DEMO) return;
  const v = (location.hash || "#home").slice(1);
  if (v !== "student" && v !== "teacher") { gate.classList.remove("on"); return; }
  let block: null | Parameters<typeof gateHTML>[0] = null;
  if (!ready) block = "loading";
  else if (!me) block = "signin";
  else if (v === "teacher" && me.role === "student") block = "teacherOnly";
  else if (v === "student" && me.role === "student" && !me.classIds.length) block = "noClass";
  document.querySelectorAll(".view").forEach((s) => s.classList.toggle("on", block ? s === gate : s.id === "v-" + v));
  if (block) gateHTML(block);
};

window.addEventListener("hashchange", () => w.route());

/* ───────────────────────── loading real data ───────────────────────── */
async function loadMe(): Promise<Me | null> {
  const { data: { user } } = await sb().auth.getUser();
  if (!user) return null;
  const { data: p } = await sb().from("profiles").select("id, role, display_name, language, district_id").eq("id", user.id).single();
  if (!p) return null;
  const role = p.role as Role;
  let classIds: string[] = [];
  if (role === "student") {
    const { data } = await sb().from("class_students").select("class_id, instrument, level").eq("student_id", p.id);
    classIds = (data ?? []).map((r: any) => r.class_id);
    if (data?.[0] && INST[data[0].instrument]) S.inst = data[0].instrument;
  } else {
    const { data } = await sb().from("class_teachers").select("class_id").eq("teacher_id", p.id);
    classIds = (data ?? []).map((r: any) => r.class_id);
  }
  const { data: adm } = await sb().from("district_admins").select("district_id").eq("user_id", p.id);
  return { id: p.id, role, name: p.display_name, lang: p.language, districtId: p.district_id, classIds, isAdmin: !!adm?.length };
}

async function loadDistrict() {
  if (!me?.districtId) return;
  const { data: d } = await sb().from("districts").select("*").eq("id", me.districtId).single();
  if (!d) return;
  Object.assign(S.opt, { pt: d.playing_tests, summ: d.practice_summaries, cheer: d.teacher_cheers, home: d.home_use, parent: d.parent_updates, summer: d.summer_mode });
  S.ptDays = d.playing_test_days;
}

async function signedUrl(bucket: string, path: string) {
  const { data } = await sb().storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

async function loadTips(teacherIds: string[] | null) {
  let q = sb().from("director_tips").select("teacher_id, issue, tip_text, audio_path");
  if (teacherIds) q = q.in("teacher_id", teacherIds);
  const { data } = await q;
  S.dtips = {};
  for (const t of data ?? []) {
    if (S.dtips[t.issue]) continue;
    S.dtips[t.issue] = { text: t.tip_text, url: t.audio_path ? await signedUrl("director-tips", t.audio_path) : null, path: t.audio_path };
  }
}

function addSongFromXml(title: string, xml: string) {
  try {
    const parsed = w.parseMusicXML(xml, title);
    const k = "up" + (Object.keys(S.upTitles).length + 1);
    SONGS[k] = parsed.notes; S.upTitles[k] = parsed.title;
    S.cmList.push({ title: parsed.title, kind: "xml", n: parsed.notes.filter((x: any) => x[0] != null).length });
  } catch { /* a broken file shouldn't stop the app */ }
}
async function loadClassMusicAndAssignments() {
  if (!me?.classIds.length) return;
  Object.keys(S.upTitles).forEach((k) => { delete SONGS[k]; }); S.upTitles = {}; S.cmList = [];
  const { data: music } = await sb().from("class_music").select("title, musicxml, created_at").in("class_id", me.classIds).order("created_at");
  (music ?? []).forEach((m: any) => addSongFromXml(m.title, m.musicxml));
  const { data: asg } = await sb().from("assignments").select("title, song_ref, tempo, demo_video_path, created_at").in("class_id", me.classIds).order("created_at", { ascending: false }).limit(10);
  const vid = (asg ?? []).find((a: any) => a.demo_video_path);
  S.demoUrl = vid ? await signedUrl("demo-videos", vid.demo_video_path) : null;
  const song = (asg ?? []).find((a: any) => a.song_ref);
  if (song && me.role === "student") {
    if (SONGS[song.song_ref]) S.song = song.song_ref;
    if (song.tempo) S.tempo = song.tempo;
    S._assigned = song.title;
  }
}

async function loadStudent() {
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const { data: ses } = await sb().from("practice_sessions").select("started_at, seconds").eq("student_id", me!.id).gte("started_at", since);
  const days = [0, 0, 0, 0, 0, 0, 0];
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  for (const s of ses ?? []) {
    const d = new Date(s.started_at); d.setHours(0, 0, 0, 0);
    const ago = Math.round((+today0 - +d) / DAY);
    if (ago >= 0 && ago < 7) days[6 - ago] += s.seconds;
  }
  S.pastDays = days.slice(0, 6).map((x) => Math.floor(x / 60));
  S.todaySecs = days[6];
  const { data: nm } = await sb().from("note_mastery").select("pitch_class, in_tune_hits").eq("student_id", me!.id).eq("instrument", S.inst);
  S.hits = {};
  (nm ?? []).forEach((r: any) => { S.hits[r.pitch_class] = r.in_tune_hits; });
  await loadTips(null);
  S.dirName = L("Your director", "Tu director");
  const { data: ch } = await sb().from("cheers").select("message_key, created_at").eq("student_id", me!.id).gte("created_at", since).order("created_at", { ascending: false }).limit(1);
  if (ch?.[0]) S._cheer = ch[0].message_key;
}

const ISSUE_FLAG: Record<string, { en: string; es: string }> = {
  flat: { en: "Often low (flat). The coach is working on air support.", es: "A menudo bajo. El entrenador trabaja el apoyo de aire." },
  sharp: { en: "Often high (sharp). The coach is reminding them to relax.", es: "A menudo alto. El entrenador le recuerda relajarse." },
  wobble: { en: "Notes wobble. The coach is working on steady air or bow.", es: "Las notas tiemblan. El entrenador trabaja el aire o arco constante." },
};
const FAMILY_ICON: Record<string, string> = { brass: "🎺", reed: "🎷", flute: "🎶", string: "🎻", perc: "🥁" };
let teacherMastery: Record<string, number> = {};

async function loadTeacher() {
  const ids = me!.classIds;
  ROSTER.length = 0; NUDGE.length = 0; INSIGHTS.length = 0; S.reports = []; S.ptSubs = []; teacherMastery = {};
  for (const k of Object.keys(studentsById)) delete studentsById[k];
  if (!ids.length) { await loadTips([me!.id]); return; }
  const { data: cs } = await sb().from("class_students").select("student_id, instrument, level").in("class_id", ids);
  const sids = [...new Set((cs ?? []).map((r: any) => r.student_id))];
  const { data: profs } = sids.length ? await sb().from("profiles").select("id, display_name, language").in("id", sids) : { data: [] as any[] };
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const { data: ses } = sids.length ? await sb().from("practice_sessions").select("student_id, seconds, notes_played, notes_in_tune, top_issue, started_at").in("student_id", sids).gte("started_at", since) : { data: [] as any[] };
  const { data: nm } = sids.length ? await sb().from("note_mastery").select("student_id, pitch_class, in_tune_hits").in("student_id", sids) : { data: [] as any[] };
  const scalePcs = new Set(SCALE.map((m) => ((m % 12) + 12) % 12));
  (nm ?? []).forEach((r: any) => { if (r.in_tune_hits >= 3 && scalePcs.has(r.pitch_class)) teacherMastery[r.student_id] = (teacherMastery[r.student_id] || 0) + 1; });

  const famIssues: Record<string, { n: number; total: number; issue: Record<string, number> }> = {};
  for (const r of cs ?? []) {
    const p = (profs ?? []).find((x: any) => x.id === r.student_id);
    const name = p?.display_name ?? "Student";
    const inst = INST[r.instrument] ? r.instrument : "trumpet";
    studentsById[r.student_id] = { name, inst, lang: p?.language ?? "en" };
    const mine = (ses ?? []).filter((s: any) => s.student_id === r.student_id);
    const secs = mine.reduce((a: number, s: any) => a + s.seconds, 0);
    const played = mine.reduce((a: number, s: any) => a + s.notes_played, 0);
    const good = mine.reduce((a: number, s: any) => a + s.notes_in_tune, 0);
    const counts: Record<string, number> = {};
    mine.forEach((s: any) => { if (s.top_issue) counts[s.top_issue] = (counts[s.top_issue] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const tune = played ? Math.round((good / played) * 100) : null;
    const min = Math.floor(secs / 60);
    let flag = { en: "On track this week.", es: "Va bien esta semana." }, c = "g";
    if (!mine.length) { flag = { en: "No practice logged this week.", es: "Sin práctica registrada esta semana." }; c = "r"; }
    else if (tune != null && tune < 80 && top) { flag = ISSUE_FLAG[top]; c = "y"; }
    else if (!played) { flag = { en: "Practiced, but no notes heard yet.", es: "Practicó, pero aún no se escucharon notas." }; c = "y"; }
    ROSTER.push({ id: r.student_id, lv: r.level, n: name, i: inst, min, tune, flag, c, detune: 0, lang: p?.language ?? "en" });
    if (!mine.length) NUDGE.push({ n: name, d: 7, id: r.student_id });
    const fam = INST[inst].fam;
    famIssues[fam] ??= { n: 0, total: 0, issue: {} };
    famIssues[fam].total++;
    if (top && tune != null && tune < 80) { famIssues[fam].n++; famIssues[fam].issue[top] = (famIssues[fam].issue[top] || 0) + 1; }
  }
  for (const [fam, f] of Object.entries(famIssues)) {
    const top = Object.entries(f.issue).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!top) continue;
    const why = top === "wobble" ? { en: "Most likely cause: air (or bow) not steady.", es: "Causa más probable: aire (o arco) no constante." } : top === "flat" ? { en: "Most likely cause: slow air.", es: "Causa más probable: aire lento." } : { en: "Most likely cause: pinching or blowing too hard.", es: "Causa más probable: apretar o soplar muy fuerte." };
    const word = { flat: ["low (flat)", "bajos"], sharp: ["high (sharp)", "altos"], wobble: ["wobbly", "inestables"] }[top]!;
    INSIGHTS.push({ ic: FAMILY_ICON[fam] ?? "🎵", en: [`${fam[0].toUpperCase() + fam.slice(1)}: often ${word[0]}`, `${f.n} of ${f.total} students. ${why.en}`, "Try: long tones with a tuner in warm-up."], es: [`${fam}: a menudo ${word[1]}`, `${f.n} de ${f.total} alumnos. ${why.es}`, "Prueba: notas largas con afinador en el calentamiento."] });
  }
  if (!INSIGHTS.length) INSIGHTS.push({ ic: "📭", en: ["No class patterns yet", "When your students practice, the most common problems show up here.", ""], es: ["Aún no hay patrones", "Cuando tus alumnos practiquen, los problemas más comunes aparecerán aquí.", ""] });

  const { data: reps } = await sb().from("problem_reports").select("id, student_id, kind, note, device, screen, status, created_at").in("class_id", ids).order("created_at", { ascending: false }).limit(50);
  const kinds = ["sound", "froze", "feedback", "other", "instrument"], steps = T("pipe").length;
  S.reports = (reps ?? []).map((r: any) => ({
    id: r.id, who: studentsById[r.student_id]?.name ?? "Student", type: Math.max(0, kinds.indexOf(r.kind)), text: r.note ?? "", dev: r.device ?? "", scr: r.screen || "coach",
    state: r.status === "new" ? "new" : r.status === "teacher_helped" ? "help" : "fix", step: r.status === "fixed" ? steps : r.status === "sent_to_app_team" ? 1 : 0,
  }));

  const { data: pts } = await sb().from("playing_tests").select("id, student_id, audio_path, grade, delete_after, created_at").in("class_id", ids).order("created_at", { ascending: false });
  for (const t of pts ?? []) {
    const days = Math.max(1, Math.ceil((+new Date(t.delete_after) - Date.now()) / DAY));
    S.ptSubs.push({ id: t.id, path: t.audio_path, who: studentsById[t.student_id]?.name ?? "Student", inst: studentsById[t.student_id]?.inst ?? "trumpet", url: await signedUrl("playing-tests", t.audio_path), blob: null, grade: t.grade, days });
  }
  await loadTips([me!.id]);
  S.dirName = me!.name;
  S.puWho = 0;
}

/* Teacher screens that used sample data now use the real roster */
w.renderParent = function () {
  if (!document.getElementById("parentCard")) return;
  const sel = document.getElementById("puWho") as HTMLSelectElement, msg = document.getElementById("puMsg")!, lang = document.getElementById("puLang")!;
  if (!ROSTER.length) { sel.innerHTML = ""; msg.textContent = L("No students in your class yet.", "Aún no hay alumnos en tu clase."); lang.textContent = ""; return; }
  if (!ROSTER[S.puWho]) S.puWho = 0;
  sel.innerHTML = ROSTER.map((r, i) => `<option value="${i}" ${i === S.puWho ? "selected" : ""}>${esc(r.n)}</option>`).join("");
  if (!S.opt.parent) { msg.textContent = T("pu_off"); lang.textContent = ""; return; }
  const r = ROSTER[S.puWho], Lg = r.lang === "es" ? "es" : "en", D = I18N[Lg], first = r.n.split(" ")[0];
  lang.textContent = T("pu_lang") + " " + (Lg === "es" ? "Español" : "English");
  const win = r.min >= 15 ? (Lg === "es" ? `practicó ${r.min} minutos esta semana.` : `practiced ${r.min} minutes this week.`) : null;
  msg.textContent = (win ? D.pu_msg.replace(/{n}/g, first).replace("{m}", r.min).replace("{w}", win) : D.pu_msg_restart.replace(/{n}/g, first)) + "\n— " + S.dirName;
};
w.gradesCSV = function () {
  return [T("gr_head")].concat(ROSTER.map((r) => [r.n, INST[r.i][S.lang], T(r.lv >= 2 ? "lvl2" : "lvl1"), r.min, r.tune == null ? "" : r.tune + "%", (teacherMastery[r.id] || 0) + "/8"].join(","))).join("\n");
};
const origRenderRoster = w.renderRoster;
w.renderRoster = function () {
  origRenderRoster();
  const cap = document.querySelector('[data-i18n="showing"]');
  if (cap && me && !DEMO) cap.textContent = L(`${ROSTER.length} student${ROSTER.length === 1 ? "" : "s"} in your class${me.classIds.length > 1 ? "es" : ""}`, `${ROSTER.length} alumno${ROSTER.length === 1 ? "" : "s"} en tu clase`);
  if (!ROSTER.length && me) document.getElementById("roster")!.innerHTML = `<tr><td colspan="5" class="sub">${L("No students yet. Students appear here once they're added to your class.", "Aún no hay alumnos.")}</td></tr>`;
};
const origApplyText = w.applyText;
w.applyText = function () { origApplyText(); renderWho(); if (me && !DEMO) w.renderRoster(); };

/* ───────────────────────── saving ───────────────────────── */
async function save(what: string, p: PromiseLike<{ error: any }>) {
  const { error } = await p;
  if (error) { console.error(what, error); toast(L("Couldn't save. Check your connection and try again.", "No se pudo guardar. Revisa tu conexión e inténtalo otra vez.")); return false; }
  return true;
}
const isStudent = () => !!me && me.role === "student" && me.classIds.length > 0;
const isTeacher = () => !!me && me.role !== "student";

// Practice coach: save numbers only (never sound) when a session ends
let hitsAtStart: Record<number, number> = {};
const origStart = w.startSession;
w.startSession = function (...a: any[]) { hitsAtStart = { ...S.hits }; return origStart.apply(this, a); };
const origStop = w.stopSession;
w.stopSession = function (...a: any[]) {
  const was = SS.on, st = was ? { ...SS.stats } : null;
  const r = origStop.apply(this, a);
  if (was && st && isStudent() && st.secs > 0) saveSession(st.secs, st.notes, st.good, w.topIssue(st));
  return r;
};
async function saveSession(secs: number, notes: number, good: number, top: string | null) {
  for (let left = secs; left > 0; left -= 900) {
    await save("practice", sb().from("practice_sessions").insert({ student_id: me!.id, class_id: me!.classIds[0], instrument: S.inst, seconds: Math.min(900, left), notes_played: left === secs ? notes : 0, notes_in_tune: left === secs ? good : 0, top_issue: left === secs ? top : null }));
  }
  const changed = Object.keys(S.hits).filter((k) => S.hits[k] !== hitsAtStart[+k]);
  if (changed.length) await save("mastery", sb().from("note_mastery").upsert(changed.map((k) => ({ student_id: me!.id, instrument: S.inst, pitch_class: +k, in_tune_hits: S.hits[k] }))));
}

// Every button the app has; we save first, then let the screen update as before
let timerStartSecs = 0;
document.addEventListener("click", async (e) => {
  if (DEMO) return;
  const t = e.target as HTMLElement;
  if (t.closest("#gateSend")) { e.preventDefault(); sendLink(); return; }
  if (t.closest("#pmOut")) { e.preventDefault(); await sb().auth.signOut(); return; }
  const b = t.closest("button") as HTMLButtonElement | null;
  if (!b || !me) return;
  const d = b.dataset;

  // ── student ──
  if (b.id === "rpSend" && isStudent()) {
    const note = (document.getElementById("rpText") as HTMLTextAreaElement).value.trim().slice(0, 200);
    save("report", sb().from("problem_reports").insert({ class_id: me.classIds[0], student_id: me.id, kind: ["sound", "froze", "feedback", "other", "instrument"][S.rpType] ?? "other", note: note || null, device: w.deviceInfo().slice(0, 80), screen: "coach" }));
  } else if (d.cknot && isStudent()) {
    const item = CHECK[w.ckFam()][S.ck];
    save("report", sb().from("problem_reports").insert({ class_id: me.classIds[0], student_id: me.id, kind: "instrument", note: String(item.t[S.lang]).slice(0, 200), device: String(INST[S.inst].en).slice(0, 80), screen: "check" }));
  } else if (b.id === "ptSend" && isStudent() && PT.blob) {
    const blob: Blob = PT.blob, ext = /wav/.test(blob.type) ? "wav" : /ogg/.test(blob.type) ? "ogg" : /mp4|aac|m4a/.test(blob.type) ? "m4a" : "webm";
    const secs = Math.max(1, Math.min(180, 180 - PT.left || 1));
    const path = `${me.classIds[0]}/${me.id}/${Date.now()}.${ext}`;
    const up = await sb().storage.from("playing-tests").upload(path, blob, { contentType: blob.type || "audio/webm" });
    if (up.error) { toast(L("Couldn't send the recording. Try again.", "No se pudo enviar la grabación. Inténtalo otra vez.")); return; }
    save("playing test", sb().from("playing_tests").insert({ student_id: me.id, class_id: me.classIds[0], audio_path: path, seconds: secs, delete_after: new Date().toISOString() }));
  } else if (b.id === "timerBtn" && isStudent()) {
    if (!S.timerOn) timerStartSecs = S.secs; // turning on
    else { const s = S.secs - timerStartSecs; if (s > 0) saveSession(s, 0, 0, null); } // turning off
  }

  // ── teacher ──
  else if (isTeacher()) {
    if (d.rpaction) {
      const r = S.reports[+d.i!];
      if (d.rpaction === "night") { e.stopPropagation(); toast(L("The app team reviews it, tests a fix, and a person approves it before it goes live. You'll see it marked fixed here.", "El equipo la revisa, prueba un arreglo y una persona lo aprueba antes de publicarlo.")); return; }
      if (r?.id) save("report", sb().from("problem_reports").update({ status: d.rpaction === "help" ? "teacher_helped" : "sent_to_app_team" }).eq("id", r.id));
    } else if (d.cheer !== undefined) {
      const n = NUDGE[+d.cheer];
      if (n?.id) save("cheer", sb().from("cheers").insert({ teacher_id: me.id, student_id: n.id, message_key: "miss_you" }));
    } else if (b.id === "sendBtn" && me.classIds[0]) {
      save("assignment", sb().from("assignments").insert({ class_id: me.classIds[0], title: w.songLabel(S.song), song_ref: S.song, tempo: S.tempo, created_by: me.id }));
    } else if (b.id === "attachBtn" && S.pendingUrl && me.classIds[0]) {
      const blob = await (await fetch(S.pendingUrl)).blob();
      if (blob.size > 50e6) { e.stopPropagation(); toast(L("That video is too big (50 MB max). Try a shorter clip.", "Ese video es muy grande (máx. 50 MB).")); return; }
      const path = `${me.classIds[0]}/${Date.now()}.${(blob.type.split("/")[1] || "mp4").replace("quicktime", "mov")}`;
      const up = await sb().storage.from("demo-videos").upload(path, blob, { contentType: blob.type || "video/mp4" });
      if (up.error) { toast(L("Couldn't upload the video.", "No se pudo subir el video.")); return; }
      save("video", sb().from("assignments").insert({ class_id: me.classIds[0], title: "Demo video", demo_video_path: path, created_by: me.id }));
    } else if (b.id === "dtSave") {
      const text = (document.getElementById("dtText") as HTMLTextAreaElement).value.trim().slice(0, 200), issue = S.dtSel, pending = S.dtPending;
      if (!text) return;
      let audio_path = S.dtips[issue]?.path ?? null;
      if (pending) {
        const blob = await (await fetch(pending)).blob();
        audio_path = `${me.id}/${issue}-${Date.now()}.${(blob.type.split("/")[1] || "webm").split(";")[0]}`;
        const up = await sb().storage.from("director-tips").upload(audio_path, blob, { contentType: blob.type || "audio/webm" });
        if (up.error) { toast(L("Couldn't upload your recording.", "No se pudo subir tu grabación.")); audio_path = null; }
      }
      await save("tip", sb().from("director_tips").upsert({ teacher_id: me.id, issue, tip_text: text, audio_path }, { onConflict: "teacher_id,issue" }));
      if (S.dtips[issue]) S.dtips[issue].path = audio_path;
    } else if (d.ptgrade) {
      const x = S.ptSubs[+d.i!];
      if (x?.id) save("grade", sb().from("playing_tests").update({ grade: d.ptgrade }).eq("id", x.id));
    } else if (d.ptdel !== undefined) {
      const x = S.ptSubs[+d.ptdel];
      if (x?.id) { await sb().storage.from("playing-tests").remove([x.path]); save("delete", sb().from("playing_tests").delete().eq("id", x.id)); }
    } else if (d.opt) {
      if (!me.isAdmin) { e.stopPropagation(); toast(L("Only your district's administrator can change district options.", "Solo el administrador del distrito puede cambiar estas opciones.")); return; }
      if (d.opt === "pt" && !S.opt.pt) return; // turning ON goes through the agreement window first
      setTimeout(saveOpts, 0);
    } else if (b.id === "ptConfirm" && me.isAdmin && (document.getElementById("ptAgree") as HTMLInputElement).checked) {
      setTimeout(saveOpts, 0);
    }
  }
}, true);
document.addEventListener("change", (e) => { if ((e.target as HTMLElement).id === "ptDays" && me?.isAdmin) setTimeout(saveOpts, 0); });
async function saveOpts() {
  if (!me?.districtId) return;
  const ok = await save("options", sb().from("districts").update({ playing_tests: S.opt.pt, playing_tests_agreement_confirmed: S.opt.pt ? true : undefined, practice_summaries: S.opt.summ, teacher_cheers: S.opt.cheer, home_use: S.opt.home, parent_updates: S.opt.parent, summer_mode: S.opt.summer, playing_test_days: S.ptDays }).eq("id", me.districtId));
  if (!ok) await loadDistrict();
  w.renderOpts(); w.renderPT();
}

// Class music: when a teacher adds a song, save the file for their class only
let lastXml = "";
const origParse = w.parseMusicXML;
w.parseMusicXML = function (text: string, fallback: string) { lastXml = text; return origParse(text, fallback); };
const origAddSong = w.addClassSong;
w.addClassSong = function (parsed: any) {
  origAddSong(parsed);
  if (isTeacher() && me!.classIds[0] && lastXml) save("music", sb().from("class_music").insert({ class_id: me!.classIds[0], title: parsed.title, musicxml: lastXml, rights_confirmed: true, uploaded_by: me!.id }));
};

/* ───────────────────────── start ───────────────────────── */
async function boot() {
  if (DEMO) { ready = true; renderWho(); return; }
  w.route();
  me = await loadMe();
  if (me) {
    S.lang = (localStorage.getItem("pm_lang") as any) || me.lang || S.lang;
    await loadDistrict();
    await loadClassMusicAndAssignments();
    if (me.role === "student") await loadStudent(); else await loadTeacher();
    if (me.role !== "student" && !location.hash.match(/teacher|how|safety|try/)) location.hash = "#teacher";
    if (me.role === "student" && (!location.hash || location.hash === "#home")) location.hash = "#student";
  }
  ready = true;
  w.renderAll(); w.route();
  if (me?.role === "student") {
    if (S._assigned) toast(L(`Your director assigned: ${S._assigned}`, `Tu director asignó: ${S._assigned}`));
    else if (S._cheer) setTimeout(() => toast({ miss_you: L("Your director misses hearing you! 🎵", "¡Tu director extraña escucharte! 🎵"), great_week: L("Great week! 🎉", "¡Gran semana! 🎉"), keep_going: L("Keep going! 💪", "¡Sigue así! 💪"), proud_of_you: L("Your director is proud of you! ⭐", "¡Tu director está orgulloso de ti! ⭐") }[S._cheer as string] ?? ""), 400);
  }
}
let booted = false;
sb()?.auth.onAuthStateChange((ev) => {
  if (!booted) return;
  if ((ev === "SIGNED_IN" && !me) || (ev === "SIGNED_OUT" && me)) location.reload();
});
boot().then(() => { booted = true; });
