import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function log(msg) {
  console.log(`\n[Publish] ${msg}\n`);
}

try {
  // Lade Umgebungsvariablen aus .env falls vorhanden
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const envPath = path.join(rootDir, file);
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const lines = envContent.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const parts = trimmed.split('=');
          if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
            if (key === 'GH_TOKEN') {
              process.env.GH_TOKEN = val;
              break;
            }
          }
        }
      }
      if (process.env.GH_TOKEN) break;
    }
  }

  // 1. Version und Changelog aus src/releaseNotes.js lesen
  log("Lese Release Notes und Version aus src/releaseNotes.js...");
  const releaseNotesPath = path.join(rootDir, 'src', 'releaseNotes.js');
  if (!fs.existsSync(releaseNotesPath)) {
    throw new Error("src/releaseNotes.js existiert nicht!");
  }
  const releaseNotesContent = fs.readFileSync(releaseNotesPath, 'utf8');

  const versionMatch = releaseNotesContent.match(/version:\s*["']([^"']+)["']/);
  if (!versionMatch) {
    throw new Error("Version konnte in src/releaseNotes.js nicht gefunden werden.");
  }
  const version = versionMatch[1];
  log(`Erkannte Launcher-Version: ${version}`);

  // package.json updaten
  log("Aktualisiere package.json Version...");
  const packageJsonPath = path.join(rootDir, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.version = version;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');

  // Changelog aus den Release Notes als Markdown für den GitHub Release
  const parseArray = (name, text) => {
    const match = text.match(new RegExp(name + ':\s*\[([\s\S]*?)\]'));
    if (!match) return [];
    return match[1]
      .split(/,\s*\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.replace(/^['"`]/, '').replace(/['"`]$/, '')
        .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
        .replace(/<em>(.*?)<\/em>/gi, '_$1_')
        .replace(/<br\s*\/?>/gi, '\n  ')
        .replace(/<[^>]+>/g, ''));
  };
  let changelogMd = `## Release Notes (v${version})\n\n`;
  for (const [title, key] of [['Was ist neu?', 'whatsNew'], ['Fehlerbehebungen', 'bugFixes'], ['Anpassungen', 'adjustments']]) {
    const items = parseArray(key, releaseNotesContent);
    if (items.length) changelogMd += `### ${title}\n${items.map(i => `- ${i}`).join('\n')}\n\n`;
  }
  const tempChangelogPath = path.join(rootDir, 'temp-changelog.md');
  fs.writeFileSync(tempChangelogPath, changelogMd, 'utf8');

  // Build & Package
  log("Baue Vite Electron App...");
  execSync('npm run build:electron', { stdio: 'inherit', cwd: rootDir });

  const hasToken = !!process.env.GH_TOKEN;
  if (!hasToken) {
    log("HINWEIS: GH_TOKEN ist nicht gesetzt (.env.local). Builds entstehen NUR LOKAL in 'dist-electron', es wird nichts auf GitHub hochgeladen.");
  }
  const publishFlag = hasToken ? '--publish always' : '--publish never';
  log(`Erstelle Electron Binaries mit electron-builder (${publishFlag})...`);
  try {
    execSync(`npx electron-builder --win --linux -c.releaseInfo.releaseNotesFile=temp-changelog.md ${publishFlag}`, { stdio: 'inherit', cwd: rootDir });
  } finally {
    if (fs.existsSync(tempChangelogPath)) fs.unlinkSync(tempChangelogPath);
  }

  // GitHub Pages Web-Build & Deployment falls konfiguriert
  log("Baue Web-Version für GitHub Pages...");
  execSync('npm run build', { stdio: 'inherit', cwd: rootDir });

  log(`Erfolgreich abgeschlossen für v${version}!`);
} catch (error) {
  console.error('\n[Fehler beim Publishing]', error);
  process.exit(1);
}
