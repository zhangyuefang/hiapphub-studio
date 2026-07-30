export function getTheme(): 'light' | 'dark' | 'system' {
  try {
    const s = localStorage.getItem('hap-theme');
    if (s === 'dark' || s === 'light') return s;
  } catch {}
  return 'system';
}

export function applyTheme(t: string) {
  const isDark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
}

export function initTheme() {
  applyTheme(getTheme());
}
