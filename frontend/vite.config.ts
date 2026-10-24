import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const backendTarget = 'http://localhost:3001';

// Semua prefix API backend yang diproxy di development.
// Navigasi browser (Accept: text/html) dilewati dari proxy agar SPA Router
// tetap menampilkan aplikasi meski path rutenya sama (mis. /analytics, /gantt).
const proxiedPaths = [
  '/auth',
  '/organizations',
  '/invitations',
  '/events',
  '/tasks',
  '/dependencies',
  '/calendar',
  '/holidays',
  '/leaves',
  '/resources',
  '/members',
  '/gantt',
  '/pert',
  '/cpm',
  '/analytics',
  '/activities',
  '/csv',
];

const proxyConfig = Object.fromEntries(
  proxiedPaths.map((prefix) => [
    prefix,
    {
      target: backendTarget,
      changeOrigin: true,
      secure: false,
      bypass(req) {
        const accept = String(req.headers?.accept ?? '');
        if (accept.includes('text/html')) return '/index.html';
        return undefined;
      },
    },
  ])
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: proxyConfig,
  },
});
