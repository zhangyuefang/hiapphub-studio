import { useState, useRef } from 'react';

const PRESET_LOCALES = ['en-US', 'zh-CN', 'zh-TW', 'ja', 'ko', 'es', 'fr', 'de', 'pt-BR', 'ru', 'ar', 'hi'];
const LOCALE_NAMES: Record<string, string> = {
  'zh-CN': '简体中文', 'en-US': 'English', 'zh-TW': '繁體中文', 'ja': '日本語',
  'ko': '한국어', 'es': 'Español', 'fr': 'Français', 'de': 'Deutsch',
  'pt-BR': 'Português', 'ru': 'Русский', 'ar': 'العربية', 'hi': 'हिन्दी',
};

interface Props {
  locales: string[];
  onChange: (locales: string[]) => void;
  followSystem: boolean;
  onFollowSystemChange: (v: boolean) => void;
  disabled?: boolean;
}

export function LocalePicker({ locales, onChange, followSystem, onFollowSystemChange, disabled }: Props) {
  const [customInput, setCustomInput] = useState('');
  const dragIdx = useRef<number | null>(null);

  function toggleLocale(loc: string) {
    if (disabled) return;
    if (locales.includes(loc)) {
      if (locales.length <= 1) return;
      onChange(locales.filter(l => l !== loc));
    } else {
      onChange([...locales, loc]);
    }
  }

  function addCustom() {
    const loc = customInput.trim();
    if (!loc || locales.includes(loc)) return;
    onChange([...locales, loc]);
    setCustomInput('');
  }

  function handleDragStart(i: number) { dragIdx.current = i; }

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === i) return;
    const newLocales = [...locales];
    const [moved] = newLocales.splice(dragIdx.current, 1);
    newLocales.splice(i, 0, moved);
    dragIdx.current = i;
    onChange(newLocales);
  }

  function handleDragEnd() { dragIdx.current = null; }

  return (
    <div className="locale-picker-wrap">
      <label className="locale-follow-system">
        <input type="checkbox" checked={followSystem} onChange={e => onFollowSystemChange(e.target.checked)} disabled={disabled} />
        <span>跟随系统语言（未匹配时回退到第一个）</span>
      </label>
      <div className="locale-selected-list">
        {locales.map((loc, i) => (
          <div key={loc} className="locale-selected-item" draggable={!disabled}
            onDragStart={() => handleDragStart(i)} onDragOver={(e) => handleDragOver(e, i)} onDragEnd={handleDragEnd}>
            <span className="locale-drag-handle">⠿</span>
            <span className="locale-item-name">{LOCALE_NAMES[loc] || loc}</span>
            <span className="locale-item-code">{loc}</span>
            {i === 0 && <span className="locale-default-badge">{followSystem ? '回退' : '默认'}</span>}
            <button className="locale-remove-btn" onClick={() => toggleLocale(loc)} disabled={disabled || locales.length <= 1}>×</button>
          </div>
        ))}
      </div>
      <div className="locale-add-section">
        <div className="locale-preset-grid">
          {PRESET_LOCALES.filter(l => !locales.includes(l)).map(loc => (
            <button key={loc} className="locale-add-tag" onClick={() => toggleLocale(loc)} disabled={disabled}>
              + {LOCALE_NAMES[loc] || loc}
            </button>
          ))}
        </div>
        <div className="locale-custom-row">
          <input className="locale-custom-input" value={customInput} onChange={e => setCustomInput(e.target.value)}
            placeholder="自定义 locale (如 vi)" disabled={disabled}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} />
          <button className="locale-custom-add" onClick={addCustom} disabled={disabled || !customInput.trim()}>添加</button>
        </div>
      </div>
    </div>
  );
}
