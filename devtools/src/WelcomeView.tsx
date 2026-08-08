import { useEffect, useRef } from 'react';
import { FolderOpen, FilePlus } from 'lucide-react';
import { t } from './i18n';
import { WorkspaceConfig } from './scaffold';

interface WelcomeViewProps {
  pendingRestore: React.RefObject<{ dir: string; tabs: string[] } | null>;
  onOpen: () => void;
  onCreate: () => void;
  onRestore: (dir: string, cfg: WorkspaceConfig, tabs: string[]) => void;
  readWorkspace: (dir: string) => Promise<WorkspaceConfig | null>;
}

export function WelcomeView({ pendingRestore, onOpen, onCreate, onRestore, readWorkspace }: WelcomeViewProps) {
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current) return;
    const r = pendingRestore.current;
    if (!r) return;
    tried.current = true;
    pendingRestore.current = null;
    readWorkspace(r.dir).then(cfg => {
      if (cfg) {
        const validTabs = r.tabs.filter(id => cfg.projects?.some(p => p.id === id));
        onRestore(r.dir, cfg, validTabs);
      }
    });
  }, []);

  return (
    <main className="main-content center-view">
      <div className="welcome">
        <h2>{t('welcome.title')}</h2>
        <div className="welcome-actions">
          <button className="welcome-btn" onClick={onOpen}>
            <FolderOpen size={20} /><span>{t('workspace.open')}</span>
          </button>
          <button className="welcome-btn" onClick={onCreate}>
            <FilePlus size={20} /><span>{t('workspace.create')}</span>
          </button>
        </div>
      </div>
    </main>
  );
}
