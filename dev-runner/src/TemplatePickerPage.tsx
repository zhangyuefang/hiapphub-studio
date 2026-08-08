import { useState, useEffect, useMemo } from 'react';
import { Search, Layers, Briefcase, User, Wrench, Palette, X, Eye } from 'lucide-react';

interface Template {
  id: string;
  slug: string;
  templateCode: string;
  name: string;
  names?: Record<string, string>;
  description: string;
  descriptions?: Record<string, string>;
  category: string;
  thumbnail: string;
  screenshots?: string[];
  version: string;
  tags: string[];
  components: string[];
}

function getLocale(): string {
  return navigator.language || 'zh-CN';
}

function i18nName(tpl: Template): string {
  const locale = getLocale();
  if (tpl.names?.[locale]) return tpl.names[locale];
  if (locale.startsWith('zh') && tpl.names?.['zh-CN']) return tpl.names['zh-CN'];
  if (tpl.names?.en) return tpl.names.en;
  return tpl.name;
}

function i18nDesc(tpl: Template): string {
  const locale = getLocale();
  if (tpl.descriptions?.[locale]) return tpl.descriptions[locale];
  if (locale.startsWith('zh') && tpl.descriptions?.['zh-CN']) return tpl.descriptions['zh-CN'];
  if (tpl.descriptions?.en) return tpl.descriptions.en;
  return tpl.description;
}

const CATEGORIES = [
  { key: '', label: '全部', icon: Layers },
  { key: 'enterprise', label: '企业管理', icon: Briefcase },
  { key: 'personal', label: '个人效率', icon: User },
  { key: 'tool', label: '系统工具', icon: Wrench },
  { key: 'creative', label: '创意设计', icon: Palette },
];

interface Props {
  onSelect: (template: Template) => void;
  onBack?: () => void;
  serverUrl: string;
}

export function TemplatePickerPage({ onSelect, onBack, serverUrl }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [previewTpl, setPreviewTpl] = useState<Template | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${serverUrl}/api/templates?pageSize=100&sort=name`);
      if (!res.ok) throw new Error(`模板服务请求失败 (${res.status})`);
      const data = await res.json();
      const list = (data.templates || []).sort(
        (a: any, b: any) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.templateCode.localeCompare(b.templateCode)
      );
      setTemplates(list);
    } catch (e: any) {
      setError(e.message || '加载失败');
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = templates;
    if (category) list = list.filter(t => t.category === category);
    if (search.trim()) {
      const kw = search.trim().toLowerCase();
      list = list.filter(t =>
        t.name.toLowerCase().includes(kw) ||
        t.slug.toLowerCase().includes(kw) ||
        t.templateCode.toLowerCase().includes(kw) ||
        t.tags?.some(tag => tag.toLowerCase().includes(kw))
      );
    }
    return list;
  }, [templates, category, search]);

  function getThumbnailUrl(thumbnail: string): string {
    if (!thumbnail) return '';
    if (thumbnail.startsWith('http')) return thumbnail;
    return `${serverUrl}${thumbnail}`;
  }

  return (
    <div className="tpl-picker">
      <div className="tpl-header">
        {onBack && (
          <button className="tpl-back-btn" onClick={onBack}>← 返回</button>
        )}
        <h2 className="tpl-title">创建新项目</h2>
        <div className="tpl-search">
          <Search size={14} className="tpl-search-icon" />
          <input
            className="tpl-search-input"
            placeholder="搜索模板..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="tpl-categories">
        {CATEGORIES.map(c => {
          const count = c.key ? templates.filter(t => t.category === c.key).length : templates.length;
          return (
            <button
              key={c.key}
              className={`tpl-cat-btn${category === c.key ? ' active' : ''}`}
              onClick={() => setCategory(c.key)}
            >
              <c.icon size={12} />
              <span>{c.label}</span>
              {count > 0 && <span className="tpl-cat-count">{count}</span>}
            </button>
          );
        })}
      </div>

      {loading && <div className="tpl-status">加载中...</div>}
      {error && <div className="tpl-status tpl-error">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="tpl-status">无匹配模板</div>
      )}

      <div className="tpl-grid">
        {filtered.map(tpl => (
          <div
            key={tpl.id}
            className="tpl-card"
            onClick={() => onSelect(tpl)}
          >
            <div className="tpl-card-thumb">
              {tpl.thumbnail ? (
                <img src={getThumbnailUrl(tpl.thumbnail)} alt="" />
              ) : (
                <div className="tpl-card-placeholder">
                  <Layers size={24} />
                </div>
              )}
              <button
                className="tpl-card-preview-btn"
                onClick={(e) => { e.stopPropagation(); setPreviewTpl(tpl); }}
                title="预览"
              >
                <Eye size={12} />
              </button>
            </div>
            <div className="tpl-card-body">
              <div className="tpl-card-code">{tpl.templateCode}</div>
              <div className="tpl-card-name">{i18nName(tpl)}</div>
              <div className="tpl-card-desc">{i18nDesc(tpl)}</div>
              <div className="tpl-card-meta">
                <span className="tpl-card-version">v{tpl.version}</span>
                {tpl.tags?.slice(0, 2).map(tag => (
                  <span key={tag} className="tpl-card-tag">{tag}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {previewTpl && (
        <TemplatePreviewModal
          template={previewTpl}
          thumbnailUrl={getThumbnailUrl(previewTpl.thumbnail)}
          onSelect={() => { setPreviewTpl(null); onSelect(previewTpl); }}
          onClose={() => setPreviewTpl(null)}
        />
      )}
    </div>
  );
}

function TemplatePreviewModal({ template, thumbnailUrl, onSelect, onClose }: {
  template: Template; thumbnailUrl: string; onSelect: () => void; onClose: () => void;
}) {
  return (
    <div className="tpl-preview-overlay" onClick={onClose}>
      <div className="tpl-preview-modal" onClick={e => e.stopPropagation()}>
        <button className="tpl-preview-close" onClick={onClose}><X size={16} /></button>
        <div className="tpl-preview-header">
          <div className="tpl-preview-thumb">
            {thumbnailUrl ? <img src={thumbnailUrl} alt="" /> : <Layers size={48} />}
          </div>
          <div className="tpl-preview-info">
            <span className="tpl-preview-code">{template.templateCode}</span>
            <h3 className="tpl-preview-name">{i18nName(template)}</h3>
            <p className="tpl-preview-desc">{i18nDesc(template)}</p>
          </div>
        </div>

        {template.screenshots && template.screenshots.length > 0 && (
          <div className="tpl-preview-section">
            <h4>截图预览</h4>
            <div className="tpl-preview-screenshots">
              {template.screenshots.map((s, i) => (
                <img key={i} src={s.startsWith('http') ? s : `${location.origin}${s}`} alt={`screenshot ${i+1}`} className="tpl-preview-shot" />
              ))}
            </div>
          </div>
        )}

        <div className="tpl-preview-section">
          <h4>包含组件</h4>
          <div className="tpl-preview-chips">
            {template.components.map(c => (
              <span key={c} className="tpl-preview-chip">{c}</span>
            ))}
          </div>
        </div>

        {template.tags.length > 0 && (
          <div className="tpl-preview-section">
            <h4>标签</h4>
            <div className="tpl-preview-chips">
              {template.tags.map(t => (
                <span key={t} className="tpl-preview-chip tag">{t}</span>
              ))}
            </div>
          </div>
        )}

        <div className="tpl-preview-footer">
          <span className="tpl-preview-version">v{template.version}</span>
          <button className="tpl-preview-select-btn" onClick={onSelect}>使用此模板</button>
        </div>
      </div>
    </div>
  );
}
