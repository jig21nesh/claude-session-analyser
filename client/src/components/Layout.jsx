import { Outlet, useLocation } from 'react-router-dom';
import { useCallback } from 'react';
import Header from './Header.jsx';
import Footer from './Footer.jsx';

export default function Layout() {
  const location = useLocation();
  // Refresh completed -> notify every useApi hook to refetch.
  const onRefreshed = useCallback(() => {
    window.dispatchEvent(new CustomEvent('analysis-refreshed'));
  }, []);

  return (
    <div className="shell">
      <Header onRefreshed={onRefreshed} />
      <main key={location.key}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
