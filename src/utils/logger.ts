// Tiny logger: debug/info calls become no-ops in production builds, so
// the previous floods of console output (~50 calls in StorageService,
// CollectionContext, and CategoryItemsList) stop hitting the DevTools
// console in the packaged app. Errors and warnings keep going through.
//
// Vite replaces `import.meta.env.DEV` with a literal `true` / `false`
// at build time, so the production bundle drops the no-op call sites
// entirely after minification.
//
// The wrappers look up console.log/etc. on each call instead of binding
// once at module load. That keeps the implementation testable — a
// vi.spyOn(console, 'log') in a unit test still observes the call.

const isDev = import.meta.env.DEV;

const noop = () => {};

export const logger = {
  debug: isDev ? (...args: unknown[]) => console.log(...args) : noop,
  info: isDev ? (...args: unknown[]) => console.info(...args) : noop,
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};
