import { spawn, spawnSync } from 'child_process';
import http from 'http';

console.log('[Dev] Starte Vite Dev Server...');

const isWin = process.platform === 'win32';
const npxCmd = isWin ? 'npx.cmd' : 'npx';

// Vite darf nicht aus dem Terminal lesen, sonst fehlen dem Terminal Tastendrücke
const vite = spawn(npxCmd, ['vite', '--mode', 'electron'], {
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: isWin
});

// Unter Windows beendet vite.kill() nur die Shell, Vite selbst liefe weiter
function stopVite() {
  if (isWin) {
    spawnSync('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    vite.kill();
  }
}

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
      stopVite();
      process.exit(code || 0);
    });
  })
  .catch(err => {
    console.error('[Dev] Fehler:', err.message);
    stopVite();
    process.exit(1);
  });
