import { useState, useEffect } from 'react';
import { Package, Library, X } from 'lucide-react';
import { t, getLocale } from '../i18n';
import { initTheme } from '../theme';

interface ProjectItem {
  id: string;
  type: 'hap' | 'hpl';
  displayName?: string;
}

function getParam(key: string): string {
  const hash = window.location.hash || '';
  const m = hash.match(new RegExp('[?&]' + key + '=([^&]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

const isMac = navigator.platform.toUpperCase().includes('MAC');

export function OpenProjectDialog() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [openIds, setOpenIds] = useState<string[]>([]);

  useEffect(() => {
    initTheme();
    const raw = getParam('projects');
    const opened = getParam('opened');
    if (raw) {
      try { setProjects(JSON.parse(raw)); } catch {}
    }
    if (opened) {
      try { setOpenIds(JSON.parse(opened)); } catch {}
    }
  }, []);

  const selectProject = (id: string) => {
    (window as any).hap?.window?.postMessage?.('main', { type: 'open-project', id });
    (window as any).hap?.window?.close?.();
  };

  const closeDialog = () => {
    (window as any).hap?.window?.close?.();
  };

  return (
    <div className="dialog-root">
      <div className="dialog-header" data-tauri-drag-region
        style={{ paddingLeft: isMac ? 78 : 12 }}>
        <span>{t('project.open')}</span>
        {!isMac && (
          <button className="dialog-close-btn" onClick={closeDialog}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="dialog-body">
        {projects.length === 0 && (
          <div className="dialog-empty">{t('project.empty')}</div>
        )}
        {projects.map(p => {
          const isOpen = openIds.includes(p.id);
          return (
            <div key={p.id} className={`dialog-proj-item ${isOpen ? 'opened' : ''}`}
              onClick={() => { if (!isOpen) selectProject(p.id); }}>
              <div className="dialog-proj-icon">
                {p.type === 'hap' ? <Package size={20} /> : <Library size={20} />}
              </div>
              <div className="dialog-proj-info">
                <div className="dialog-proj-name">{p.displayName || p.id}</div>
                <div className="dialog-proj-meta">{p.type.toUpperCase()} &middot; {p.id}</div>
              </div>
              {isOpen && <span className="dialog-proj-badge">{t('project.opened')}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
