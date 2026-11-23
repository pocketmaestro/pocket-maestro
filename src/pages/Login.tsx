import { useState } from "react";
import { DEMO } from "../lib/supabase";
import { signIn, sendLink, type Role } from "../lib/data";
import { t, type Lang } from "../lib/i18n";

export default function Login({ lang, onIn }: { lang: Lang; onIn: (demoRole?: Role) => void }) {
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState(""), [sent, setSent] = useState(false), [usePw, setUsePw] = useState(false);
  if (DEMO) return (
    <section className="card center">
      <p className="muted">{t(lang, "demo")}</p>
      <div className="row"><button className="btn" onClick={() => onIn("student")}>Student demo</button><button className="btn alt" onClick={() => onIn("teacher")}>Teacher demo</button></div>
    </section>
  );
  if (sent) return <section className="card center"><h2>✉️</h2><p>{t(lang, "linkSent")}</p></section>;
  return (
    <form className="card center" onSubmit={async (e) => {
      e.preventDefault(); setErr("");
      if (usePw) { const r = await signIn(email, pw); r.error ? setErr(r.error) : onIn(); }
      else { const r = await sendLink(email); r.error ? setErr(r.error) : setSent(true); }
    }}>
      <h2>{t(lang, "signIn")}</h2>
      <input type="email" placeholder={t(lang, "email")} value={email} onChange={(e) => setEmail(e.target.value)} required />
      {usePw && <input type="password" placeholder={t(lang, "password")} value={pw} onChange={(e) => setPw(e.target.value)} required />}
      {err && <p className="warn">{err}</p>}
      <button className="btn">{usePw ? t(lang, "signIn") : t(lang, "sendLink")}</button>
      {!usePw && <button type="button" className="small" onClick={() => setUsePw(true)}>{t(lang, "orPassword")}</button>}
    </form>
  );
}
