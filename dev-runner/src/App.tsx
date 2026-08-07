import { useState, useEffect, useCallback } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { TemplatePickerPage } from './TemplatePickerPage';
import { ProjectCreateForm } from './ProjectCreateForm';
import { createProject, type CreateProjectParams } from './create-project';
import { sendMessage, onMessage, connectDevTools } from './ws-client';
import './style.css';

type Route = 'main' | 'settings' | 'create-project';

interface SelectedTemplate {
  id: string;
  slug: string;
  templateCode: string;
  name: string;
  description: string;
  category: string;
  thumbnail: string;
  version: string;
  tags: string[];
  components: string[];
}

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:3000';

export function App() {
  const [route, setRoute] = useState<Route>('main');
  const [devPort, setDevPort] = useState<number | null>(null);
  const [appId, setAppId] = useState('');
  const [manifestPath, setManifestPath] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<SelectedTemplate | null>(null);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    const hash = window.location.hash || '';
    const path = hash.replace(/^#\/?/, '').split('?')[0];

    if (path === 'create-project') {
      setRoute('create-project');
      connectDevTools('creator');
      return;
    }

    const params = new URLSearchParams(hash.replace(/^#\/?[^?]*\??/, ''));
    const port = params.get('devPort');
    const id = params.get('appId');
    const mp = params.get('manifestPath');
    const wl = params.get('__wl');

    if (port) {
      setDevPort(Number(port));
      if (id) setAppId(id);
      if (mp) setManifestPath(mp);
      setRoute('settings');
    } else if (!wl || wl === 'main') {
      setRoute('main');
      connectDevTools('runner');
    }
  }, []);

  useEffect(() => {
    return onMessage((msg) => {
      if (msg.type === 'create-project') {
        setRoute('create-project');
        setSelectedTemplate(null);
        setProgress('');
      }
    });
  }, []);

  const handleTemplateSelect = useCallback((tpl: SelectedTemplate) => {
    setSelectedTemplate(tpl);
  }, []);

  const handleCreateProject = useCallback(async (params: CreateProjectParams) => {
    setProgress('downloading');
    try {
      await createProject(params, (step) => setProgress(step));
      sendMessage({
        type: 'project-created',
        appId: params.appId,
        manifestPath: `${params.targetDir}/manifest.json`,
      });
    } catch (e: any) {
      setProgress('');
      throw e;
    }
  }, []);

  const handleBack = useCallback(() => {
    setSelectedTemplate(null);
    setProgress('');
  }, []);

  if (route === 'create-project') {
    if (progress === 'done') {
      return (
        <div className="app" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--fs-text)', fontSize: 13, gap: 8, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>项目创建成功</div>
          <div>DevTools 将自动打开预览</div>
        </div>
      );
    }

    if (selectedTemplate) {
      return (
        <ProjectCreateForm
          template={selectedTemplate}
          serverUrl={SERVER_URL}
          progress={progress}
          onSubmit={handleCreateProject}
          onBack={handleBack}
        />
      );
    }

    return (
      <TemplatePickerPage
        serverUrl={SERVER_URL}
        onSelect={handleTemplateSelect}
      />
    );
  }

  if (route === 'settings' && devPort) {
    return <SettingsPanel devPort={devPort} appId={appId} manifestPath={manifestPath} />;
  }

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--fs-text-secondary)', fontSize: 13, gap: 12, padding: 20, textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--fs-text)' }}>HAP Dev Runner</div>
      <div>请从 DevTools 启动项目以使用预览功能</div>
      <button
        className="tpl-submit-btn"
        style={{ marginTop: 8, fontSize: 12, padding: '7px 16px' }}
        onClick={() => { setRoute('create-project'); setSelectedTemplate(null); setProgress(''); }}
      >
        从模板创建项目
      </button>
    </div>
  );
}
