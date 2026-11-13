const { app, BrowserWindow, ipcMain, shell, dialog, protocol, net, session } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const fs = require('fs');
const { pathToFileURL } = require('url');
const os = require('os');
const imageStore = require('./imageStore');
const security = require('./security');
const { createErrorLog } = require('./errorLog');

// Nur für Entwicklung und Tests: Datenordner umlenken, damit sich Änderungen
// am Speicherformat an einer Kopie ausprobieren lassen, ohne die echte
// Sammlung anzufassen. Muss vor allem anderen laufen, was userData liest.
if (process.env.COLLECTODEX_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.COLLECTODEX_USER_DATA));
}

// Fehlerprotokoll (#136): Alles, was der Hauptprozess als Fehler oder Warnung
// ausgibt, landet zusätzlich in einer Datei neben der Datendatei. Steht so
// früh, damit auch Fehler der Migrationen weiter unten erfasst werden.
const errorLog = createErrorLog({ dir: path.join(app.getPath('userData'), 'logs') });
for (const level of ['error', 'warn']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    original(...args);
    errorLog.write('main', level, ...args);
  };
}

// Eigenes Schema für ausgelagerte Bilder (#120). Muss vor „ready“ als
// vertrauenswürdig angemeldet werden, sonst lädt das Fenster daraus nichts.
protocol.registerSchemesAsPrivileged([
  {
    scheme: imageStore.IMAGE_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

// Einmalige Migration des Datenverzeichnisses (#21).
//
// Früher hieß die App intern "pokemon-sammlung" (package.json "name"),
// wodurch electron ihren userData-Ordner unter
// .../Application Support/pokemon-sammlung/ anlegte. Mit der Umbenennung
// auf "collectodex" wechselt dieser Pfad — ohne Migration würde der
// Nutzer seine gesamte Sammlung "verlieren", weil die App im neuen,
// leeren Ordner sucht.
//
// Daher kopieren wir die Store-Datei einmalig vom alten in den neuen
// userData-Ordner, sofern dort noch keine existiert. Der alte Ordner
// bleibt als Sicherheit unangetastet. Muss VOR `new Store()` laufen,
// damit der Store die migrierte Datei direkt liest.
const STORE_FILE = 'collectodex-data.json';
function migrateLegacyUserData() {
  try {
    const newUserData = app.getPath('userData');
    const newStorePath = path.join(newUserData, STORE_FILE);

    // Schon migriert (oder frische Installation mit neuem Namen)?
    if (fs.existsSync(newStorePath)) return;

    // Alten Pfad ableiten: gleiches Eltern­verzeichnis, alter App-Name.
    const legacyUserData = path.join(
      path.dirname(newUserData),
      'pokemon-sammlung'
    );
    const legacyStorePath = path.join(legacyUserData, STORE_FILE);

    if (fs.existsSync(legacyStorePath)) {
      fs.mkdirSync(newUserData, { recursive: true });
      fs.copyFileSync(legacyStorePath, newStorePath);
      console.log(
        `Datenmigration: ${legacyStorePath} -> ${newStorePath} kopiert.`
      );
    }
  } catch (error) {
    console.error('Fehler bei der Datenmigration:', error);
    // Bei Fehler nicht abbrechen — die App startet dann eben mit
    // leerem Store, statt gar nicht zu starten.
  }
}

migrateLegacyUserData();

// Initialisiere persistenten Speicher
const store = new Store({
  name: 'collectodex-data',
  defaults: {
    categories: [],
    items: []
  }
});

const ITEMS_KEY = 'pokemon_collection_items';
const imagesDir = () => path.join(app.getPath('userData'), 'images');
// Kopie der Datendatei von vor der Bildauslagerung (#120); so groß wie die alte Datei.
const legacyBackupFile = () => path.join(path.dirname(store.path), 'collectodex-data.vor-bildauslagerung.json');

// Einmalige Auslagerung der Bilder aus der Datendatei (#120). Läuft vor dem
// ersten Fenster, damit die App nie die große Datei über IPC schieben muss.
// Schlägt sie fehl, startet die App trotzdem – mit den Bildern wie bisher.
function migrateImagesOutOfStore() {
  try {
    const result = imageStore.migrateInlineImages({
      readItems: () => store.get(ITEMS_KEY) || [],
      writeItems: (items) => store.set(ITEMS_KEY, items),
      storeFile: store.path,
      backupFile: legacyBackupFile(),
      dir: imagesDir(),
    });
    if (result.migrated > 0) {
      console.log(`Bildauslagerung: ${result.migrated} Bilder nach ${imagesDir()} verschoben.`);
      console.log(`Sicherungskopie der alten Datendatei: ${result.backupFile}`);
    }
  } catch (error) {
    console.error('Bildauslagerung fehlgeschlagen, Daten bleiben unverändert:', error);
  }
}

migrateImagesOutOfStore();

let mainWindow;
// Adresse, unter der die App selbst geladen wird; alles andere gilt als fremd.
let appUrl = null;

// Öffnet eine Adresse im Standardbrowser – aber nur https (#133). Alles andere
// (file:, smb:, eigene Schemata anderer Programme) wird verworfen.
async function openExternal(url) {
  if (!security.isSafeExternalUrl(url)) {
    console.warn('Externe Adresse abgelehnt:', String(url).slice(0, 200));
    return false;
  }
  await shell.openExternal(url);
  return true;
}

// Verbesserte Fehlerbehandlung
process.on('uncaughtException', (error) => {
  console.error('Unbehandelte Ausnahme:', error);
  dialog.showErrorBox(
    'Anwendungsfehler',
    `Ein unerwarteter Fehler ist aufgetreten: ${error.message}\n\nDetails wurden in die Konsole geschrieben.`
  );
});

process.on('unhandledRejection', (reason) => {
  console.error('Unbehandelte Ablehnung:', reason);
});

// Abstürze von Fenster- und Hilfsprozessen (GPU, Netzwerk) festhalten.
app.on('render-process-gone', (_event, _webContents, details) => {
  if (details.reason !== 'clean-exit') {
    console.error('Fenster-Prozess beendet:', details.reason, `(Code ${details.exitCode})`);
  }
});
app.on('child-process-gone', (_event, details) => {
  if (details.reason !== 'clean-exit') {
    console.error('Hilfsprozess beendet:', details.type, details.reason, `(Code ${details.exitCode})`);
  }
});

// Auto-Update (#20): Notify-only — die App prüft beim Start auf neue
// GitHub-Releases, lädt aber erst nach Bestätigung in der UI herunter
// (autoDownload = false) und installiert erst auf Klick (quitAndInstall).
// Nur in der gepackten, signierten App aktiv; im Dev-Modus deaktiviert.
function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function setupAutoUpdater() {
  if (isDev || !app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = false;

  autoUpdater.on('update-available', (info) => {
    sendToRenderer('update:available', { version: info && info.version });
  });
  // Für die manuelle Prüfung (Settings): "kein Update vorhanden" muss
  // ebenfalls eine Rückmeldung geben, sonst bleibt der Button ohne Feedback.
  autoUpdater.on('update-not-available', (info) => {
    sendToRenderer('update:none', { version: info && info.version });
  });
  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('update:progress', { percent: progress && progress.percent });
  });
  autoUpdater.on('update-downloaded', (info) => {
    sendToRenderer('update:downloaded', { version: info && info.version });
  });
  autoUpdater.on('error', (error) => {
    console.error('Auto-Update-Fehler:', error);
    sendToRenderer('update:error', { message: error == null ? 'unbekannt' : String(error.message || error) });
  });

  // Beim Start einmalig prüfen; Fehler werden über das 'error'-Event behandelt.
  autoUpdater.checkForUpdates().catch((error) => {
    console.error('Auto-Update-Prüfung fehlgeschlagen:', error);
  });
}

// Erstelle das Hauptfenster
function createWindow() {
  try {
    console.log('Starte App...');
    console.log('Arbeitsverzeichnis:', process.cwd());
    console.log('__dirname:', __dirname);
    console.log('isDev:', isDev);
    
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webviewTag: false,
        preload: path.join(__dirname, 'preload.js')
      },
      icon: path.join(__dirname, isDev ? '../public/favicon.ico' : 'favicon.ico')
    });

    // Lade die React-App je nach Entwicklungs- oder Produktionsmodus
    let indexPath;
    
    if (isDev) {
      indexPath = path.join(__dirname, './index.html');
    } else {
      // Suche nach der index.html an verschiedenen möglichen Orten
      const possiblePaths = [
        path.join(__dirname, 'index.html'),
        path.join(__dirname, '../build/index.html'),
        path.join(app.getAppPath(), 'build/index.html'),
        path.join(process.resourcesPath, 'build/index.html'),
        path.join(__dirname, './build/index.html'),
        path.join(app.getPath('exe'), '../build/index.html'),
        path.join(app.getPath('exe'), '../../build/index.html'),
        '/Applications/CollectODex.app/Contents/build/index.html'
      ];
      
      console.log('Suche nach index.html:');
      for (const testPath of possiblePaths) {
        const exists = fs.existsSync(testPath);
        console.log(`${testPath}: ${exists ? 'GEFUNDEN' : 'NICHT GEFUNDEN'}`);
        if (exists) {
          indexPath = testPath;
          break;
        }
      }
      
      if (!indexPath) {
        console.error('Keine index.html gefunden! Verwende Fallback...');
        indexPath = path.join(app.getAppPath(), 'build/index.html');
      }
    }
    
    // Stellen Sie sicher, dass der richtige Pfad verwendet wird
    const startUrl = isDev
      ? 'http://localhost:3000'
      : pathToFileURL(indexPath).toString();
    appUrl = startUrl;
    
    console.log('App wird geladen von:', startUrl);
    console.log('Aktuelles Verzeichnis:', __dirname);
    console.log('Index-Pfad:', indexPath);
    console.log('App-Pfad:', app.getAppPath());
    console.log('Resources-Pfad:', process.resourcesPath);
    console.log('Preload-Skript Pfad:', path.join(__dirname, 'preload.js'));
    
    mainWindow.loadURL(startUrl);

    // Auto-Update-Prüfung anstoßen (No-op im Dev-Modus, s. setupAutoUpdater).
    setupAutoUpdater();

    // Immer DevTools im Entwicklungsmodus öffnen und optional in der Produktionsversion
    if (isDev || process.env.DEBUG_PROD === 'true') {
      mainWindow.webContents.openDevTools();
    }
    
    // Externe Links im Standardbrowser öffnen; ein eigenes Fenster gibt es nie.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      void openExternal(url).catch((error) => console.error('Link öffnen fehlgeschlagen:', error));
      return { action: 'deny' };
    });

    // Das Fenster bleibt bei der App (#133): kein Wechsel auf fremde Seiten,
    // auch nicht durch eine ins Fenster gezogene Datei. Seitenwechsel der App
    // laufen über den Hash und lösen dieses Ereignis nicht aus.
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (!security.isAppUrl(url, appUrl)) {
        event.preventDefault();
        console.warn('Navigation unterbunden:', String(url).slice(0, 200));
      }
    });
    mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());

    // Fehlerbehandlung für Ladeprobleme
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // Nur das Laden der App selbst zählt; -3 (ERR_ABORTED) ist eine
      // abgebrochene bzw. oben unterbundene Navigation und kein Ladefehler.
      if (!isMainFrame || errorCode === -3) return;
      console.error('Fehler beim Laden der App:', errorCode, errorDescription);
      console.error('Fehler beim Laden von URL:', startUrl);
      
      // Zeige einen Fehler-Dialog
      dialog.showErrorBox(
        'Ladefehler', 
        `Die Anwendung konnte nicht geladen werden: ${errorDescription} (${errorCode})\nURL: ${startUrl}`
      );
      
      // Versuche einen Reload nach einem kurzen Timeout
      setTimeout(() => {
        console.log('Versuche erneut zu laden...');
        mainWindow.loadURL(startUrl);
      }, 1000);
    });
  } catch (error) {
    console.error('Fehler beim Erstellen des Fensters:', error);
    dialog.showErrorBox(
      'Initialisierungsfehler',
      `Die Anwendung konnte nicht gestartet werden: ${error.message}`
    );
  }

  mainWindow.on('closed', () => (mainWindow = null));
}

// Liefert ausgelagerte Bilder an das Fenster aus.
function registerImageProtocol() {
  protocol.handle(imageStore.IMAGE_SCHEME, (request) => {
    const file = imageStore.resolveRef(imagesDir(), request.url.split(/[?#]/)[0]);
    // Nicht zwischenspeichern: Ein fehlendes Vorschaubild wird gleich danach erzeugt.
    if (!file) return new Response('Bild nicht gefunden', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return net.fetch(pathToFileURL(file).toString());
  });
}

// App Events
app.on('ready', () => {
  // Die App braucht keine Browser-Berechtigungen (Kamera, Standort, Mitteilungen …).
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  registerImageProtocol();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC (#133): Anfragen nimmt der Hauptprozess nur vom Hauptfenster an, solange
// dort die App selbst geladen ist.
function isTrustedSender(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return false;
  const frame = event.senderFrame;
  return Boolean(frame) && security.isAppUrl(frame.url, appUrl);
}

function handle(channel, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) {
      throw new Error(`IPC ${channel}: Absender nicht erlaubt`);
    }
    return listener(event, ...args);
  });
}

// Datenspeicherung: nur die bekannten Schlüssel, kein Löschen oder Leeren.
handle('store-get', async (event, key) => {
  if (!security.isAllowedStoreKey(key)) {
    throw new Error(`Unbekannter Speicherschlüssel: ${String(key).slice(0, 80)}`);
  }
  return store.get(key);
});

handle('store-set', async (event, key, data) => {
  if (!security.isAllowedStoreKey(key)) {
    throw new Error(`Unbekannter Speicherschlüssel: ${String(key).slice(0, 80)}`);
  }
  store.set(key, data);
  return true;
});

// --- Fehlerprotokoll (#136) ------------------------------------------------
// Das Fenster meldet seine Fehler hierher. Bewusst ohne Antwort (send statt
// invoke): Ein Fehler beim Protokollieren soll im Fenster nichts auslösen.
ipcMain.on('log:write', (event, entry) => {
  if (!isTrustedSender(event)) return;
  const { level, message } = entry || {};
  if (typeof message !== 'string' || message === '') return;
  errorLog.write('fenster', level === 'warn' ? 'warn' : 'error', message);
});

handle('log:info', async () => errorLog.info());

// Öffnet die Protokolldatei im Standardprogramm; false, wenn es noch keine gibt.
handle('log:open', async () => {
  if (!errorLog.info().exists) return false;
  return (await shell.openPath(errorLog.file)) === '';
});

// Speichert eine Kopie mit Angaben zu Version und System an einem Ort nach Wahl.
handle('log:export', async () => {
  const day = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Fehlerprotokoll exportieren',
    defaultPath: path.join(app.getPath('downloads'), `collectodex-protokoll-${day}.txt`),
    filters: [{ name: 'Textdatei', extensions: ['txt'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  try {
    const text = errorLog.buildExport({
      Version: app.getVersion(),
      Electron: process.versions.electron,
      System: `${process.platform} ${process.getSystemVersion()} (${os.arch()})`,
    });
    fs.writeFileSync(result.filePath, text, 'utf8');
    return { ok: true, path: result.filePath };
  } catch (error) {
    console.error('Protokoll exportieren fehlgeschlagen:', error);
    return { ok: false, error: String((error && error.message) || error) };
  }
});

// Bilder (#120): neue Bilder als Datei ablegen bzw. für Export und Backup
// wieder als Data-URL liefern.
handle('images:save', async (event, dataUrl) => {
  try {
    return imageStore.saveDataUrl(imagesDir(), dataUrl);
  } catch (error) {
    console.error('Bild speichern fehlgeschlagen:', error);
    return null;
  }
});

// Vorschaubild zu einem abgelegten Bild speichern (#128).
handle('images:save-thumb', async (event, ref, dataUrl) => {
  try {
    return imageStore.saveThumbnail(imagesDir(), ref, dataUrl);
  } catch (error) {
    console.error('Vorschaubild speichern fehlgeschlagen:', error);
    return null;
  }
});

handle('images:read', async (event, ref) => {
  try {
    return imageStore.readAsDataUrl(imagesDir(), ref);
  } catch (error) {
    console.error('Bild lesen fehlgeschlagen:', error);
    return null;
  }
});

// Bildablage aufräumen (#143). Gezählt wird gegen die gespeicherten Einträge
// in der Datendatei, nicht gegen das, was das Fenster gerade anzeigt.
handle('images:usage', async () => {
  const scan = imageStore.scanImages({ dir: imagesDir(), items: store.get(ITEMS_KEY) });
  let legacyBackupBytes = null;
  try {
    legacyBackupBytes = fs.statSync(legacyBackupFile()).size;
  } catch {
    // Keine Sicherungskopie vorhanden.
  }
  return {
    files: scan.files,
    bytes: scan.bytes,
    orphanFiles: scan.orphans.length,
    orphanBytes: scan.orphanBytes,
    blocked: scan.blocked,
    legacyBackupBytes,
  };
});

// Verwaiste Bilddateien in den Papierkorb legen – nie endgültig löschen.
handle('images:cleanup', async () => {
  const result = await imageStore.cleanupOrphans({
    dir: imagesDir(),
    items: store.get(ITEMS_KEY),
    trash: (file) => shell.trashItem(file),
  });
  if (result.failed > 0) {
    console.error(`Bildablage aufräumen: ${result.failed} Dateien ließen sich nicht in den Papierkorb legen.`);
  }
  return result;
});

// Die Sicherungskopie von vor der Bildauslagerung in den Papierkorb legen.
handle('images:trash-legacy-backup', async () => {
  try {
    await shell.trashItem(legacyBackupFile());
    return true;
  } catch (error) {
    console.error('Sicherungskopie ließ sich nicht in den Papierkorb legen:', error);
    return false;
  }
});

// IPC Handler für das Öffnen von externen URLs
handle('open-external-url', async (event, url) => openExternal(url));

// IPC Handler für Auto-Update (#20): Download bzw. Installation werden vom
// Renderer (UpdateNotification) per Button-Klick angestoßen.
handle('update:download', async () => {
  await autoUpdater.downloadUpdate();
  return true;
});

handle('update:install', async () => {
  // Beendet die App und installiert das geladene Update.
  autoUpdater.quitAndInstall();
  return true;
});

// Manuelle Update-Prüfung aus dem Settings-Tab. Im Dev-/ungepackten Modus
// gibt es keine Update-Konfiguration — dann meldet { supported: false }
// zurück, damit die UI einen passenden Hinweis statt eines Fehlers zeigt.
// Im gepackten Betrieb laufen die Ergebnisse über die update:*-Events.
handle('update:check', async () => {
  if (isDev || !app.isPackaged) {
    return { supported: false };
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('Manuelle Update-Prüfung fehlgeschlagen:', error);
    sendToRenderer('update:error', {
      message: error == null ? 'unbekannt' : String(error.message || error),
    });
  }
  return { supported: true };
});

// Aktuelle App-Version für die Anzeige im Settings-Tab.
handle('app:version', async () => app.getVersion());

// --- Auto-Backup (#91) -----------------------------------------------------
// Das eigentliche Schreiben ins Dateisystem muss im Main-Prozess passieren.
// Der Renderer baut die versionierte Backup-Hülle (utils/backup.ts) und schickt
// den fertigen JSON-String hierher.
const BACKUP_PREFIX = 'collectodex-backup-';

// Ordnerauswahl-Dialog; liefert den gewählten Pfad oder null bei Abbruch.
handle('backup:choose-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Ordner für automatische Backups wählen',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// Schreibt ein Backup und behält nur die jüngsten `keep` Dateien.
handle('backup:write', async (event, payload) => {
  try {
    const { folder, json, keep } = payload || {};
    if (!folder || typeof json !== 'string') {
      return { ok: false, error: 'Ungültige Backup-Parameter.' };
    }
    fs.mkdirSync(folder, { recursive: true });

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
      `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filePath = path.join(folder, `${BACKUP_PREFIX}${stamp}.json`);
    fs.writeFileSync(filePath, json, 'utf8');

    // Alte Backups aufräumen: nur die jüngsten `keep` behalten.
    const keepCount = Number.isFinite(keep) && keep > 0 ? Math.floor(keep) : 5;
    const existing = fs
      .readdirSync(folder)
      .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith('.json'))
      .sort(); // Zeitstempel im Namen -> lexikografisch = chronologisch
    const toDelete = existing.slice(0, Math.max(0, existing.length - keepCount));
    for (const f of toDelete) {
      try {
        fs.unlinkSync(path.join(folder, f));
      } catch (e) {
        console.error('Backup-Aufräumen fehlgeschlagen für', f, e);
      }
    }

    return { ok: true, path: filePath };
  } catch (error) {
    console.error('Backup schreiben fehlgeschlagen:', error);
    return { ok: false, error: String((error && error.message) || error) };
  }
});

// Öffnet den Backup-Ordner im Finder/Explorer.
handle('backup:open-folder', async (event, folder) => {
  // Nur vorhandene Ordner: openPath würde sonst auch Programme starten.
  if (typeof folder !== 'string' || !folder) return false;
  try {
    if (!fs.statSync(folder).isDirectory()) return false;
  } catch {
    return false;
  }
  await shell.openPath(folder);
  return true;
});

// Speichere beim Beenden der App automatisch den aktuellen Zustand
app.on('before-quit', () => {
  // Kann verwendet werden, um bestimmte Aufräumarbeiten vor dem Beenden durchzuführen
}); 