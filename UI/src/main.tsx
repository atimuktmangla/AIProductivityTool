import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Dashboard } from './components/Dashboard.js';
import { SyncPage } from './components/SyncPage.js';
import './styles.css';

type Page = 'dashboard' | 'sync';

function App() {
  const [page, setPage] = useState<Page>('dashboard');

  useEffect(() => {
    const handler = () => setPage('sync');
    window.addEventListener('navigate-to-sync', handler);
    return () => window.removeEventListener('navigate-to-sync', handler);
  }, []);

  return (
    <>
      <nav className="app-nav">
        <button
          type="button"
          className={`app-nav__tab${page === 'dashboard' ? ' app-nav__tab--active' : ''}`}
          onClick={() => setPage('dashboard')}
        >
          Developer Metrics
        </button>
        <button
          type="button"
          className={`app-nav__tab${page === 'sync' ? ' app-nav__tab--active' : ''}`}
          onClick={() => setPage('sync')}
        >
          Sync Jobs
        </button>
      </nav>
      {page === 'dashboard' ? <Dashboard /> : <SyncPage />}
    </>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
