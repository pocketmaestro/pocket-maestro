import { useState } from "react";
import { DEMO } from "../lib/supabase";
import { signIn, type Role } from "../lib/data";
import { t, type Lang } from "../lib/i18n";

export default function Login({ lang, onIn }: { lang: Lang; onIn: (demoRole?: Role) => void }) {
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState("");
  if (DEMO) return (
    <section className="card center">
      <p className="muted">{t(lang, "demo")}</p>
      <div className="row"><button className="btn" onClick={() => onIn("student")}>Student demo</button><button className="btn alt" onClick={() => onIn("teacher")}>Teacher demo</button></div>
    </section>
  );
  return (
    <form className="card center" onSubmit={async (e) => { e.preventDefault(); const r = await signIn(email, pw); r.error ? setErr(r.error) : onIn(); }}>
      <h2>{t(lang, "signIn")}</h2>
      <input type="email" placeholder={t(lang, "email")} value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder={t(lang, "password")} value={pw} onChange={(e) => setPw(e.target.value)} required />
      {err && <p className="warn">{err}</p>}
      <button className="btn">{t(lang, "signIn")}</button>
    </form>
  );
}
