import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const FIXTURES_DIR = path.join(__dirname, '.fixtures');
const TPL_TGZ = path.resolve(__dirname, '../../../website/server/uploads/templates/blank-starter/blank-starter-1.0.0.tgz');

describe('create-project logic (offline simulation)', () => {
  const targetDir = path.join(FIXTURES_DIR, 'test-project');

  beforeEach(() => {
    fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
  });

  it('extracts template .tgz correctly', () => {
    expect(fs.existsSync(TPL_TGZ)).toBe(true);
    execSync(`tar -xzf "${TPL_TGZ}" -C "${targetDir}"`, { stdio: 'pipe' });

    expect(fs.existsSync(path.join(targetDir, 'meta.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'src/App.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'src/main.tsx'))).toBe(true);
  });

  it('meta.json has correct structure', () => {
    execSync(`tar -xzf "${TPL_TGZ}" -C "${targetDir}"`, { stdio: 'pipe' });
    const meta = JSON.parse(fs.readFileSync(path.join(targetDir, 'meta.json'), 'utf-8'));

    expect(meta.templateCode).toBe('T24');
    expect(meta.variables).toBeDefined();
    expect(meta.variables.appId).toBeDefined();
    expect(meta.variables.appId.pattern).toMatch(/^\^/);
    expect(meta.variables.name).toBeDefined();
    expect(meta.replacePatterns).toBeInstanceOf(Array);
    expect(meta.excludeFromReplace).toBeInstanceOf(Array);
  });

  it('variable replacement works on manifest.json', () => {
    execSync(`tar -xzf "${TPL_TGZ}" -C "${targetDir}"`, { stdio: 'pipe' });

    const replacements: Record<string, string> = {
      '{{APP_ID}}': 'com.test.myapp',
      '{{APP_NAME}}': 'Test App',
      '{{DESCRIPTION}}': 'A test app',
      '{{VERSION}}': '2.0.0',
      '{{AUTHOR}}': 'Tester',
    };

    const manifestPath = path.join(targetDir, 'manifest.json');
    let content = fs.readFileSync(manifestPath, 'utf-8');
    for (const [key, val] of Object.entries(replacements)) {
      content = content.replaceAll(key, val);
    }
    fs.writeFileSync(manifestPath, content);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.id).toBe('com.test.myapp');
    expect(manifest.name).toBe('Test App');
    expect(manifest.description).toBe('A test app');
    expect(manifest.version).toBe('2.0.0');
    expect(manifest.author).toBe('Tester');
    expect(manifest.entry).toBe('index.html');
  });

  it('variable replacement works on App.tsx', () => {
    execSync(`tar -xzf "${TPL_TGZ}" -C "${targetDir}"`, { stdio: 'pipe' });

    const replacements: Record<string, string> = {
      '{{APP_NAME}}': 'My Cool App',
      '{{DESCRIPTION}}': 'Something cool',
    };

    const appPath = path.join(targetDir, 'src/App.tsx');
    let content = fs.readFileSync(appPath, 'utf-8');
    for (const [key, val] of Object.entries(replacements)) {
      content = content.replaceAll(key, val);
    }
    fs.writeFileSync(appPath, content);

    const result = fs.readFileSync(appPath, 'utf-8');
    expect(result).toContain('My Cool App');
    expect(result).toContain('Something cool');
    expect(result).not.toContain('{{APP_NAME}}');
    expect(result).not.toContain('{{DESCRIPTION}}');
  });

  it('excludeFromReplace patterns work', () => {
    const meta = { excludeFromReplace: ['node_modules/**', 'dist/**', '**/*.png'] };
    const shouldExclude = (name: string, excludes: string[]) =>
      excludes.some(ex => {
        const part = ex.replace('**/', '').replace('/**', '');
        return name === part || name.startsWith(part);
      });

    expect(shouldExclude('node_modules', meta.excludeFromReplace)).toBe(true);
    expect(shouldExclude('dist', meta.excludeFromReplace)).toBe(true);
    expect(shouldExclude('src', meta.excludeFromReplace)).toBe(false);
    expect(shouldExclude('App.tsx', meta.excludeFromReplace)).toBe(false);
  });

  it('matchesPattern correctly identifies replacement targets', () => {
    const patterns = ['**/*.json', '**/*.ts', '**/*.tsx', '**/*.html', '**/*.css'];
    const matchesPattern = (filename: string, pats: string[]) => {
      const ext = '.' + filename.split('.').pop();
      return pats.some(p => {
        const patExt = p.replace('**/*', '');
        return ext === patExt || p === '**/*' + ext;
      });
    };

    expect(matchesPattern('manifest.json', patterns)).toBe(true);
    expect(matchesPattern('App.tsx', patterns)).toBe(true);
    expect(matchesPattern('index.html', patterns)).toBe(true);
    expect(matchesPattern('style.css', patterns)).toBe(true);
    expect(matchesPattern('vite.config.ts', patterns)).toBe(true);
    expect(matchesPattern('icon.png', patterns)).toBe(false);
    expect(matchesPattern('photo.jpg', patterns)).toBe(false);
  });
});
