import React from 'react';
import { HashRouter as Router, Route, Routes } from 'react-router-dom';
import { CollectionProvider } from './context/CollectionContext';
import { LoadingProvider } from './context/LoadingContext';
import { FeedbackProvider } from './context/FeedbackContext';
import Layout from './components/layout/Layout';
import LoadingOverlayContainer from './components/common/LoadingOverlayContainer';
import UpdateNotification from './components/common/UpdateNotification';

// Seiten importieren
import Dashboard from './pages/Dashboard';
import CategoryItemsList from './pages/CategoryItemsList';
import CategoryManagement from './pages/CategoryManagement';
import ImportExport from './pages/ImportExport';
import Settings from './pages/Settings';
import Statistics from './pages/Statistics';
import CardCatalog from './pages/CardCatalog';
import CardCatalogSet from './pages/CardCatalogSet';
import CatalogLinkAssistant from './pages/CatalogLinkAssistant';
import PriceCheck from './pages/PriceCheck';

function App() {
  return (
    <CollectionProvider>
      <LoadingProvider>
        <FeedbackProvider>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/category/:categoryId" element={<CategoryItemsList />} />
              <Route path="/category-management" element={<CategoryManagement />} />
              <Route path="/import-export" element={<ImportExport />} />
              <Route path="/statistics" element={<Statistics />} />
              <Route path="/katalog" element={<CardCatalog />} />
              <Route path="/katalog/verknuepfen" element={<CatalogLinkAssistant />} />
              <Route path="/katalog/:setId" element={<CardCatalogSet />} />
              <Route path="/katalog/:lang/:setId" element={<CardCatalogSet />} />
              <Route path="/preis-check" element={<PriceCheck />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
            <LoadingOverlayContainer />
            <UpdateNotification />
          </Layout>
        </Router>
        </FeedbackProvider>
      </LoadingProvider>
    </CollectionProvider>
  );
}

export default App;