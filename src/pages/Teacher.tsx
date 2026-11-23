import { useEffect, useState } from "react";
import { INSTRUMENTS } from "../lib/instruments";
import { t } from "../lib/i18n";
import { myRoster, type Me, type RosterRow } from "../lib/data";

export default function Teacher({ me }: { me: Me }) {
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  useEffect(() => { myRoster().then(setRows); }, []);
  return (
    <>
      <h1>{t(me.lang, "hello")}, {me.name}</h1>
      <section className="card">
        <h2>{t(me.lang, "myClasses")}</h2>
        <p className="muted">🔒 {t(me.lang, "teacherNote")}</p>
        <table>
          <thead><tr><th>{t(me.lang, "student")}</th><th>{t(me.lang, "instrument")}</th><th>{t(me.lang, "minutes")}</th><th>{t(me.lang, "tune")}</th></tr></thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td><td>{INSTRUMENTS[r.instrument].emoji} {INSTRUMENTS[r.instrument][me.lang]}</td>
                <td>{r.minutes || <span className="muted">{t(me.lang, "noData")}</span>}</td>
                <td>{r.tunePct == null ? "—" : <span className={r.tunePct >= 80 ? "pill good" : "pill ok"}>{r.tunePct}%</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
