// Starttest der gepackten App (#135).
//
// Fängt Fehler ab, die nur in der gepackten App auftreten (fehlende Dateien
// im Paket, Pfade, Speicher, Preload): App starten, über die Oberfläche einen
// Eintrag anlegen, App beenden, neu starten, Eintrag ist noch da.
//
//   node scripts/smoke-test.mjs [Pfad zur gepackten App]
//
// Ohne Pfad wird die App unter dist/ gesucht. Die App läuft mit einem eigenen,
// leeren Datenordner (COLLECTODEX_USER_DATA) und wird über das DevTools-
// Protokoll gesteuert – ohne zusätzliche Pakete, nur mit Node ab Version 22.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const STEP_TIMEOUT_MS = 30_000;
const ITEMS_KEY = 'pokemon_collection_items';

const log = (message) => console.log(`[starttest] ${message}`);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Sucht die gepackte App unter dist/, je nach Betriebssystem. */
const findApp = () => {
  const dist = join(repoRoot, 'dist');
  const dirs = existsSync(dist) ? readdirSync(dist) : [];
  const candidates =
    process.platform === 'darwin'
      ? dirs.filter((d) => d.startsWith('mac')).map((d) => join(dist, d, 'CollectODex.app', 'Contents', 'MacOS', 'CollectODex'))
      : process.platform === 'win32'
        ? [join(dist, 'win-unpacked', 'CollectODex.exe')]
        : [join(dist, 'linux-unpacked', 'collectodex'), join(dist, 'linux-unpacked', 'CollectODex')];
  return candidates.find((file) => existsSync(file)) ?? null;
};

/** Macht aus „…/CollectODex.app“ den Pfad zum Programm darin. */
const resolveExecutable = (given) => {
  const target = resolve(given);
  return target.endsWith('.app') ? join(target, 'Contents', 'MacOS', 'CollectODex') : target;
};

const freePort = () =>
  new Promise((done, fail) => {
    const server = createServer();
    server.on('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });

const waitFor = async (what, check, timeoutMs = STEP_TIMEOUT_MS) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Zeit abgelaufen: ${what}${lastError ? ` (${lastError.message})` : ''}`);
};

/** Startet die App und verbindet sich mit ihrem Fenster. */
const launch = async (executable, userData) => {
  const port = await freePort();
  const args = [`--remote-debugging-port=${port}`];
  // Auf den Linux-Runnern der CI fehlt die Voraussetzung für Chromiums Sandbox.
  if (process.platform === 'linux') args.push('--no-sandbox');
  const output = [];
  const child = spawn(executable, args, {
    env: { ...process.env, COLLECTODEX_USER_DATA: userData },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));
  const exited = new Promise((done) => child.on('exit', (code, signal) => done({ code, signal })));
  let gone = null;
  exited.then((result) => {
    gone = result;
  });

  const target = await waitFor('Fenster der App', async () => {
    if (gone) throw new Error(`App hat sich beendet (Code ${gone.code}, Signal ${gone.signal})`);
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await response.json();
    return targets.find((t) => t.type === 'page' && /^file:.*index\.html/.test(t.url));
  }).catch((error) => {
    child.kill();
    throw new Error(`${error.message}\n--- Ausgabe der App ---\n${output.join('').slice(-4000)}`);
  });

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, fail) => {
    socket.addEventListener('open', done, { once: true });
    socket.addEventListener('error', () => fail(new Error('Verbindung zum Fenster fehlgeschlagen')), { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.fail(new Error(message.error.message));
    else waiter.done(message.result);
  });
  const send = (method, params = {}) =>
    new Promise((done, fail) => {
      const id = nextId++;
      pending.set(id, { done, fail });
      socket.send(JSON.stringify({ id, method, params }));
    });

  /** Führt einen Ausdruck im Fenster aus und liefert seinen Wert. */
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`Fehler im Fenster: ${detail}`);
    }
    return result.result.value;
  };

  const close = async () => {
    socket.close();
    child.kill();
    const timeout = sleep(10_000).then(() => 'timeout');
    if ((await Promise.race([exited, timeout])) === 'timeout') {
      child.kill('SIGKILL');
      await exited;
    }
  };

  return { evaluate, close, output };
};

/** Wartet, bis die Oberfläche steht, und prüft Preload und Speicher. */
const waitForApp = async (app) => {
  await waitFor('Oberfläche geladen', () =>
    app.evaluate(`document.getElementById('root')?.innerText.includes('Dashboard') === true`)
  );
  const api = await app.evaluate(`typeof window.electronAPI?.storeGet`);
  if (api !== 'function') throw new Error('Preload fehlt: window.electronAPI.storeGet ist nicht da.');
};

const storedNames = (app) =>
  app.evaluate(
    `window.electronAPI.storeGet(${JSON.stringify(ITEMS_KEY)}).then((items) => (items || []).map((i) => i.values && i.values.name))`
  );

// Füllt alle Pflichtfelder des Dialogs. React bemerkt die Eingabe nur, wenn der
// Wert über den ursprünglichen Setter gesetzt und ein Ereignis ausgelöst wird.
const fillAndSubmit = (name) => `(() => {
  const form = document.querySelector('form');
  const setValue = (element, value) => {
    const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  };
  const nameField = form.querySelector('#name');
  if (!nameField) return 'Feld „name“ fehlt';
  setValue(nameField, ${JSON.stringify(name)});
  for (const field of form.querySelectorAll('[required]')) {
    if (field === nameField || field.value) continue;
    if (field instanceof HTMLSelectElement) {
      const option = [...field.options].find((o) => o.value);
      if (option) setValue(field, option.value);
    } else if (field.type === 'date') setValue(field, new Date().toISOString().slice(0, 10));
    else if (field.type === 'number') setValue(field, '1');
    else setValue(field, 'Starttest');
  }
  form.requestSubmit();
  return 'ok';
})()`;

const main = async () => {
  const executable = process.argv[2] ? resolveExecutable(process.argv[2]) : findApp();
  if (!executable || !existsSync(executable)) {
    throw new Error(
      `Gepackte App nicht gefunden${executable ? `: ${executable}` : ' unter dist/'}. Erst paketieren (electron-builder --dir) oder den Pfad angeben.`
    );
  }
  const userData = mkdtempSync(join(tmpdir(), 'collectodex-starttest-'));
  const name = `Starttest ${Date.now()}`;
  log(`App: ${executable}`);
  log(`Datenordner: ${userData}`);

  let app;
  try {
    // 1. Start mit leerem Datenordner
    app = await launch(executable, userData);
    await waitForApp(app);
    log(`Start: Oberfläche steht, Version ${await app.evaluate('window.electronAPI.getAppVersion()')}`);

    // 2. Eintrag über die Oberfläche anlegen
    const category = await waitFor('Kategorie in der Seitenleiste', () =>
      app.evaluate(`document.querySelector('a[href*="#/category/"]')?.getAttribute('href') ?? null`)
    );
    await app.evaluate(`window.location.hash = ${JSON.stringify(category.replace(/^.*#/, '#'))}`);
    await waitFor('Knopf „Hinzufügen“', () =>
      app.evaluate(`(() => {
        const button = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Hinzufügen');
        if (!button) return false;
        button.click();
        return true;
      })()`)
    );
    await waitFor('Dialog zum Anlegen', () => app.evaluate(`!!document.querySelector('form #name')`));
    const filled = await app.evaluate(fillAndSubmit(name));
    if (filled !== 'ok') throw new Error(`Dialog ließ sich nicht ausfüllen: ${filled}`);

    // 3. Gespeichert?
    await waitFor('Eintrag im Speicher', async () => (await storedNames(app)).includes(name));
    log(`Anlegen: „${name}“ gespeichert`);

    // 4. Neu starten
    await app.close();
    app = await launch(executable, userData);
    await waitForApp(app);

    // 5. Eintrag ist noch da – im Speicher und in der Liste
    if (!(await storedNames(app)).includes(name)) throw new Error('Nach dem Neustart fehlt der Eintrag im Speicher.');
    await app.evaluate(`window.location.hash = ${JSON.stringify(category.replace(/^.*#/, '#'))}`);
    await waitFor('Eintrag in der Liste nach Neustart', () =>
      app.evaluate(`document.getElementById('root').innerText.includes(${JSON.stringify(name)})`)
    );
    log('Neustart: Eintrag ist noch da');
    await app.close();
    app = null;

    // 6. Das Fenster darf dabei keinen Fehler protokolliert haben (#136).
    const logFile = join(userData, 'logs', 'collectodex.log');
    const windowErrors = existsSync(logFile)
      ? readFileSync(logFile, 'utf8').split('\n').filter((line) => line.includes('[fenster] ERROR'))
      : [];
    if (windowErrors.length > 0) {
      throw new Error(`Das Fenster hat Fehler protokolliert:\n${windowErrors.slice(0, 10).join('\n')}`);
    }
    log('Fehlerprotokoll: keine Fehler aus dem Fenster');
    log('Bestanden.');
  } catch (error) {
    if (app) {
      console.error(`--- Ausgabe der App ---\n${app.output.join('').slice(-4000)}`);
      await app.close().catch(() => undefined);
    }
    throw error;
  } finally {
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
};

main().catch((error) => {
  console.error(`[starttest] FEHLGESCHLAGEN: ${error.message}`);
  process.exit(1);
});
