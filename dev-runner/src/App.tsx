import { useState, useEffect } from 'react';
import { SettingsPanel } from './SettingsPanel';
import './style.css';

export function App() {
  const [devPort, setDevPort] = useState<number | null>(null);
  const [appId, setAppId] = useState('');
  const [manifestPath, setManifestPath] = useState('');
  const [isMainWindow, setIsMainWindow] = useState(false);

  useEffect(() => {
    const hash = window.location.hash || '';
    const params = new URLSearchParams(hash.replace(/^#\/?[^?]*\??/, ''));
    const port = params.get('devPort');
    const id = params.get('appId');
    const mp = params.get('manifestPath');
    const wl = params.get('__wl');
    if (port) setDevPort(Number(port));
    if (id) setAppId(id);
    if (mp) setManifestPath(mp);
    if (!port && (!wl || wl === 'main')) setIsMainWindow(true);
  }, []);

  if (isMainWindow) {
    return (
      <div className="app" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888', fontSize: 13, gap: 8, padding: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: '#555' }}>HAP Dev Runner</div>
        <div>请从 DevTools 启动项目以使用预览功能</div>
      </div>
    );
  }

  if (!devPort) {
    return (
      <div className="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888', fontSize: 13 }}>
        等待参数...
      </div>
    );
  }

  return <SettingsPanel devPort={devPort} appId={appId} manifestPath={manifestPath} />;
}
