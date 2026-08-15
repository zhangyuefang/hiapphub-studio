import { useState, useEffect } from 'react';
import { SettingsPanel } from './SettingsPanel';
import { TemplatePickerPage } from './TemplatePickerPage';
import { ProjectCreateForm } from './ProjectCreateForm';
import { DemoPage } from './DemoPage';
import { createProject, CreateProjectParams } from './create-project';
import { connectDevTools, onMessage, sendMessage, setWsPort } from './ws-client';
import './style.css';

type Route = 'main' | 'settings' | 'create-project' | 'create-form';

interface Template {
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

const SERVER_URL = (window as any).__HAP_SERVER_URL__ || 'http://127.0.0.1:3102';

export function App() {
  const [route, setRoute] = useState<Route>('main');
  const [devPort, setDevPort] = useState<number | null>(null);
  const [appId, setAppId] = useState('');
  const [manifestPath, setManifestPath] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    const hash = window.location.hash || '';
    const routeMatch = hash.match(/^#\/([^?]*)/);
    const routeName = routeMatch?.[1] || '';
    const params = new URLSearchParams(hash.replace(/^#\/?[^?]*\??/, ''));

    const wsPortParam = params.get('wsPort');
    if (wsPortParam) setWsPort(Number(wsPortParam));

    if (routeName === 'create-project') {
      setRoute('create-project');
      connectDevTools('runner');
    } else {
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
    }
  }, []);

  useEffect(() => {
    const cleanup = onMessage((msg: any) => {
      if (msg?.type === 'create-project') {
        setRoute('create-project');
      }
    });
    return cleanup;
  }, []);

  function handleTemplateSelect(tpl: Template) {
    setSelectedTemplate(tpl);
    setRoute('create-form');
  }

  async function handleCreateSubmit(params: CreateProjectParams) {
    setProgress('downloading');
    try {
      await createProject(params, (step) => setProgress(step));
      sendMessage({
        type: 'project-created',
        appId: params.appId,
        manifestPath: `${params.targetDir}/manifest.json`,
      });
    } catch (e) {
      setProgress('');
      throw e;
    }
  }

  if (route === 'settings' && devPort) {
    return <SettingsPanel devPort={devPort} appId={appId} manifestPath={manifestPath} />;
  }

  if (route === 'create-project') {
    return (
      <TemplatePickerPage
        onSelect={handleTemplateSelect}
        serverUrl={SERVER_URL}
      />
    );
  }

  if (route === 'create-form' && selectedTemplate) {
    return (
      <ProjectCreateForm
        template={selectedTemplate}
        serverUrl={SERVER_URL}
        progress={progress}
        onSubmit={handleCreateSubmit}
        onBack={() => { setProgress(''); setRoute('create-project'); }}
      />
    );
  }

  return <DemoPage />;
}
