import { spawn } from 'child_process';
import http from 'http';

console.log('[Dev] Starte Vite Dev Server...');

const isWin = process.platform === 'win32';
const npxCmd = isWin ? 'npx.cmd' : 'npx';

const vite = spawn(npxCmd, ['vite', '--mode', 'electron'], {
  stdio: 'inherit',
  shell: isWin
});

function waitForVite(url, timeout = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(url, (res) => {
        resolve();
      }).on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error('Vite Dev Server Timeout'));
        } else {
          setTimeout(check, 300);
        }
      });
    };
    check();
  });
}

waitForVite('http://localhost:5173')
  .then(() => {
    console.log('[Dev] Vite läuft! Starte Electron...');
    const electron = spawn(npxCmd, ['electron', '.'], {
      stdio: 'inherit',
      shell: isWin
    });

    electron.on('close', (code) => {
      console.log(`[Dev] Electron beendet (${code}). Stoppe Vite...`);
      vite.kill();
      process.exit(code || 0);
    });
  })
  .catch(err => {
    console.error('[Dev] Fehler:', err.message);
    vite.kill();
    process.exit(1);
  });
