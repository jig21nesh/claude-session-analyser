import { NavLink } from 'react-router-dom';
import RefreshButton from './RefreshButton.jsx';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/projects', label: 'Projects' },
  { to: '/improvements', label: 'Improvements' },
  { to: '/help', label: 'Help' },
];

export default function Header({ onRefreshed }) {
  return (
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
      <RefreshButton onDone={onRefreshed} />
    </header>
  );
}
