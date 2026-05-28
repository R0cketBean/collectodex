import React from 'react';
import { HashRouter as Router, Route, Routes } from 'react-router-dom';
import { CollectionProvider } from './context/CollectionContext';
import { LoadingProvider } from './context/LoadingContext';
import Layout from './components/layout/Layout';
import LoadingOverlayContainer from './components/common/LoadingOverlayContainer';

// Seiten importieren
import Dashboard from './pages/Dashboard';
import CategoryItemsList from './pages/CategoryItemsList';
import CategoryManagement from './pages/CategoryManagement';
import ImportExport from './pages/ImportExport';

function App() {
  return (
    <CollectionProvider>
      <LoadingProvider>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/category/:categoryId" element={<CategoryItemsList />} />
              <Route path="/category-management" element={<CategoryManagement />} />
              <Route path="/import-export" element={<ImportExport />} />
            </Routes>
            <LoadingOverlayContainer />
          </Layout>
        </Router>
      </LoadingProvider>
    </CollectionProvider>
  );
}

export default App;