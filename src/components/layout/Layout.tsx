import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
    HomeIcon,
    CogIcon,
    Cog6ToothIcon,
    DocumentArrowDownIcon,
    Bars3Icon,
    XMarkIcon,
    SquaresPlusIcon,
    ArchiveBoxIcon,
    StarIcon,
    CubeIcon,
    PhotoIcon,
    DocumentIcon,
    ChevronUpIcon
} from '@heroicons/react/24/outline';
import { useCategoriesData } from '../../context/CollectionContext';

// Map von Icon-Namen zu Icon-Komponenten
const iconMap: Record<string, React.ElementType> = {
  collection: SquaresPlusIcon,
  archive: ArchiveBoxIcon,
  star: StarIcon,
  cube: CubeIcon,
  photograph: PhotoIcon,
  document: DocumentIcon
};

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  // Nur den Categories-Slice abonnieren (#18): Layout re-rendert dadurch nicht
  // mehr bei Item-/Snapshot-Änderungen, sondern nur bei Kategorie-Änderungen.
  const categories = useCategoriesData();
  
  // Sortiere Kategorien nach Reihenfolge; ausgeblendete (#66) erscheinen
  // nicht in der Navigation (ihre Werte zählen im Dashboard weiterhin).
  const sortedCategories = [...categories]
    .filter(category => !category.hidden)
    .sort((a, b) => a.order - b.order);

  // Statische Navigationselemente
  const staticNavigation = [
    { name: 'Dashboard', href: '/', icon: HomeIcon },
    { name: 'Kategorien verwalten', href: '/category-management', icon: CogIcon },
    { name: 'Import/Export', href: '/import-export', icon: DocumentArrowDownIcon },
    { name: 'Einstellungen', href: '/settings', icon: Cog6ToothIcon },
  ];

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };
  
  const toggleSidebarCollapse = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };
  
  // Hilfsfunktion, um das richtige Icon zu rendern
  const renderIcon = (iconName?: string) => {
    const IconComponent = iconName && iconMap[iconName] ? iconMap[iconName] : SquaresPlusIcon;
    return <IconComponent className={`${sidebarCollapsed ? '' : 'mr-3'} h-6 w-6 text-pokemon-yellow`} aria-hidden="true" />;
  };

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
        
        <div className="relative flex-1 flex flex-col max-w-[85%] w-full sm:max-w-xs bg-pokemon-blue">
          <div className="absolute top-2 right-0 -mr-12 pt-1">
            <button
              className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white bg-gray-600 bg-opacity-50"
              onClick={() => setSidebarOpen(false)}
            >
              <XMarkIcon className="h-6 w-6 text-white" />
            </button>
          </div>
          
          <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
            <div className="flex-shrink-0 flex items-center px-4">
              <h1 className="text-white text-xl font-bold">Pokémon Sammlung</h1>
            </div>
            <nav className="mt-5 px-2 space-y-1">
              {/* Statische Navigationselemente */}
              {staticNavigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`${
                    location.pathname === item.href
                      ? 'bg-pokemon-light-blue text-white'
                      : 'text-white hover:bg-pokemon-light-blue'
                  } group flex items-center px-2 py-2 text-base font-medium rounded-md`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon
                    className="mr-4 h-6 w-6 text-pokemon-yellow"
                    aria-hidden="true"
                  />
                  {item.name}
                </Link>
              ))}
              
              {/* Trennlinie */}
              <div className="border-t border-pokemon-light-blue my-2"></div>
              
              {/* Dynamische Kategorien */}
              {sortedCategories.map((category) => (
                <Link
                  key={category.id}
                  to={`/category/${category.id}`}
                  className={`${
                    location.pathname === `/category/${category.id}`
                      ? 'bg-pokemon-light-blue text-white'
                      : 'text-white hover:bg-pokemon-light-blue'
                  } group flex items-center px-2 py-2 text-base font-medium rounded-md`}
                  onClick={() => setSidebarOpen(false)}
                >
                  {renderIcon(category.icon)}
                  {category.name}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <div className={`hidden md:flex md:flex-shrink-0 transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'md:w-16' : 'md:w-64'}`}>
        <div className="flex flex-col w-full">
          <div className="flex-1 flex flex-col min-h-0 bg-pokemon-blue">
            <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
              <div className={`flex items-center flex-shrink-0 px-4 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
                {!sidebarCollapsed && (
                  <>
                    <h1 className="text-white text-xl font-bold">Pokémon Sammlung</h1>
                    <button
                      onClick={toggleSidebarCollapse}
                      className="text-white hover:bg-pokemon-light-blue rounded-md p-1"
                    >
                      <ChevronUpIcon className="h-6 w-6 text-pokemon-yellow -rotate-90" aria-hidden="true" />
                    </button>
                  </>
                )}
                {sidebarCollapsed && (
                  <button
                    onClick={toggleSidebarCollapse}
                    className="text-white hover:bg-pokemon-light-blue rounded-md p-1"
                  >
                    <ChevronUpIcon className="h-6 w-6 text-pokemon-yellow rotate-90" aria-hidden="true" />
                  </button>
                )}
              </div>
              <nav className="mt-5 flex-1 px-2 space-y-1">
                {/* Statische Navigationselemente */}
                {staticNavigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`${
                      location.pathname === item.href
                        ? 'bg-pokemon-light-blue text-white'
                        : 'text-white hover:bg-pokemon-light-blue'
                    } group flex items-center px-2 py-2 text-sm font-medium rounded-md ${sidebarCollapsed ? 'justify-center' : ''}`}
                    title={sidebarCollapsed ? item.name : ''}
                  >
                    <item.icon
                      className={`${sidebarCollapsed ? '' : 'mr-3'} h-6 w-6 text-pokemon-yellow`}
                      aria-hidden="true"
                    />
                    {!sidebarCollapsed && item.name}
                  </Link>
                ))}
                
                {/* Trennlinie */}
                <div className="border-t border-pokemon-light-blue my-2"></div>
                
                {/* Dynamische Kategorien */}
                {sortedCategories.map((category) => (
                  <Link
                    key={category.id}
                    to={`/category/${category.id}`}
                    className={`${
                      location.pathname === `/category/${category.id}`
                        ? 'bg-pokemon-light-blue text-white'
                        : 'text-white hover:bg-pokemon-light-blue'
                    } group flex items-center px-2 py-2 text-sm font-medium rounded-md ${sidebarCollapsed ? 'justify-center' : ''}`}
                    title={sidebarCollapsed ? category.name : ''}
                  >
                    {renderIcon(category.icon)}
                    {!sidebarCollapsed && category.name}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        <div className="md:hidden pl-1 pt-1 sm:pl-3 sm:pt-3">
          <button
            className="-ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-pokemon-blue"
            onClick={toggleSidebar}
          >
            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
        
        <main className="flex-1 relative z-0 overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="w-full px-4 sm:px-6 md:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;