import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useCallback } from 'react';
import RefreshButton from './RefreshButton.jsx';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/projects', label: 'Projects' },
  { to: '/improvements', label: 'Improvements' },
  { to: '/help', label: 'Help' },
];

export default function Layout() {
  const location = useLocation();
  // Refresh completes -> remount the current route so every page refetches.
  const reloadPage = useCallback(() => {
    window.dispatchEvent(new CustomEvent('analysis-refreshed'));
  }, []);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◆</span>
          <span>Claude Session Analyser</span>
        </div>
        <nav className="nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <RefreshButton onDone={reloadPage} />
      </header>
      <main key={location.key}>
        <Outlet />
      </main>
    </div>
  );
}
