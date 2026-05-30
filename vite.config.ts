import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // VitePWA is intentionally DISABLED.
    // The previous Service Worker (with backgroundSync for Supabase REST API)
    // was causing data inconsistency – tasks appearing/disappearing on reload.
    // Re-enable PWA only after confirming the data sync issue is fully resolved.
  ],
})
