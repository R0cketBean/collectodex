// Tiny logger: debug/info calls become no-ops in production builds, so
// the previous floods of console output (~50 calls in StorageService,
// CollectionContext, and CategoryItemsList) stop hitting the DevTools
// console in the packaged app. Errors and warnings keep going through.
//
// Vite replaces `import.meta.env.DEV` with a literal `true` / `false`
// at build time, so the production bundle drops the no-op call sites
// entirely after minification.

const isDev = import.meta.env.DEV;

export const logger = {
  debug: isDev ? console.log.bind(console) : () => {},
  info: isDev ? console.info.bind(console) : () => {},
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
