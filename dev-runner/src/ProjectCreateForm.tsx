import { useState } from 'react';
import { ArrowLeft, FolderOpen, Loader2 } from 'lucide-react';
import type { CreateProjectParams, ProjectConfig } from './create-project';
import { LocalePicker } from './LocalePicker';

const hap = (window as any).hap;

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

interface Props {
  template: Template;
  serverUrl: string;
  progress: string;
  onSubmit: (params: CreateProjectParams) => Promise<void>;
  onBack: () => void;
}

const PROGRESS_LABELS: Record<string, string> = {
  downloading: '下载模板包...',
  extracting: '解压文件...',
  configuring: '读取配置...',
  replacing: '替换变量...',
  injecting: '注入功能模块...',
  done: '完成',
};


export function ProjectCreateForm({ template, serverUrl, progress, onSubmit, onBack }: Props) {
  const [appId, setAppId] = useState(`com.example.${template.slug}`);
  const [name, setName] = useState(template.name);
  const [targetDir, setTargetDir] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [author, setAuthor] = useState('');
  const [error, setError] = useState('');
  const [cfgTitleBar, setCfgTitleBar] = useState<'system' | 'custom'>('system');
  const [cfgI18nEnabled, setCfgI18nEnabled] = useState(false);
  const [cfgI18nLocales, setCfgI18nLocales] = useState<string[]>(['zh-CN', 'en-US']);
  const [cfgI18nFollowSystem, setCfgI18nFollowSystem] = useState(true);
  const [cfgThemeEnabled, setCfgThemeEnabled] = useState(false);

  const busy = !!progress;

  async function handleSelectDir() {
    try {
      const dirs = await hap?.hal?.('dialog', 'open_directory', { title: '选择项目目录' });
      if (dirs && dirs.length > 0) setTargetDir(dirs[0]);
    } catch (e: any) {
      setError(e.message || '选择目录失败');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!appId.trim()) { setError('应用ID 不能为空'); return; }
    if (!/^[a-z][a-z0-9.\-]+$/.test(appId.trim())) { setError('应用ID 格式不正确（反向域名格式）'); return; }
    if (!name.trim()) { setError('应用名称不能为空'); return; }
    if (!targetDir.trim()) { setError('请选择目标目录'); return; }

    const config: ProjectConfig = {
      titleBar: cfgTitleBar,
      i18n: cfgI18nEnabled ? { enabled: true, locales: cfgI18nLocales, defaultLocale: cfgI18nLocales[0] || 'zh-CN', followSystem: cfgI18nFollowSystem } : null,
      theme: cfgThemeEnabled ? { enabled: true } : null,
    };

    try {
      await onSubmit({
        templateId: template.id,
        templateSlug: template.slug,
        templateVersion: template.version,
        templateHash: (template as any).packageHash,
        appId: appId.trim(),
        name: name.trim(),
        targetDir: targetDir.trim(),
        description: description.trim(),
        version: version.trim() || '1.0.0',
        author: author.trim(),
        serverUrl,
        config,
      });
    } catch (e: any) {
      setError(e.message || '创建失败');
    }
  }

  return (
    <div className="tpl-form-page">
      <div className="tpl-form-header">
        <button className="tpl-back-btn" onClick={onBack} disabled={busy}>
          <ArrowLeft size={14} />
          <span>返回</span>
        </button>
        <h3 className="tpl-form-title">
          {template.templateCode} · {template.name}
        </h3>
      </div>

      {progress && (
        <div className="tpl-progress">
          <Loader2 size={14} className="tpl-spin" />
          <span>{PROGRESS_LABELS[progress] || progress}</span>
        </div>
      )}

      <form className="tpl-form" onSubmit={handleSubmit}>
        <label className="tpl-field">
          <span className="tpl-label">应用 ID <em>*</em></span>
          <input value={appId} onChange={e => setAppId(e.target.value)} disabled={busy} placeholder="com.example.my-app" />
        </label>

        <label className="tpl-field">
          <span className="tpl-label">应用名称 <em>*</em></span>
          <input value={name} onChange={e => setName(e.target.value)} disabled={busy} placeholder="My App" />
        </label>

        <div className="tpl-field">
          <span className="tpl-label">目标目录 <em>*</em></span>
          <div className="tpl-dir-row">
            <input value={targetDir} readOnly placeholder="选择空目录..." className="tpl-dir-input" />
            <button type="button" className="tpl-dir-btn" onClick={handleSelectDir} disabled={busy}>
              <FolderOpen size={14} />
            </button>
          </div>
        </div>

        <label className="tpl-field">
          <span className="tpl-label">描述</span>
          <input value={description} onChange={e => setDescription(e.target.value)} disabled={busy} placeholder="可选" />
        </label>

        <div className="tpl-field-row">
          <label className="tpl-field tpl-field-half">
            <span className="tpl-label">版本</span>
            <input value={version} onChange={e => setVersion(e.target.value)} disabled={busy} placeholder="1.0.0" />
          </label>
          <label className="tpl-field tpl-field-half">
            <span className="tpl-label">作者</span>
            <input value={author} onChange={e => setAuthor(e.target.value)} disabled={busy} placeholder="可选" />
          </label>
        </div>

        <div className="tpl-config-section">
          <div className="tpl-config-title">标题栏</div>
          <div className="tpl-radio-group">
            <label className="tpl-radio"><input type="radio" checked={cfgTitleBar === 'system'} onChange={() => setCfgTitleBar('system')} disabled={busy} /> 系统标题栏</label>
            <label className="tpl-radio"><input type="radio" checked={cfgTitleBar === 'custom'} onChange={() => setCfgTitleBar('custom')} disabled={busy} /> 自定义标题栏（拖拽+控制按钮）</label>
          </div>
        </div>

        <div className="tpl-config-section">
          <label className="tpl-config-title">
            <input type="checkbox" checked={cfgI18nEnabled} onChange={e => setCfgI18nEnabled(e.target.checked)} disabled={busy} />
            启用多语言支持
          </label>
          {cfgI18nEnabled && (
            <LocalePicker locales={cfgI18nLocales} onChange={setCfgI18nLocales} followSystem={cfgI18nFollowSystem} onFollowSystemChange={setCfgI18nFollowSystem} disabled={busy} />
          )}
        </div>

        <div className="tpl-config-section">
          <label className="tpl-config-title">
            <input type="checkbox" checked={cfgThemeEnabled} onChange={e => setCfgThemeEnabled(e.target.checked)} disabled={busy} />
            启用主题切换（浅色/深色/跟随系统）
          </label>
        </div>

        {error && <div className="tpl-error">{error}</div>}

        <button type="submit" className="tpl-submit-btn" disabled={busy || !targetDir}>
          {busy ? '创建中...' : '创建项目'}
        </button>
      </form>
    </div>
  );
}
