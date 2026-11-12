import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const isElectron = mode === 'electron';
  return {
    plugins: [react()],
    base: isElectron ? './' : '/dP-Launcher/',
    server: {
      port: 5173
    }
  };
});
