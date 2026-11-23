import { useEffect, useRef, useState } from "react";
import { yin, toNote } from "../lib/pitch";
import { COACH, INSTRUMENTS, WOBBLE, writtenName, type InstKey, type Issue } from "../lib/instruments";
import { t, type Lang } from "../lib/i18n";
import type { SessionSummary } from "../lib/data";

const MAX = 900; // 15 minutes, matches the daily goal
type Props = { lang: Lang; inst: InstKey; classId: string | null; onDone: (s: SessionSummary) => void };

export default function LiveCoach({ lang, inst, classId, onDone }: Props) {
  const [on, setOn] = useState(false);
  const [left, setLeft] = useState(MAX);
  const [heard, setHeard] = useState<{ name: string; cents: number } | null>(null);
  const [feed, setFeed] = useState<string[]>([]);
  const [focus, setFocus] = useState<Issue | null>(null);
  const [tipIdx, setTipIdx] = useState(0);
  const [report, setReport] = useState<SessionSummary | null>(null);
  const [err, setErr] = useState("");
  const r = useRef<{ stream?: MediaStream; ac?: AudioContext; an?: AnalyserNode; loop?: number; tick?: number; buf?: Float32Array<ArrayBuffer>;
    last?: number; run: number; cbuf: number[]; counted: boolean; secs: number; played: number; good: number; issues: Record<Issue, number> }>({
    run: 0, cbuf: [], counted: false, secs: 0, played: 0, good: 0, issues: { flat: 0, sharp: 0, wobble: 0 } });
  const fam = INSTRUMENTS[inst].family;

  const stop = () => {
    const s = r.current; if (!s.ac) return;
    clearInterval(s.loop); clearInterval(s.tick);
    s.stream?.getTracks().forEach((tr) => tr.stop()); s.ac.close(); s.ac = undefined;  // microphone released; nothing kept
    setOn(false);
    const top = (Object.entries(s.issues).sort((a, b) => b[1] - a[1])[0]);
    const summary: SessionSummary = { seconds: s.secs, notesPlayed: s.played, notesInTune: s.good, topIssue: top[1] ? (top[0] as Issue) : null, instrument: inst, classId };
    setReport(summary); onDone(summary);
  };
  useEffect(() => () => stop(), []);

  const start = async () => {
    setErr(""); setReport(null); setFeed([]); setFocus(null); setHeard(null);
    Object.assign(r.current, { run: 0, cbuf: [], counted: false, secs: 0, played: 0, good: 0, issues: { flat: 0, sharp: 0, wobble: 0 }, last: undefined });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      const ac = new AudioContext(), an = ac.createAnalyser(); an.fftSize = 4096;
      ac.createMediaStreamSource(stream).connect(an);  // analysed only — never recorded
      Object.assign(r.current, { stream, ac, an, buf: new Float32Array(4096) });
    } catch { setErr(t(lang, "noMic")); return; }
    setOn(true); setLeft(MAX);
    const s = r.current;
    s.loop = window.setInterval(() => {
      s.an!.getFloatTimeDomainData(s.buf!);
      const f = yin(s.buf!, s.ac!.sampleRate);
      if (f <= 0) { s.run = 0; s.last = undefined; s.counted = false; return; }
      const { midi, cents } = toNote(f);
      setHeard({ name: writtenName(midi, inst, lang), cents });
      if (midi === s.last) { s.run++; s.cbuf.push(cents); } else { s.last = midi; s.run = 1; s.counted = false; s.cbuf = [cents]; }
      if (s.run >= 5 && !s.counted) {
        s.counted = true; s.played++;
        const mean = s.cbuf.reduce((a, b) => a + b, 0) / s.cbuf.length;
        const sd = Math.sqrt(s.cbuf.reduce((a, b) => a + (b - mean) ** 2, 0) / s.cbuf.length);
        const name = writtenName(midi, inst, lang);
        let msg: string, issue: Issue | null = null;
        if (Math.abs(mean) > 15) { issue = mean < 0 ? "flat" : "sharp"; msg = `${issue === "flat" ? "⬇️" : "⬆️"} ${name} ${t(lang, issue === "flat" ? "low" : "high")}`; }
        else if (sd > 12 && fam !== "perc") { issue = "wobble"; msg = `〰️ ${name} ${t(lang, "wobbly")}`; }
        else { s.good++; msg = `✅ ${name}: ${t(lang, "inTune")}`; }
        if (issue) { s.issues[issue]++; const top = Object.entries(s.issues).sort((a, b) => b[1] - a[1])[0][0] as Issue; setFocus((f0) => (f0 === top ? f0 : (setTipIdx(0), top))); }
        setFeed((fd) => [msg, ...fd].slice(0, 4));
      }
    }, 100);
    s.tick = window.setInterval(() => { s.secs++; setLeft((l) => { if (l <= 1) { stop(); return 0; } return l - 1; }); }, 1000);
  };

  const advice = focus ? (focus === "wobble" ? WOBBLE[lang] : COACH[fam][lang][focus]) : null;
  const mmss = (x: number) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`;
  return (
    <section className="card">
      <h2>{t(lang, "coach")}</h2>
      <div className="lock">{t(lang, "soundOnly")}</div>
      <div className="row">
        <button className={on ? "btn stop" : "btn"} onClick={on ? stop : start}>{on ? t(lang, "stop") : t(lang, "start")}</button>
        {on && <span className="live"><i /> {t(lang, "listening")} · {mmss(left)} {t(lang, "left")}</span>}
      </div>
      {err && <p className="warn">{err}</p>}
      {on && heard && <div className="heard">{t(lang, "heard")}: <b>{heard.name}</b> <small>{heard.cents > 0 ? "+" : ""}{heard.cents}</small></div>}
      {advice && (
        <div className="focus"><b>🎯 {t(lang, "focus")}</b>
          <p className="muted">{t(lang, "why")} {advice.why}</p>
          <p><b>{t(lang, "tryThis")}</b> {advice.tips[tipIdx % advice.tips.length]}</p>
          {advice.tips.length > 1 && <button className="small" onClick={() => setTipIdx((i) => i + 1)}>{t(lang, "nextTip")}</button>}
        </div>
      )}
      <ul className="feed">{feed.map((f, i) => <li key={i}>{f}</li>)}</ul>
      {report && (
        <div className="report"><b>{t(lang, "report")}</b>
          <div className="stats"><span><b>{mmss(report.seconds)}</b> {t(lang, "played")}</span><span><b>{report.notesPlayed}</b> {t(lang, "notes")}</span>
            <span><b>{report.notesPlayed ? Math.round((report.notesInTune / report.notesPlayed) * 100) : 0}%</b> {t(lang, "tuned")}</span></div>
          <p className="muted">🔒 {t(lang, "saved")}</p>
        </div>
      )}
    </section>
  );
}
