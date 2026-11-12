import React, { useEffect, useRef, useState } from 'react';
import { ensureThumb, previewSource, thumbRefFor } from '../../utils/thumbnails';

// Kleine Vorschau eines Bildes (#128). Für abgelegte Fotos lädt sie das
// Vorschaubild; gibt es noch keins, wird es einmal erzeugt und so lange ein
// Platzhalter gezeigt. Erst wenn das nicht klappt, kommt das Original.

type Stage = 'preview' | 'building' | 'original' | 'failed';

interface ThumbnailProps {
  /** Wert aus `item.images`: Verweis, Data-URL oder Internetadresse. */
  image: string;
  alt: string;
  className?: string;
  /** Anzeige, wenn sich gar kein Bild laden lässt. */
  fallback?: React.ReactNode;
}

const ThumbnailInner: React.FC<ThumbnailProps> = ({ image, alt, className, fallback = null }) => {
  const [src, setSrc] = useState(() => previewSource(image));
  const [stage, setStage] = useState<Stage>('preview');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const handleError = () => {
    if (stage === 'preview' && thumbRefFor(image) && !src.includes('?v=')) {
      // Vorschaubild fehlt noch: erzeugen, dann anzeigen.
      setStage('building');
      void ensureThumb(image).then((thumb) => {
        if (!alive.current) return;
        setSrc(thumb ?? image);
        setStage(thumb ? 'preview' : 'original');
      });
    } else if (stage !== 'original' && src !== image) {
      setSrc(image);
      setStage('original');
    } else {
      setStage('failed');
    }
  };

  if (stage === 'failed') return <>{fallback}</>;
  if (stage === 'building') {
    return <div className={`${className ?? ''} animate-pulse bg-gray-200 dark:bg-gray-700`} aria-hidden="true" />;
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={handleError} className={className} />;
};

/** Beginnt bei einem anderen Bild von vorn. */
const Thumbnail: React.FC<ThumbnailProps> = (props) => <ThumbnailInner key={props.image} {...props} />;

export default Thumbnail;
