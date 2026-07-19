import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: { fs: { allow: [resolve(__dirname, '../..')] } },
  build: {
    outDir: '../../dist/apps/playground',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react/') || id.includes('react-dom/')) return 'vendor-react';
            if (id.includes('recharts')) return 'vendor-recharts';
            if (id.includes('react-grid-layout')) return 'vendor-grid';
            if (id.includes('html2canvas') || id.includes('jspdf')) return 'vendor-export';
            if (id.includes('papaparse') || id.includes('xlsx') || id.includes('sheetjs')) return 'vendor-parsers';
            return 'vendor';
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@dashboard-generator/playground': resolve(__dirname, '../../packages/playground/src/index.ts'),
      '@dashboard-generator/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@dashboard-generator/theme': resolve(__dirname, '../../packages/theme/src/index.ts'),
      '@dashboard-generator/datasource': resolve(__dirname, '../../packages/datasource/src/index.ts'),
      '@dashboard-generator/filters': resolve(__dirname, '../../packages/filters/src/index.ts'),
      '@dashboard-generator/layout': resolve(__dirname, '../../packages/layout/src/index.ts'),
      '@dashboard-generator/widgets': resolve(__dirname, '../../packages/widgets/src/index.tsx'),
      '@dashboard-generator/react': resolve(__dirname, '../../packages/renderer/src/index.tsx'),
    },
  },
});
