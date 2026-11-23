import { useEffect, useState } from "react";
import Login from "./pages/Login";
import Student from "./pages/Student";
import Teacher from "./pages/Teacher";
import { loadMe, signOut, type Me, type Role } from "./lib/data";
import { DEMO, supabase } from "./lib/supabase";
import { t, type Lang } from "./lib/i18n";

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [lang, setLang] = useState<Lang>("en");
  const load = async (demoRole?: Role) => setMe(await loadMe(demoRole));
  useEffect(() => {
    load();
    if (!DEMO) { const { data } = supabase!.auth.onAuthStateChange(() => load()); return () => data.subscription.unsubscribe(); }
  }, []);
  const L = (me?.lang ?? lang) as Lang;
  const view = me ? { ...me, lang: L } : null;
  return (
    <>
      <header>
        <div className="brand"><span className="logo">🎵</span> Pocket Maestro</div>
        <select value={L} onChange={(e) => { const v = e.target.value as Lang; setLang(v); if (me) setMe({ ...me, lang: v }); }} aria-label="Language">
          <option value="en">English</option><option value="es">Español</option>
        </select>
        {me && <button className="small" onClick={async () => { await signOut(); setMe(null); }}>{t(L, "signOut")}</button>}
      </header>
      <main>
        {me === undefined ? null : !view ? <Login lang={L} onIn={load} /> : view.role === "student" ? <Student me={view} /> : <Teacher me={view} />}
      </main>
      <footer>🔒 Child safety first · {DEMO ? "Demo mode" : "Connected"}</footer>
    </>
  );
}
