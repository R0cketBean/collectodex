import React from 'react';

// Leerzustand einer Seite oder Liste (#129): sagt, was hier hingehört, und
// bietet den ersten Schritt als Knopf an, statt nur „Keine Daten“ zu melden.

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  /** Ein, zwei Sätze: was man hier tun kann. */
  children?: React.ReactNode;
  /** Knöpfe oder Links, die Hauptaktion zuerst. */
  actions?: React.ReactNode;
  /** Ohne eigene Fläche, wenn der Leerzustand schon in einer Karte steht. */
  plain?: boolean;
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, children, actions, plain = false, className = '' }) => (
  <div
    className={`px-6 py-10 text-center ${plain ? '' : 'rounded-lg bg-white dark:bg-gray-800 shadow'} ${className}`}
  >
    {Icon && <Icon className="mx-auto h-10 w-10 text-gray-400 dark:text-gray-500" aria-hidden="true" />}
    <h3 className={`${Icon ? 'mt-3' : ''} text-base font-semibold text-gray-900 dark:text-gray-100`}>{title}</h3>
    {children && <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">{children}</p>}
    {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
  </div>
);

export default EmptyState;
