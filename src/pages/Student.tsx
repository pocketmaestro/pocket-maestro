import { useEffect, useState } from "react";
import LiveCoach from "./LiveCoach";
import { INSTRUMENTS } from "../lib/instruments";
import { t } from "../lib/i18n";
import { myWeekMinutes, saveSession, type Me } from "../lib/data";

export default function Student({ me }: { me: Me }) {
  const [week, setWeek] = useState<number | null>(null);
  const refresh = () => myWeekMinutes(me).then(setWeek);
  useEffect(() => { refresh(); }, []);
  const inst = INSTRUMENTS[me.instrument];
  return (
    <>
      <h1>{t(me.lang, "hello")}, {me.name}! {inst.emoji} <small className="muted">{inst[me.lang]}</small></h1>
      <LiveCoach lang={me.lang} inst={me.instrument} classId={me.classId} onDone={async (s) => { await saveSession(me, s); refresh(); }} />
      <section className="card">
        <h2>{t(me.lang, "progress")}</h2>
        <div className="lock">{t(me.lang, "onlyYou")}</div>
        <p className="big">{week ?? "…"} <span className="muted">{t(me.lang, "thisWeek")}</span></p>
      </section>
    </>
  );
}
