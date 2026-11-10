import React, { useState } from 'react';
import type { ImageSource } from '../../services/tcgdex';

interface Props {
  /** Kandidaten in Reihenfolge; scheitert einer, wird der nächste versucht. */
  sources: ImageSource[];
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  /** Kennzeichnet englische Ersatzbilder mit einem kleinen „EN“-Schild. */
  showLanguageBadge?: boolean;
  /** Wird angezeigt, wenn kein Kandidat geladen werden kann. */
  fallback?: React.ReactNode;
}

// Bild mit Ersatzquellen: TCGdex hat nicht für jede deutsche Karte ein Bild,
// dann zeigt der Katalog die englische Fassung statt eines leeren Platzhalters.
const FallbackImage: React.FC<Props> = ({ sources, alt, className, loading, showLanguageBadge, fallback = null }) => {
  // Fehlgeschlagene URLs merken (statt eines Index), damit später nachgeladene
  // Quellen – z. B. die englischen Bilder – noch versucht werden.
  const [failed, setFailed] = useState<string[]>([]);
  const source = sources.find((s) => !failed.includes(s.url));
  if (!source) return <>{fallback}</>;
  return (
    <>
      <img
        src={source.url}
        alt={alt}
        loading={loading}
        className={className}
        onError={() => setFailed((prev) => [...prev, source.url])}
      />
      {showLanguageBadge && source.lang === 'en' && (
        <span
          title="Englisches Bild – für die deutsche Karte liegt keines vor"
          className="absolute top-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
        >
          EN
        </span>
      )}
    </>
  );
};

export default FallbackImage;
