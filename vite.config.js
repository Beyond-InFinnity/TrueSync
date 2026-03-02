import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    // Code-split the ASS parser and waveform logic
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
    // Inline assets under 8KB to reduce requests
    assetsInlineLimit: 8192,
  },
  server: {
    port: 3100,
  },
})
