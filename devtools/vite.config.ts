import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import hapDev from '@hiapphub/vite-plugin-hap-dev';

export default defineConfig({
  base: './',
  plugins: [
    tailwindcss(),
    react(),
    hapDev({ devtools: true, manifest: './manifest.json' }),
  ],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 4096,
  },
});
