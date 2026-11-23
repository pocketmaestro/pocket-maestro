export type Lang = "en" | "es";
const T = {
  en: {
    signIn: "Sign in", email: "Email", password: "Password", signOut: "Sign out", demo: "Demo mode: made-up students only. Connect Supabase to go live.",
    hello: "Hi", coach: "Live coach", start: "🎙 Start listening", stop: "■ Stop", left: "left", listening: "Listening",
    soundOnly: "🔒 Listens only. Never records, never saves, never sends.",
    heard: "I heard", inTune: "right in tune!", low: "is a little low.", high: "is a little high.", wobbly: "is wobbling.",
    why: "Why:", tryThis: "Try this:", nextTip: "Still off? Next tip", focus: "Your coach's focus",
    report: "Session report", played: "played", notes: "notes", tuned: "in tune", saved: "Saved to your progress. Only numbers are saved, never your sound.",
    noMic: "This device's microphone isn't available. Ask an adult to allow microphone access.",
    progress: "My progress", thisWeek: "minutes this week", onlyYou: "🔒 Only you and your teacher can see this.",
    myClasses: "My classes", student: "Student", instrument: "Instrument", minutes: "Minutes (7 days)", tune: "In tune", noData: "No practice yet",
    teacherNote: "You see only students in classes you teach. Never their sound.",
  },
  es: {
    signIn: "Entrar", email: "Correo", password: "Contraseña", signOut: "Salir", demo: "Modo demo: solo alumnos inventados. Conecta Supabase para usarlo de verdad.",
    hello: "Hola", coach: "Entrenador en vivo", start: "🎙 Empezar a escuchar", stop: "■ Detener", left: "restantes", listening: "Escuchando",
    soundOnly: "🔒 Solo escucha. Nunca graba, nunca guarda, nunca envía.",
    heard: "Escuché", inTune: "¡perfectamente afinada!", low: "está un poco baja.", high: "está un poco alta.", wobbly: "está temblando.",
    why: "Por qué:", tryThis: "Prueba esto:", nextTip: "¿Sigue igual? Otro consejo", focus: "El enfoque de tu entrenador",
    report: "Reporte de la sesión", played: "tocando", notes: "notas", tuned: "afinadas", saved: "Guardado en tu progreso. Solo se guardan números, nunca tu sonido.",
    noMic: "El micrófono de este dispositivo no está disponible. Pide a un adulto que permita el micrófono.",
    progress: "Mi progreso", thisWeek: "minutos esta semana", onlyYou: "🔒 Solo tú y tu maestro pueden ver esto.",
    myClasses: "Mis clases", student: "Alumno", instrument: "Instrumento", minutes: "Minutos (7 días)", tune: "Afinación", noData: "Sin práctica todavía",
    teacherNote: "Solo ves a los alumnos de tus clases. Nunca su sonido.",
  },
} as const;
export type Key = keyof typeof T.en;
export const t = (lang: Lang, k: Key) => T[lang][k];
