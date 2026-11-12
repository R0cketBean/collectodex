import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  CogIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  DocumentArrowDownIcon,
  Bars3Icon,
  XMarkIcon,
  SquaresPlusIcon,
  ArchiveBoxIcon,
  StarIcon,
  CubeIcon,
  PhotoIcon,
  DocumentIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  RectangleStackIcon,
  CurrencyEuroIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { useCategoriesData } from '../../context/CollectionContext';
import GlobalSearch, { searchShortcutLabel } from '../common/GlobalSearch';

// Map von Icon-Namen zu Icon-Komponenten
const iconMap: Record<string, React.ElementType> = {
  collection: SquaresPlusIcon,
  archive: ArchiveBoxIcon,
  star: StarIcon,
  cube: CubeIcon,
  photograph: PhotoIcon,
  document: DocumentIcon
};

interface NavEntry {
  name: string;
  href: string;
  icon: React.ElementType;
}

// Die Seitenleiste hat drei Gruppen (#129): Auswertung und Katalog oben, die
// eigenen Kategorien in der Mitte, Verwaltung unten.
const MAIN_NAVIGATION: NavEntry[] = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Statistik', href: '/statistics', icon: ChartBarIcon },
  { name: 'Kartenkatalog', href: '/katalog', icon: RectangleStackIcon },
  { name: 'Preis-Check', href: '/preis-check', icon: CurrencyEuroIcon },
];

const ADMIN_NAVIGATION: NavEntry[] = [
  { name: 'Kategorien verwalten', href: '/category-management', icon: CogIcon },
  { name: 'Import/Export', href: '/import-export', icon: DocumentArrowDownIcon },
  { name: 'Einstellungen', href: '/settings', icon: Cog6ToothIcon },
];

const COLLAPSED_KEY = 'collectodex-sidebar-collapsed';

const readCollapsed = (): boolean => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
};

// Farben der Seitenleiste: hell bleibt sie blau, die Markierung ist aber nur
// noch eine aufgehellte Fläche. Dunkel ist sie neutral und setzt sich über
// einen Rand vom Inhalt ab; Gelb bleibt dem Symbol der aktiven Seite.
const SIDEBAR_SURFACE = 'bg-pokemon-blue dark:bg-gray-950 dark:border-r dark:border-gray-800';
const LINK_BASE =
  'group flex items-center rounded-md px-2 py-2 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70';
const LINK_ACTIVE = 'bg-white/20 text-white dark:bg-gray-800';
const LINK_IDLE =
  'text-white/90 hover:bg-white/10 hover:text-white dark:text-gray-300 dark:hover:bg-gray-800/60 dark:hover:text-white';
const ICON_ACTIVE = 'text-pokemon-yellow';
const ICON_IDLE = 'text-white/80 group-hover:text-white dark:text-gray-400 dark:group-hover:text-gray-200';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readCollapsed);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();

  // Cmd/Strg+K öffnet die Suche über alle Kategorien (#130) und schließt sie
  // auch wieder. Solange ein anderer Dialog offen ist (Eintrag bearbeiten,
  // Großansicht), bleibt das Kürzel ohne Wirkung, damit dort nichts verloren geht.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      setSearchOpen((open) => {
        if (open) return false;
        return !document.querySelector('[aria-modal="true"], .fixed.inset-0.overflow-y-auto');
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const openSearch = () => {
    setSidebarOpen(false);
    setSearchOpen(true);
  };
  // Beim Seitenwechsel wieder oben anfangen. Der Inhalt scrollt in <main>,
  // nicht im Fenster – ohne das behielt eine neue Seite die Scroll-Position der
  // alten (z. B. landete man nach der langen Set-Übersicht mitten in einem Set).
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);
  // Nur den Categories-Slice abonnieren (#18): Layout re-rendert dadurch nicht
  // mehr bei Item-/Snapshot-Änderungen, sondern nur bei Kategorie-Änderungen.
  const categories = useCategoriesData();

  // Sortiere Kategorien nach Reihenfolge; ausgeblendete (#66) erscheinen
  // nicht in der Navigation (ihre Werte zählen im Dashboard weiterhin).
  const sortedCategories = [...categories]
    .filter(category => !category.hidden)
    .sort((a, b) => a.order - b.order);

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, prev ? '0' : '1');
      } catch {
        // Ohne localStorage gilt die Wahl nur für diese Sitzung.
      }
      return !prev;
    });
  };

  const isActive = (href: string) =>
    href === '/' ? location.pathname === '/' : location.pathname.startsWith(href);

  // Ein Navigationseintrag. Eingeklappt bleibt nur das Symbol, der Name steht im Tooltip.
  const navLink = (
    entry: NavEntry,
    active: boolean,
    options: { collapsed: boolean; large: boolean; onNavigate?: () => void }
  ) => (
    <Link
      key={entry.href}
      to={entry.href}
      onClick={options.onNavigate}
      aria-current={active ? 'page' : undefined}
      title={options.collapsed ? entry.name : undefined}
      className={`${LINK_BASE} ${active ? LINK_ACTIVE : LINK_IDLE} ${options.large ? 'text-base' : 'text-sm'} ${
        options.collapsed ? 'justify-center' : ''
      }`}
    >
      <entry.icon
        className={`${options.collapsed ? '' : 'mr-3'} h-6 w-6 flex-shrink-0 ${active ? ICON_ACTIVE : ICON_IDLE}`}
        aria-hidden="true"
      />
      {options.collapsed ? <span className="sr-only">{entry.name}</span> : <span className="truncate">{entry.name}</span>}
    </Link>
  );

  // Überschrift einer Gruppe; eingeklappt bleibt davon eine Trennlinie.
  const groupLabel = (label: string, collapsed: boolean) =>
    collapsed ? (
      <div className="mx-2 my-3 border-t border-white/20 dark:border-gray-800" role="separator" />
    ) : (
      <h2 className="px-2 pb-1 pt-5 text-xs font-semibold uppercase tracking-wider text-white/70 dark:text-gray-500">
        {label}
      </h2>
    );

  const renderNavigation = (options: { collapsed: boolean; large: boolean; onNavigate?: () => void }) => (
    <nav className="mt-5 flex flex-1 flex-col px-2" aria-label="Hauptnavigation">
      <button
        type="button"
        onClick={openSearch}
        aria-label="Sammlung durchsuchen"
        aria-keyshortcuts="Meta+K Control+K"
        title={options.collapsed ? `Suchen (${searchShortcutLabel()})` : undefined}
        className={`mb-3 flex items-center rounded-md bg-white/10 px-2 py-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 ${
          options.large ? 'text-base' : 'text-sm'
        } ${options.collapsed ? 'justify-center' : ''}`}
      >
        <MagnifyingGlassIcon className={`${options.collapsed ? '' : 'mr-3'} h-5 w-5 flex-shrink-0`} aria-hidden="true" />
        {!options.collapsed && (
          <>
            <span className="flex-1 text-left">Suchen</span>
            <kbd className="hidden rounded border border-white/30 px-1.5 text-xs font-sans text-white/70 md:inline dark:border-gray-700 dark:text-gray-500">
              {searchShortcutLabel()}
            </kbd>
          </>
        )}
      </button>
      <div className="space-y-1">{MAIN_NAVIGATION.map((entry) => navLink(entry, isActive(entry.href), options))}</div>

      {groupLabel('Kategorien', options.collapsed)}
      <div className="space-y-1">
        {sortedCategories.map((category) =>
          navLink(
            {
              name: category.name,
              href: `/category/${category.id}`,
              icon: (category.icon && iconMap[category.icon]) || SquaresPlusIcon,
            },
            location.pathname === `/category/${category.id}`,
            options
          )
        )}
        {sortedCategories.length === 0 && !options.collapsed && (
          <p className="px-2 py-1 text-xs text-white/60 dark:text-gray-500">Noch keine Kategorien angelegt.</p>
        )}
      </div>

      {/* Verwaltung steht unten; bei vielen Kategorien rückt sie einfach nach. */}
      <div className="mt-auto pt-2">
        {groupLabel('Verwaltung', options.collapsed)}
        <div className="space-y-1">
          {ADMIN_NAVIGATION.map((entry) => navLink(entry, isActive(entry.href), options))}
        </div>
      </div>
    </nav>
  );

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100 dark:bg-gray-900">
      {/* Mobile Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'fixed inset-0 z-40 flex' : 'hidden'
        } md:hidden`}
      >
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-75"
          onClick={() => setSidebarOpen(false)}
        ></div>

        <div className={`relative flex-1 flex flex-col max-w-[85%] w-full sm:max-w-xs ${SIDEBAR_SURFACE}`}>
          <div className="absolute top-2 right-0 -mr-12 pt-1">
            <button
              type="button"
              aria-label="Navigation schließen"
              className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white bg-gray-600 bg-opacity-50"
              onClick={() => setSidebarOpen(false)}
            >
              <XMarkIcon className="h-6 w-6 text-white" />
            </button>
          </div>

          <div className="flex-1 h-0 flex flex-col pt-5 pb-4 overflow-y-auto">
            <div className="flex-shrink-0 flex items-center px-4">
              <span className="text-white text-xl font-bold">CollectODex</span>
            </div>
            {renderNavigation({ collapsed: false, large: true, onNavigate: () => setSidebarOpen(false) })}
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className={`hidden md:flex md:flex-shrink-0 transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'md:w-16' : 'md:w-64'}`}>
        <div className="flex flex-col w-full">
          <div className={`flex-1 flex flex-col min-h-0 ${SIDEBAR_SURFACE}`}>
            <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
              <div className={`flex items-center flex-shrink-0 px-4 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
                {!sidebarCollapsed && <span className="text-white text-xl font-bold">CollectODex</span>}
                <button
                  type="button"
                  onClick={toggleSidebarCollapse}
                  aria-label={sidebarCollapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
                  title={sidebarCollapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
                  className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                >
                  {sidebarCollapsed ? (
                    <ChevronDoubleRightIcon className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <ChevronDoubleLeftIcon className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>
              {renderNavigation({ collapsed: sidebarCollapsed, large: false })}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        <div className="md:hidden flex items-center justify-between pl-1 pr-1 pt-1 sm:pl-3 sm:pr-3 sm:pt-3">
          <button
            type="button"
            aria-label="Navigation öffnen"
            className="-ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-pokemon-blue"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Sammlung durchsuchen"
            className="h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-pokemon-blue"
            onClick={openSearch}
          >
            <MagnifyingGlassIcon className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        <main ref={mainRef} className="flex-1 relative z-0 overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="w-full px-4 sm:px-6 md:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>

      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </div>
  );
};

export default Layout;
