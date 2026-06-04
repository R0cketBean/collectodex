// Gemeinsames Styling für Formularfelder (#100) — EINE Quelle statt vieler
// wiederholter className-Strings. Ziel: konsistente, ruhige Optik im hellen
// wie im dunklen Modus (Apple-näher):
// - dezenter 1px-Rand statt dicker Rahmen
// - einheitliche Höhe/Innenabstände (px-3 py-2)
// - ins Panel "eingelassenes" Feld (Hintergrund leicht abgesetzt:
//   hell = gray-50 auf weißem Panel, dunkel = gray-900 auf gray-800-Panel)
// - ruhiger, klarer Fokus-Ring
//
// Hinweis: Die Klassen stehen als ganze Tokens in einem String-Literal, damit
// Tailwinds Content-Scan sie zuverlässig erkennt.

const FIELD_BASE =
  'block w-full rounded-md text-sm px-3 py-2 border bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pokemon-blue focus:border-pokemon-blue transition-colors';

/** Text-, Zahlen-, Datums-, URL-Eingaben. */
export const inputClass = FIELD_BASE;

/** Mehrzeilige Eingaben. */
export const textareaClass = FIELD_BASE;

/** Auswahlfelder (etwas mehr rechter Innenabstand für den nativen Pfeil). */
export const selectClass = `${FIELD_BASE} pr-9`;

/** Einheitliche Feld-Beschriftung. */
export const labelClass =
  'block text-sm font-medium text-gray-700 dark:text-gray-200';
