import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    watch: {
      usePolling: true,
    },
    host: true, // needed for the Docker Container port mapping to work
    strictPort: true,
    port: 5173, 
  proxy: {
      '/api': {
        target: 'http://backend:8000', // Points to the Docker Service Name
        changeOrigin: true,
        secure: false,
        // Optional: Rewrite path if your backend doesn't use /api prefix
        // rewrite: (path) => path.replace(/^\/api/, ''), 
      },
      '/db-test': {
        target: 'http://backend:8000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})