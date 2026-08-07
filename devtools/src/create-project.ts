const hap = (window as any).hap;

export interface CreateProjectParams {
  templateId: string;
  appId: string;
  name: string;
  targetDir: string;
  description?: string;
  version?: string;
  author?: string;
  serverUrl: string;
}

type ProgressFn = (step: string) => void;

export async function createProject(params: CreateProjectParams, onProgress: ProgressFn = () => {}) {
  const { templateId, appId, name, targetDir, description, version, author, serverUrl } = params;

  if (!hap?.hal) throw new Error('Bridge 未就绪，请确认运行环境');

  const dirExists = await hal('fs', 'exists', { path: targetDir });
  if (dirExists) {
    const entries: string[] = await hal('fs', 'read_dir', { path: targetDir });
    if (entries.length > 0) throw new Error('目标目录不为空，请选择空目录');
  } else {
    await hal('fs', 'mkdir', { path: targetDir, recursive: true });
  }

  onProgress('downloading');
  const tmpPath = `${targetDir}/.tmp-template.tgz`;
  await hal('http', 'download', {
    url: `${serverUrl}/api/templates/${templateId}/download`,
    dest: tmpPath,
  });

  onProgress('extracting');
  await hal('archive', 'extract', { path: tmpPath, dest: targetDir });
  await hal('fs', 'remove', { path: tmpPath });

  onProgress('configuring');
  const metaPath = `${targetDir}/meta.json`;
  const metaExists = await hal('fs', 'exists', { path: metaPath });

  let replacePatterns = ['**/*.json', '**/*.ts', '**/*.tsx', '**/*.html', '**/*.css'];
  let excludeFromReplace = ['node_modules/**', 'dist/**', '**/*.png', '**/*.jpg', '**/*.woff*'];

  if (metaExists) {
    const raw = await hal('fs', 'read_text', { path: metaPath });
    try {
      const meta = JSON.parse(raw);
      if (meta.replacePatterns) replacePatterns = meta.replacePatterns;
      if (meta.excludeFromReplace) excludeFromReplace = meta.excludeFromReplace;
    } catch {}
  }

  onProgress('replacing');
  const replacements: Record<string, string> = {
    '{{appId}}': appId,
    '{{name}}': name,
    '{{description}}': description || '',
    '{{version}}': version || '1.0.0',
    '{{author}}': author || '',
  };
  await replaceInDir(targetDir, replacements, replacePatterns, excludeFromReplace);

  await generateManifest(targetDir, params);

  if (metaExists) await hal('fs', 'remove', { path: metaPath });

  onProgress('done');
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
  const names: string[] = await hal('fs', 'read_dir', { path: dir });

  for (const name of names) {
    const fullPath = `${dir}/${name}`;

    if (shouldExclude(name, excludes)) continue;

    const meta = await hal('fs', 'stat', { path: fullPath });
    if (meta.is_dir) {
      await replaceInDir(fullPath, replacements, patterns, excludes);
    } else if (matchesPattern(name, patterns)) {
      const content = await hal('fs', 'read_text', { path: fullPath });
      let replaced = content;
      for (const [key, val] of Object.entries(replacements)) {
        replaced = replaced.replaceAll(key, val);
      }
      if (replaced !== content) {
        await hal('fs', 'write_text', { path: fullPath, content: replaced });
      }
    }
  }
}

function shouldExclude(name: string, excludes: string[]): boolean {
  return excludes.some(ex => {
    const part = ex.replace('**/', '').replace('/**', '');
    return name === part || name.startsWith(part);
  });
}

function matchesPattern(filename: string, patterns: string[]): boolean {
  const ext = '.' + filename.split('.').pop();
  return patterns.some(p => {
    const patExt = p.replace('**/*', '');
    return ext === patExt || p === '**/*' + ext;
  });
}

async function generateManifest(targetDir: string, params: CreateProjectParams) {
  const manifestPath = `${targetDir}/manifest.json`;
  const exists = await hal('fs', 'exists', { path: manifestPath });

  let manifest: Record<string, unknown> = {};
  if (exists) {
    try {
      manifest = JSON.parse(await hal('fs', 'read_text', { path: manifestPath }));
    } catch {}
  }

  manifest.id = params.appId;
  manifest.name = params.name;
  if (params.description) manifest.description = params.description;
  manifest.version = params.version || '1.0.0';
  if (params.author) manifest.author = params.author;
  if (!manifest.entry) manifest.entry = 'index.html';

  await hal('fs', 'write_text', {
    path: manifestPath,
    content: JSON.stringify(manifest, null, 2),
  });
}
