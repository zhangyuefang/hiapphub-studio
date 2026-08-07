import { useState, useEffect, useMemo } from 'react';
import { Search, Layers, Briefcase, User, Wrench, Palette } from 'lucide-react';

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

const CATEGORIES = [
  { key: '', label: '全部', icon: Layers },
  { key: 'enterprise', label: '企业管理', icon: Briefcase },
  { key: 'personal', label: '个人效率', icon: User },
  { key: 'tool', label: '系统工具', icon: Wrench },
  { key: 'creative', label: '创意设计', icon: Palette },
];

interface Props {
  onSelect: (template: Template) => void;
  serverUrl: string;
}

export function TemplatePickerPage({ onSelect, serverUrl }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${serverUrl}/api/templates`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTemplates(data.templates || []);
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

  return (
    <div className="tpl-picker">
      <div className="tpl-header">
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
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            className={`tpl-cat-btn${category === c.key ? ' active' : ''}`}
            onClick={() => setCategory(c.key)}
          >
            <c.icon size={12} />
            <span>{c.label}</span>
          </button>
        ))}
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
                <img src={tpl.thumbnail} alt="" />
              ) : (
                <div className="tpl-card-placeholder">
                  <Layers size={24} />
                </div>
              )}
            </div>
            <div className="tpl-card-body">
              <div className="tpl-card-code">{tpl.templateCode}</div>
              <div className="tpl-card-name">{tpl.name}</div>
              <div className="tpl-card-desc">{tpl.description}</div>
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
    </div>
  );
}
