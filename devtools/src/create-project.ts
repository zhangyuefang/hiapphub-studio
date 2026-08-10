import { getTitlebarTsx, getTitlebarCss, getI18nTs, getThemeTs, getThemeCssVars, getLangSwitcherTsx, getLangSwitcherCss, getThemeSwitcherTsx, getThemeSwitcherCss } from './inject-templates';

const hap = (window as any).hap;

export interface ProjectConfig {
  titleBar: 'system' | 'custom';
  i18n: { enabled: boolean; locales: string[]; defaultLocale: string; followSystem: boolean } | null;
  theme: { enabled: boolean } | null;
}

export interface CreateProjectParams {
  templateId: string;
  templateSlug?: string;
  templateVersion?: string;
  templateHash?: string;
  appId: string;
  name: string;
  targetDir: string;
  description?: string;
  version?: string;
  author?: string;
  serverUrl: string;
  config?: ProjectConfig;
}

type ProgressFn = (step: string) => void;

const CACHE_DIR = '/tmp/hiapphub-template-cache';

export async function createProject(params: CreateProjectParams, onProgress: ProgressFn = () => {}) {
  const { templateId, templateSlug, templateVersion, templateHash, appId, name, targetDir, description, version, author, serverUrl, config } = params;

  if (!hap?.hal) throw new Error('Bridge 未就绪，请确认运行环境');

  const dirExists = await hal('fs', 'exists', { path: targetDir });
  if (dirExists) {
    const entries: any[] = await hal('fs', 'list_dir', { path: targetDir });
    if (entries.length > 0) throw new Error('目标目录不为空，请选择空目录');
  } else {
    await hal('fs', 'mkdir', { path: targetDir, recursive: true });
  }

  onProgress('downloading');
  const tgzPath = await downloadWithCache(templateId, templateSlug, templateVersion, templateHash, serverUrl);

  onProgress('extracting');
  try {
    await hal('archive', 'extract_auto', { archive_path: tgzPath, dest_dir: targetDir });
  } catch (e: any) {
    try { await hal('fs', 'remove', { path: tgzPath }); } catch {}
    throw new Error(`模板解压失败: ${e.message || '解压错误'}`);
  }

  const hasIndex = await hal('fs', 'exists', { path: `${targetDir}/index.html` });
  if (!hasIndex) {
    throw new Error('模板解压异常: 缺少 index.html，请重试');
  }

  onProgress('configuring');
  const manifestPath = `${targetDir}/manifest.json`;
  let origManifest: Record<string, any> = {};
  try {
    const raw = await hal('fs', 'read_text_file', { path: manifestPath });
    origManifest = JSON.parse(raw);
  } catch {}

  onProgress('replacing');
  const origId = origManifest.id || '';
  const origName = origManifest.name || '';
  const origDesc = origManifest.description || '';
  const excludeFromReplace = ['node_modules', 'dist', '.git'];

  if (origId && origId !== appId) {
    await replaceInDir(targetDir, { [origId]: appId }, ['**/*.json'], excludeFromReplace);
  }

  const textReplacements: Record<string, string> = {};
  if (origName && origName !== name) textReplacements[origName] = name;
  if (origDesc && description && origDesc !== description) textReplacements[origDesc] = description;

  if (Object.keys(textReplacements).length > 0) {
    await replaceInDir(targetDir, textReplacements, ['**/*.json', '**/*.ts', '**/*.tsx', '**/*.html'], excludeFromReplace);
  }

  origManifest.id = appId;
  origManifest.name = name;
  if (origManifest.names) {
    for (const lang of Object.keys(origManifest.names)) {
      if (origManifest.names[lang] === origName) origManifest.names[lang] = name;
    }
  }
  if (description) {
    origManifest.description = description;
    if (origManifest.descriptions) {
      for (const lang of Object.keys(origManifest.descriptions)) {
        if (origManifest.descriptions[lang] === origDesc) origManifest.descriptions[lang] = description;
      }
    }
  }
  origManifest.version = version || '1.0.0';
  if (author) origManifest.author = author;
  if (!origManifest.entry) origManifest.entry = 'index.html';

  if (config) {
    onProgress('injecting');
    await injectFeatures(targetDir, origManifest, config, name);
  }

  await hal('fs', 'write_text_file', {
    path: manifestPath,
    content: JSON.stringify(origManifest, null, 2),
  });

  const metaPath = `${targetDir}/meta.json`;
  const metaExists = await hal('fs', 'exists', { path: metaPath });
  if (metaExists) await hal('fs', 'remove', { path: metaPath });

  onProgress('done');
}

async function injectFeatures(dir: string, manifest: Record<string, any>, config: ProjectConfig, appName: string) {
  const srcDir = `${dir}/src`;
  const cssPath = `${dir}/src/index.css`;
  const appPath = `${dir}/src/App.tsx`;
  const pkgPath = `${dir}/package.json`;

  let cssContent = '';
  try { cssContent = await hal('fs', 'read_text_file', { path: cssPath }); } catch {}
  let appContent = '';
  try { appContent = await hal('fs', 'read_text_file', { path: appPath }); } catch {}
  let pkgContent = '';
  try { pkgContent = await hal('fs', 'read_text_file', { path: pkgPath }); } catch {}

  const imports: string[] = [];
  let cssInject = '';

  if (config.theme?.enabled) {
    await hal('fs', 'write_text_file', { path: `${srcDir}/theme.ts`, content: getThemeTs() });
    cssInject += getThemeCssVars() + '\n';
    imports.push("import { initTheme } from './theme';");
    appContent = addInitEffect(appContent, 'initTheme();');
    appContent = ensureReactImports(appContent, ['useEffect']);
  }

  const titlebarChildren: string[] = [];

  if (config.i18n?.enabled && config.i18n.locales.length > 0) {
    const i18nCode = getI18nTs(config.i18n.locales, config.i18n.defaultLocale, appName, config.i18n.followSystem);
    await hal('fs', 'write_text_file', { path: `${srcDir}/i18n.ts`, content: i18nCode });
    await hal('fs', 'write_text_file', { path: `${srcDir}/LangSwitcher.tsx`, content: getLangSwitcherTsx(config.i18n.locales) });
    cssInject += getLangSwitcherCss() + '\n';
    imports.push("import { t } from './i18n';");
    imports.push("import { LangSwitcher } from './LangSwitcher';");
    titlebarChildren.push('<LangSwitcher />');
    appContent = addLocaleListener(appContent);
    appContent = ensureReactImports(appContent, ['useState', 'useEffect']);
  }

  if (config.theme?.enabled) {
    await hal('fs', 'write_text_file', { path: `${srcDir}/ThemeSwitcher.tsx`, content: getThemeSwitcherTsx() });
    cssInject += getThemeSwitcherCss() + '\n';
    imports.push("import { ThemeSwitcher } from './ThemeSwitcher';");
    titlebarChildren.push('<ThemeSwitcher />');
  }

  if (config.titleBar === 'custom') {
    await hal('fs', 'write_text_file', { path: `${srcDir}/Titlebar.tsx`, content: getTitlebarTsx(appName) });
    cssInject += getTitlebarCss() + '\n';
    if (!manifest.windows) manifest.windows = [{ label: 'main', title: appName, width: 900, height: 600, resizable: true }];
    manifest.windows[0].decorations = true;
    manifest.windows[0].titleBarStyle = 'overlay';
    manifest.windows[0].hiddenTitle = true;
    manifest.windows[0].trafficLightPosition = { x: 13, y: 24 };
    imports.push("import { Titlebar } from './Titlebar';");
    appContent = wrapWithTitlebar(appContent, appName, titlebarChildren);
    cssInject += '#root { padding-top: 38px; }\n';
  } else if (titlebarChildren.length > 0) {
    cssInject += `.app-switcher-bar { position: fixed; top: 4px; right: 8px; z-index: 9998; display: flex; gap: 6px; }\n`;
    appContent = insertToolbar(appContent, titlebarChildren);
  }

  if (cssInject) {
    cssContent = cssInject + '\n' + cssContent;
    await hal('fs', 'write_text_file', { path: cssPath, content: cssContent });
  }

  if (imports.length > 0) {
    appContent = imports.join('\n') + '\n' + appContent;
    await hal('fs', 'write_text_file', { path: appPath, content: appContent });
  }
}


function ensureReactImports(appContent: string, needed: string[]): string {
  const reactImport = appContent.match(/import\s*\{([^}]*)\}\s*from\s*['"]react['"]/);
  if (reactImport) {
    const existing = reactImport[1].split(',').map(s => s.trim());
    const toAdd = needed.filter(n => !existing.includes(n));
    if (toAdd.length > 0) {
      const newImports = [...existing, ...toAdd].join(', ');
      return appContent.replace(reactImport[0], `import { ${newImports} } from 'react'`);
    }
    return appContent;
  }
  return `import { ${needed.join(', ')} } from 'react';\n` + appContent;
}

function addInitEffect(appContent: string, call: string): string {
  const fnMatch = appContent.match(/export default function\s+\w+\s*\([^)]*\)\s*\{/);
  if (fnMatch && fnMatch.index !== undefined) {
    const insertAt = fnMatch.index + fnMatch[0].length;
    return appContent.slice(0, insertAt) + `\n  useEffect(() => { ${call} }, []);\n` + appContent.slice(insertAt);
  }
  return appContent;
}

function addLocaleListener(appContent: string): string {
  const fnMatch = appContent.match(/export default function\s+\w+\s*\([^)]*\)\s*\{/);
  if (fnMatch && fnMatch.index !== undefined) {
    const insertAt = fnMatch.index + fnMatch[0].length;
    const hook = `\n  const [, _rerender] = useState(0);\n  useEffect(() => { const h = () => _rerender(n => n + 1); window.addEventListener('locale-change', h); return () => window.removeEventListener('locale-change', h); }, []);\n`;
    return appContent.slice(0, insertAt) + hook + appContent.slice(insertAt);
  }
  return appContent;
}

function insertToolbar(appContent: string, components: string[]): string {
  const toolbar = `<div className="app-switcher-bar">${components.join('')}</div>`;
  const returnMatch = findJsxReturn(appContent);
  if (returnMatch) {
    const insertAt = returnMatch.index + returnMatch.match.length;
    const firstTag = appContent.indexOf('<', insertAt);
    if (firstTag !== -1) {
      const closeTag = appContent.indexOf('>', firstTag);
      if (closeTag !== -1) {
        return appContent.slice(0, closeTag + 1) + '\n      ' + toolbar + appContent.slice(closeTag + 1);
      }
    }
  }
  return appContent;
}

function wrapWithTitlebar(appContent: string, appName: string, children: string[] = []): string {
  const returnMatch = findJsxReturn(appContent);
  if (returnMatch) {
    const insertAt = returnMatch.index + returnMatch.match.length;
    const before = appContent.slice(0, insertAt);
    const after = appContent.slice(insertAt);
    const lastClose = after.lastIndexOf(');');
    if (lastClose === -1) return appContent;
    const wrapped = after.slice(0, lastClose) + '</>\n  );\n}';
    const titlebarJsx = children.length > 0
      ? `    <><Titlebar title="${appName}">${children.join('')}</Titlebar>\n    `
      : `    <><Titlebar title="${appName}" />\n    `;
    return before + titlebarJsx + wrapped;
  }
  return appContent;
}

async function downloadWithCache(
  templateId: string,
  slug: string | undefined,
  version: string | undefined,
  hash: string | undefined,
  serverUrl: string,
): Promise<string> {
  await hal('fs', 'mkdir', { path: CACHE_DIR, recursive: true });

  const cacheKey = slug && hash ? `${slug}-${hash.slice(0, 12)}` : slug && version ? `${slug}-${version}` : templateId;
  const cachePath = `${CACHE_DIR}/${cacheKey}.tgz`;

  const cached = await hal('fs', 'exists', { path: cachePath });
  if (cached) {
    const info: any = await hal('fs', 'stat', { path: cachePath }).catch(() => null);
    if (info && info.size > 100) return cachePath;
  }

  try {
    await hal('http', 'download', {
      url: `${serverUrl}/api/templates/${templateId}/download`,
      dest_path: cachePath,
    });
  } catch (e: any) {
    try { await hal('fs', 'remove', { path: cachePath }); } catch {}
    throw new Error(`模板下载失败: ${e.message || '网络错误'}`);
  }

  const fileInfo: any = await hal('fs', 'stat', { path: cachePath }).catch(() => null);
  if (!fileInfo || fileInfo.size < 100) {
    try { await hal('fs', 'remove', { path: cachePath }); } catch {}
    throw new Error('模板下载失败: 文件无效（可能服务器限流或网络异常）');
  }

  return cachePath;
}

async function hal(mod: string, fn: string, params: Record<string, unknown>): Promise<any> {
  return hap?.hal?.(mod, fn, params);
}

async function replaceInDir(
  dir: string,
  replacements: Record<string, string>,
  patterns: string[],
  excludes: string[],
) {
  const entries: any[] = await hal('fs', 'list_dir', { path: dir });

  for (const entry of entries) {
    const entryName = entry.name as string;
    const fullPath = entry.path as string;

    if (excludes.includes(entryName)) continue;

    if (entry.is_dir) {
      await replaceInDir(fullPath, replacements, patterns, excludes);
    } else if (matchesPattern(entryName, patterns)) {
      const content = await hal('fs', 'read_text_file', { path: fullPath });
      let replaced = content;
      for (const [key, val] of Object.entries(replacements)) {
        replaced = replaced.replaceAll(key, val);
      }
      if (replaced !== content) {
        await hal('fs', 'write_text_file', { path: fullPath, content: replaced });
      }
    }
  }
}

function findJsxReturn(content: string): { index: number; match: string } | null {
  const re = /return\s*\(\s*\n\s*/g;
  let last: { index: number; match: string } | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    last = { index: m.index, match: m[0] };
  }
  return last;
}

function matchesPattern(filename: string, patterns: string[]): boolean {
  const ext = '.' + filename.split('.').pop();
  return patterns.some(p => {
    const patExt = p.replace('**/*', '');
    return ext === patExt || p === '**/*' + ext;
  });
}
