import { useMemo } from 'react';
import { useActiveSection } from '../hooks/useActiveSection.js';
import GettingStarted from './help/GettingStarted.jsx';
import CostMath from './help/CostMath.jsx';
import Forecasting from './help/Forecasting.jsx';
import SavingTokens from './help/SavingTokens.jsx';
import { Privacy, Faq } from './help/PrivacyFaq.jsx';

const SECTIONS = [
  { id: 'getting-started', icon: '🚀', label: 'How it works' },
  { id: 'cost-math', icon: '💰', label: 'Cost calculation' },
  { id: 'forecasting', icon: '🔮', label: 'Forecasting & ML' },
  { id: 'saving-tokens', icon: '⚡', label: 'Saving tokens' },
  { id: 'privacy', icon: '🔒', label: 'Privacy & security' },
  { id: 'faq', icon: '❓', label: 'FAQ' },
];

export default function HelpPage() {
  const ids = useMemo(() => SECTIONS.map((s) => s.id), []);
  const active = useActiveSection(ids);

  return (
    <>
      <h1 className="page-title">Help</h1>
      <p className="page-subtitle">
        How the analyser works, what the numbers mean, and how the forecast is built.
      </p>
      <div className="docs-layout">
        <nav className="docs-nav" aria-label="Help sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={active === s.id ? 'active' : ''}>
              <span aria-hidden="true">{s.icon}</span> {s.label}
            </a>
          ))}
        </nav>
        <div className="docs-content">
          <GettingStarted />
          <CostMath />
          <Forecasting />
          <SavingTokens />
          <Privacy />
          <Faq />
        </div>
      </div>
    </>
  );
}
