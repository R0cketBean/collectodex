const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const fs = require('fs');

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

let mainWindow;

// Verbesserte Fehlerbehandlung
process.on('uncaughtException', (error) => {
  console.error('Unbehandelte Ausnahme:', error);
  dialog.showErrorBox(
    'Anwendungsfehler',
    `Ein unerwarteter Fehler ist aufgetreten: ${error.message}\n\nDetails wurden in die Konsole geschrieben.`
  );
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
      : `file://${indexPath}`;
    
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
    
    // Externe Links im Standardbrowser öffnen
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      // Öffne externe URLs im Standardbrowser des Systems
      shell.openExternal(url);
      return { action: 'deny' }; // Verhindere, dass Electron ein neues Fenster öffnet
    });
    
    // Fehlerbehandlung für Ladeprobleme
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Fehler beim Laden der App:', errorCode, errorDescription);
      console.error('Fehler beim Laden von URL:', startUrl);
      
      // Versuche, die index.html direkt zu laden
      if (!isDev && errorCode === -6) { // ERR_FILE_NOT_FOUND
        console.log('Versuche, die index.html direkt zu laden...');
        
        // Suche nach der Datei
        const hardcodedPaths = [
          '/Applications/CollectODex.app/Contents/build/index.html',
          path.join(app.getAppPath(), 'build/index.html'),
          path.join(process.resourcesPath, 'build/index.html')
        ];
        
        for (const testPath of hardcodedPaths) {
          try {
            if (fs.existsSync(testPath)) {
              console.log(`Gefunden: ${testPath}`);
              const htmlContent = fs.readFileSync(testPath, 'utf8');
              mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
              return;
            }
          } catch (err) {
            console.error(`Fehler beim Lesen von ${testPath}:`, err);
          }
        }
      }
      
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

// App Events
app.on('ready', createWindow);

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

// IPC Event Handler für Datenspeicherung
ipcMain.handle('store-get', async (event, key) => {
  return store.get(key);
});

ipcMain.handle('store-set', async (event, key, data) => {
  store.set(key, data);
  return true;
});

ipcMain.handle('store-delete', async (event, key) => {
  store.delete(key);
  return true;
});

ipcMain.handle('store-clear', async () => {
  store.clear();
  return true;
});

// IPC Handler für das Öffnen von externen URLs
ipcMain.handle('open-external-url', async (event, url) => {
  if (url) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

// IPC Handler für Auto-Update (#20): Download bzw. Installation werden vom
// Renderer (UpdateNotification) per Button-Klick angestoßen.
ipcMain.handle('update:download', async () => {
  await autoUpdater.downloadUpdate();
  return true;
});

ipcMain.handle('update:install', async () => {
  // Beendet die App und installiert das geladene Update.
  autoUpdater.quitAndInstall();
  return true;
});

// Manuelle Update-Prüfung aus dem Settings-Tab. Im Dev-/ungepackten Modus
// gibt es keine Update-Konfiguration — dann meldet { supported: false }
// zurück, damit die UI einen passenden Hinweis statt eines Fehlers zeigt.
// Im gepackten Betrieb laufen die Ergebnisse über die update:*-Events.
ipcMain.handle('update:check', async () => {
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
ipcMain.handle('app:version', async () => app.getVersion());

// --- Auto-Backup (#91) -----------------------------------------------------
// Das eigentliche Schreiben ins Dateisystem muss im Main-Prozess passieren.
// Der Renderer baut die versionierte Backup-Hülle (utils/backup.ts) und schickt
// den fertigen JSON-String hierher.
const BACKUP_PREFIX = 'collectodex-backup-';

// Ordnerauswahl-Dialog; liefert den gewählten Pfad oder null bei Abbruch.
ipcMain.handle('backup:choose-folder', async () => {
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
ipcMain.handle('backup:write', async (event, payload) => {
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
ipcMain.handle('backup:open-folder', async (event, folder) => {
  if (!folder) return false;
  await shell.openPath(folder);
  return true;
});

// Speichere beim Beenden der App automatisch den aktuellen Zustand
app.on('before-quit', () => {
  // Kann verwendet werden, um bestimmte Aufräumarbeiten vor dem Beenden durchzuführen
}); 