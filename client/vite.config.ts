import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('antd') || id.includes('@ant-design') || id.includes('rc-')) return 'antd';
          if (id.includes('react-router-dom')) return 'router';
          if (id.includes('react-dom') || id.includes('scheduler')) return 'react-dom';
          if (id.includes('react/')) return 'react';
          if (id.includes('axios')) return 'http';
          if (id.includes('dayjs')) return 'date';
          if (id.includes('zustand')) return 'state';
          return 'vendor';
        },
      },
    },
  },
});
