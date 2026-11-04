import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { orsProxyPlugin } from './vite/ors-proxy.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), orsProxyPlugin()],
})