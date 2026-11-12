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

/**
 * Auswahlfelder. Der Pfeil kommt aus `.cdx-select` (index.css) und sitzt mit
 * festem Abstand zum Rand; rechts bleibt Platz dafür frei.
 */
export const selectClass = `${FIELD_BASE} cdx-select pr-9`;

/** Einheitliche Feld-Beschriftung. */
export const labelClass =
  'block text-sm font-medium text-gray-700 dark:text-gray-200';

// --- Knöpfe ----------------------------------------------------------------
// Gleiche Höhe wie die Felder (px-4 py-2, text-sm), damit Knopf und Feld in
// einer Zeile bündig stehen.

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-pokemon-blue dark:focus-visible:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed';
const REGULAR = 'px-4 py-2';
/** Für Knöpfe in Listenzeilen und Hinweisleisten. */
const SMALL = 'px-3 py-1.5';

const PRIMARY = 'bg-pokemon-blue text-white shadow-sm hover:bg-blue-700';
const SECONDARY =
  'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700';
const DANGER = 'bg-red-600 text-white shadow-sm hover:bg-red-700';
const SUCCESS = 'bg-green-600 text-white shadow-sm hover:bg-green-700';

/** Hauptaktion einer Seite oder eines Dialogs. */
export const primaryButtonClass = `${BUTTON_BASE} ${REGULAR} ${PRIMARY}`;
export const primaryButtonSmallClass = `${BUTTON_BASE} ${SMALL} ${PRIMARY}`;

/** Nebenaktion. */
export const secondaryButtonClass = `${BUTTON_BASE} ${REGULAR} ${SECONDARY}`;
export const secondaryButtonSmallClass = `${BUTTON_BASE} ${SMALL} ${SECONDARY}`;

/** Löschen und andere Aktionen, die sich nicht zurücknehmen lassen. */
export const dangerButtonClass = `${BUTTON_BASE} ${REGULAR} ${DANGER}`;

/** Gesammeltes Übernehmen sicherer Treffer. */
export const successButtonSmallClass = `${BUTTON_BASE} ${SMALL} ${SUCCESS}`;
