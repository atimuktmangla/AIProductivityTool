import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Dashboard } from './components/Dashboard.js';
import { SyncPage } from './components/SyncPage.js';
import './styles.css';
function App() {
    const [page, setPage] = useState('dashboard');
    useEffect(() => {
        const handler = () => setPage('sync');
        window.addEventListener('navigate-to-sync', handler);
        return () => window.removeEventListener('navigate-to-sync', handler);
    }, []);
    return (_jsxs(_Fragment, { children: [_jsxs("nav", { className: "app-nav", children: [_jsx("button", { type: "button", className: `app-nav__tab${page === 'dashboard' ? ' app-nav__tab--active' : ''}`, onClick: () => setPage('dashboard'), children: "Developer Metrics" }), _jsx("button", { type: "button", className: `app-nav__tab${page === 'sync' ? ' app-nav__tab--active' : ''}`, onClick: () => setPage('sync'), children: "Sync Jobs" })] }), page === 'dashboard' ? _jsx(Dashboard, {}) : _jsx(SyncPage, {})] }));
}
const root = document.getElementById('root');
if (!root)
    throw new Error('#root element not found');
createRoot(root).render(_jsx(StrictMode, { children: _jsx(App, {}) }));
