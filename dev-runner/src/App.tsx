import { useState, useEffect } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { connectDevTools } from './ws-client';
import './style.css';

type Route = 'main' | 'settings';

export function App() {
  const [route, setRoute] = useState<Route>('main');
  const [devPort, setDevPort] = useState<number | null>(null);
  const [appId, setAppId] = useState('');
  const [manifestPath, setManifestPath] = useState('');

  useEffect(() => {
    const hash = window.location.hash || '';
    const params = new URLSearchParams(hash.replace(/^#\/?[^?]*\??/, ''));
    const port = params.get('devPort');
    const id = params.get('appId');
    const mp = params.get('manifestPath');

    if (port) {
      setDevPort(Number(port));
      if (id) setAppId(id);
      if (mp) setManifestPath(mp);
      setRoute('settings');
    } else {
      setRoute('main');
      connectDevTools('runner');
    }
  }, []);

  if (route === 'settings' && devPort) {
    return <SettingsPanel devPort={devPort} appId={appId} manifestPath={manifestPath} />;
  }

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--fs-text-secondary)', fontSize: 13, gap: 12, padding: 20, textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--fs-text)' }}>HAP Dev Runner</div>
      <div>请从 DevTools 启动项目以使用预览功能</div>
    </div>
  );
}
