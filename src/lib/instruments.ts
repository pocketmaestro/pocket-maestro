export type InstKey = "flute" | "clarinet" | "sax" | "trumpet" | "trombone" | "baritone" | "tuba" | "perc" | "violin";
export type Family = "flute" | "reed" | "brass" | "perc" | "string";
export type Issue = "flat" | "sharp" | "wobble";

export const INSTRUMENTS: Record<InstKey, { en: string; es: string; emoji: string; family: Family; transpose: number; octave: number }> = {
  flute:    { en: "Flute", es: "Flauta", emoji: "🪈", family: "flute", transpose: 0, octave: 12 },
  clarinet: { en: "Clarinet", es: "Clarinete", emoji: "🎵", family: "reed", transpose: 2, octave: 0 },
  sax:      { en: "Alto Sax", es: "Saxofón alto", emoji: "🎷", family: "reed", transpose: 9, octave: 0 },
  trumpet:  { en: "Trumpet", es: "Trompeta", emoji: "🎺", family: "brass", transpose: 2, octave: 0 },
  trombone: { en: "Trombone", es: "Trombón", emoji: "🎺", family: "brass", transpose: 0, octave: -12 },
  baritone: { en: "Baritone", es: "Barítono", emoji: "🎺", family: "brass", transpose: 0, octave: -12 },
  tuba:     { en: "Tuba", es: "Tuba", emoji: "🎺", family: "brass", transpose: 0, octave: -24 },
  perc:     { en: "Percussion", es: "Percusión", emoji: "🥁", family: "perc", transpose: 0, octave: 12 },
  violin:   { en: "Violin", es: "Violín", emoji: "🎻", family: "string", transpose: 0, octave: 0 },
};

const NAMES = { en: ["C","C♯","D","E♭","E","F","F♯","G","A♭","A","B♭","B"], es: ["Do","Do♯","Re","Mi♭","Mi","Fa","Fa♯","Sol","La♭","La","Si♭","Si"] };
/** Note name as it appears in this student's book (transposed). */
export function writtenName(concertMidi: number, inst: InstKey, lang: "en" | "es") {
  const pc = (((concertMidi + INSTRUMENTS[inst].transpose) % 12) + 12) % 12;
  return NAMES[lang][pc];
}

/** One fix at a time, with the reason. (Every tip will be reviewed by a band director.) */
export const COACH: Record<Family, Record<"en" | "es", Partial<Record<Issue, { why: string; tips: string[] }>>>> = {
  brass: {
    en: { flat: { why: "On brass, low notes usually come from slow air or loose lip corners.", tips: ["Use faster, warmer air: support from your belly.", "Firm up the corners of your mouth.", "Still low? Push the main tuning slide in a little."] },
          sharp: { why: "On brass, high notes usually come from pinching the lips or pressing too hard.", tips: ["Relax: don't pinch your lips.", "Drop your jaw a little and open up.", "Still high? Pull the main tuning slide out a little."] } },
    es: { flat: { why: "En los metales, las notas bajas casi siempre vienen de aire lento o comisuras flojas.", tips: ["Usa aire más rápido y tibio, apoyado desde el abdomen.", "Afirma las comisuras de la boca.", "¿Sigue bajo? Empuja un poco la bomba de afinación."] },
          sharp: { why: "En los metales, las notas altas casi siempre vienen de apretar los labios.", tips: ["Relájate: no aprietes los labios.", "Abre un poco la mandíbula.", "¿Sigue alto? Saca un poco la bomba de afinación."] } },
  },
  reed: {
    en: { flat: { why: "Clarinet and sax go low when the corners loosen or the air gets lazy.", tips: ["Firm your corners and keep your chin flat.", "Faster air from your belly.", "Still low? Push the mouthpiece in a tiny bit."] },
          sharp: { why: "Clarinet and sax go high when you bite down on the reed.", tips: ["Don't bite! Loosen your jaw.", "Think \"oh\" inside your mouth.", "Still high? Pull the mouthpiece out a tiny bit."] } },
    es: { flat: { why: "El clarinete y el sax se bajan cuando se aflojan las comisuras o el aire es flojo.", tips: ["Afirma las comisuras y mantén la barbilla plana.", "Aire más rápido desde el abdomen.", "¿Sigue bajo? Mete un poquito la boquilla."] },
          sharp: { why: "El clarinete y el sax se suben cuando muerdes la caña.", tips: ["¡No muerdas! Afloja la mandíbula.", "Piensa en \"o\" dentro de la boca.", "¿Sigue alto? Saca un poquito la boquilla."] } },
  },
  flute: {
    en: { flat: { why: "Flute goes low when the air points too far into the hole or slows down.", tips: ["Aim the air a little more across the hole.", "Use faster air.", "Still low? Push the headjoint in a little."] },
          sharp: { why: "Flute goes high when you roll out too far or blow too hard.", tips: ["Roll in slightly and relax your air.", "Keep your lips loose.", "Still high? Pull the headjoint out a little."] } },
    es: { flat: { why: "La flauta se baja cuando el aire apunta muy adentro o se hace lento.", tips: ["Dirige el aire un poco más a través del orificio.", "Usa aire más rápido.", "¿Sigue bajo? Mete un poco la cabeza."] },
          sharp: { why: "La flauta se sube cuando giras mucho hacia afuera o soplas fuerte.", tips: ["Gira un poco hacia adentro y relaja el aire.", "Labios sueltos.", "¿Sigue alto? Saca un poco la cabeza."] } },
  },
  string: {
    en: { flat: { why: "A low note means your finger is a little too far back.", tips: ["Slide your finger a tiny bit higher (toward the bridge)."] },
          sharp: { why: "A high note means your finger is a little too far forward.", tips: ["Slide your finger a tiny bit lower (toward the scroll)."] } },
    es: { flat: { why: "Una nota baja significa que el dedo está un poco atrás.", tips: ["Sube el dedo un poquito (hacia el puente)."] },
          sharp: { why: "Una nota alta significa que el dedo está un poco adelante.", tips: ["Baja el dedo un poquito (hacia la voluta)."] } },
  },
  perc: { en: {}, es: {} },
};
export const WOBBLE = {
  en: { why: "A wobbly note almost always means the air isn't steady.", tips: ["Take a full, low breath first.", "Blow like one long, straight line of air.", "Practice long tones: 8 slow counts each."] },
  es: { why: "Una nota que tiembla casi siempre significa que el aire no es constante.", tips: ["Primero toma una respiración completa y baja.", "Sopla como una línea de aire larga y derecha.", "Practica notas largas: 8 tiempos lentos cada una."] },
};
