import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUturnRightIcon, CameraIcon } from '@heroicons/react/24/outline';
import { createAutoCapture, toGray, type GrayFrame } from '../../utils/autoCapture';
import { detectRotation, rotateSquare } from '../../utils/frameRotation';
import { inputClass, labelClass, primaryButtonClass } from '../../utils/formStyles';

// Kartenscanner, Live-Kamera (#169): zeigt das Kamerabild – am liebsten vom
// iPhone über die Integrierte Kamera (Continuity Camera) – und löst
// automatisch aus, sobald eine Karte ruhig im Bild liegt. Erkannt wird wie
// beim Foto im Hauptprozess (Apple Vision); das Bild verlässt den Mac nicht.

interface LiveCameraProps {
  /** Während eine Aufnahme ausgewertet wird, nicht erneut auslösen. */
  paused: boolean;
  onCapture: (dataUrl: string) => void;
}

const DEVICE_KEY = 'collectodex_scanner_camera';
const ROTATION_KEY = 'collectodex_scanner_rotation';
const STABILIZE_KEY = 'collectodex_scanner_stabilize';
// Quadratische Proben: Dreht das iPhone sein Bild, tauscht es Breite und
// Höhe – im Quadrat ist das genau eine Drehung (utils/frameRotation.ts).
const SAMPLE = 48;
const SAMPLE_MS = 200;

const readStoredDevice = () => {
  try {
    return localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
};
const storeDevice = (id: string) => {
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    // Nur eine Bequemlichkeit.
  }
};

type Rotation = 0 | 90 | 180 | 270;
const readRotation = (): Rotation => {
  try {
    const value = Number(localStorage.getItem(ROTATION_KEY));
    return value === 90 || value === 180 || value === 270 ? value : 0;
  } catch {
    return 0;
  }
};

/** Bildgröße nach dem Drehen: bei 90° und 270° sind Breite und Höhe vertauscht. */
const rotatedSize = (w: number, h: number, rotation: Rotation) => (rotation % 180 === 0 ? [w, h] : [h, w]);

const cameraError = (e: unknown) => {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Kein Zugriff auf die Kamera. Erlaube ihn in den Systemeinstellungen unter „Datenschutz & Sicherheit“ → „Kamera“ für CollectODex und öffne den Scanner erneut.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Keine Kamera gefunden.';
  if (name === 'NotReadableError') return 'Die Kamera wird gerade von einem anderen Programm verwendet.';
  return 'Die Kamera konnte nicht gestartet werden.';
};

const LiveCamera: React.FC<LiveCameraProps> = ({ paused, onCapture }) => {
  const video = useRef<HTMLVideoElement>(null);
  const sampleCanvas = useRef<HTMLCanvasElement | null>(null);
  const autoCapture = useRef(createAutoCapture());
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  // Gewünschte Kamera (Wechsel startet neu) und die tatsächlich laufende.
  const [deviceId, setDeviceId] = useState<string | null>(readStoredDevice);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  // Von Hand gedreht – das iPhone dreht sein Bild je nach Haltung selbst.
  const [rotation, setRotationState] = useState<Rotation>(readRotation);
  const rotationRef = useRef(rotation);
  // Drehungen des iPhones selbst erkennen und zurückdrehen.
  const [stabilize, setStabilize] = useState(() => {
    try {
      return localStorage.getItem(STABILIZE_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const lastSample = useRef<GrayFrame | null>(null);

  const setRotation = useCallback((next: Rotation) => {
    rotationRef.current = next;
    setRotationState(next);
    try {
      localStorage.setItem(ROTATION_KEY, String(next));
    } catch {
      // Nur eine Bequemlichkeit.
    }
  }, []);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshDevices = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
    const cams = all.filter((d) => d.kind === 'videoinput');
    setDevices(cams);
    return cams;
  }, []);

  // Kamera starten bzw. wechseln.
  useEffect(() => {
    const el = video.current;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setReady(false);
    setError(null);
    autoCapture.current.reset();

    const start = async () => {
      try {
        let cams = await refreshDevices();
        // Ohne gespeicherte Wahl das iPhone nehmen, falls es da ist.
        const id =
          deviceId && cams.some((c) => c.deviceId === deviceId)
            ? deviceId
            : (cams.find((c) => /iphone/i.test(c.label))?.deviceId ?? null);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(id ? { deviceId: { exact: id } } : {}),
            // Möglichst hoch aufgelöst: Set-Code und Nummer sind winzig gedruckt.
            width: { ideal: 3840 },
            height: { ideal: 2160 },
          },
        });
        if (cancelled) return;
        // Erst nach der Freigabe kennt der Browser die Gerätenamen.
        cams = await refreshDevices();
        const active = stream.getVideoTracks()[0]?.getSettings().deviceId || null;
        if (!id) {
          const phone = cams.find((c) => /iphone/i.test(c.label));
          if (phone && phone.deviceId !== active) {
            setDeviceId(phone.deviceId);
            return;
          }
        }
        setActiveId(active && cams.some((c) => c.deviceId === active) ? active : id);
        if (el) {
          el.srcObject = stream;
          await el.play().catch(() => undefined);
          setReady(true);
        }
      } catch (e) {
        if (!cancelled) setError(cameraError(e));
      }
    };
    void start();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (el) el.srcObject = null;
    };
  }, [deviceId, refreshDevices]);

  // iPhone kommt in die Nähe oder geht: Liste aktualisieren.
  useEffect(() => {
    const onChange = () => void refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange);
  }, [refreshDevices]);

  const capture = useCallback(() => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = rotatedSize(v.videoWidth, v.videoHeight, rotation);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Aufnahme so drehen wie die Anzeige.
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(v, -v.videoWidth / 2, -v.videoHeight / 2);
    onCapture(canvas.toDataURL('image/jpeg', 0.92));
  }, [onCapture, rotation]);

  const rotate = () => {
    setRotation(((rotation + 90) % 360) as Rotation);
    autoCapture.current.reset();
    lastSample.current = null;
  };

  // Takt: kleine Probe des Kamerabilds, so gedreht wie die Anzeige.
  // 1. Drehung ausgleichen: Hat das iPhone sein Bild gedreht, zurückdrehen.
  // 2. Automatisch auslösen, sobald die Karte ruhig liegt. Ausgewertet wird
  //    die ausgeglichene Probe – eine nur gedrehte Karte gilt nicht als neue.
  useEffect(() => {
    if (!ready) return;
    const watchRotation = stabilize;
    const watchStill = auto && !paused;
    if (!watchRotation && !watchStill) return;
    const timer = window.setInterval(() => {
      const v = video.current;
      if (!v || !v.videoWidth) return;
      sampleCanvas.current ??= Object.assign(document.createElement('canvas'), { width: SAMPLE, height: SAMPLE });
      const ctx = sampleCanvas.current.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, SAMPLE, SAMPLE);
      const raw = toGray(ctx.getImageData(0, 0, SAMPLE, SAMPLE).data);
      let turns = rotationRef.current / 90;
      let sample = rotateSquare(raw, SAMPLE, turns);
      if (watchRotation && lastSample.current) {
        const fix = detectRotation(lastSample.current, sample, SAMPLE);
        if (fix !== 0) {
          turns = (turns + fix) % 4;
          setRotation((turns * 90) as Rotation);
          sample = rotateSquare(raw, SAMPLE, turns);
        }
      }
      lastSample.current = sample;
      if (watchStill && autoCapture.current.feed(sample)) capture();
    }, SAMPLE_MS);
    return () => window.clearInterval(timer);
  }, [ready, auto, paused, stabilize, capture, setRotation]);

  return (
    <div>
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-gray-900">
        {/* Bei 90°/270° tauschen Breite und Höhe (Rahmen 3:4), damit das gedrehte Bild ihn füllt. */}
        <video
          ref={video}
          muted
          playsInline
          aria-label="Kamerabild"
          className="absolute left-1/2 top-1/2 object-cover"
          style={{
            width: rotation % 180 === 0 ? '100%' : '133.334%',
            height: rotation % 180 === 0 ? '100%' : '75%',
            // Tailwind begrenzt Videos sonst auf 100 % Breite.
            maxWidth: 'none',
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          }}
        />
        {ready && (
          <button
            type="button"
            onClick={rotate}
            title="Bild drehen"
            aria-label={`Bild drehen (jetzt ${rotation}°)`}
            className="absolute right-2 top-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowUturnRightIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        {/* Rahmen als Hilfe zum Ausrichten. */}
        {ready && (
          <div
            className={`pointer-events-none absolute left-1/2 top-1/2 aspect-[63/88] h-[82%] -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 ${
              paused ? 'border-pokemon-blue' : 'border-white/70'
            }`}
            aria-hidden="true"
          />
        )}
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-300">
            Kamera wird gestartet …
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-gray-100">
            {error}
          </div>
        )}
      </div>

      {devices.length > 1 && (
        <label className="mt-3 block">
          <span className={labelClass}>Kamera</span>
          <select
            className={`mt-1 ${inputClass}`}
            value={activeId ?? deviceId ?? ''}
            onChange={(e) => {
              storeDevice(e.target.value);
              setDeviceId(e.target.value);
            }}
          >
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Kamera ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={capture} disabled={!ready || paused} className={`flex-1 ${primaryButtonClass}`}>
          <CameraIcon className="h-4 w-4" aria-hidden="true" /> Jetzt scannen
        </button>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="rounded" />
          Automatisch
        </label>
        <label
          className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
          title="Dreht das iPhone sein Bild beim Neigen, wird es automatisch zurückgedreht"
        >
          <input
            type="checkbox"
            checked={stabilize}
            onChange={(e) => {
              setStabilize(e.target.checked);
              lastSample.current = null;
              try {
                localStorage.setItem(STABILIZE_KEY, e.target.checked ? '1' : '0');
              } catch {
                // Nur eine Bequemlichkeit.
              }
            }}
            className="rounded"
          />
          Drehung ausgleichen
        </label>
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {auto
          ? 'Lege die Karte in den Rahmen und halte still – der Scanner löst von selbst aus. Für die nächste Karte einfach tauschen.'
          : 'Lege die Karte in den Rahmen und klicke auf „Jetzt scannen“.'}{' '}
        iPhone als Kamera: iPhone in die Nähe des Macs legen (gleiche Apple-ID, WLAN und Bluetooth an), dann erscheint
        es in der Kameraliste.
      </p>
    </div>
  );
};

export default LiveCamera;
