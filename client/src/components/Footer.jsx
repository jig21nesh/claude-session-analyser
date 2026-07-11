import { Link } from 'react-router-dom';
import { MODEL_SWITCHER_URL } from '../constants.js';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-privacy">
        🔒 100% local — transcripts are read from <code>~/.claude/projects</code>, only usage
        metadata is stored, and nothing leaves your machine.
      </div>
      <nav className="footer-links" aria-label="Footer">
        <Link to="/help">How it works</Link>
        <Link to="/help">Forecast model</Link>
        <a href={MODEL_SWITCHER_URL} target="_blank" rel="noreferrer">
          model-switcher
        </a>
      </nav>
      <div className="footer-meta">web :15800 · api :15801 · MIT licence</div>
    </footer>
  );
}
