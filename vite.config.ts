import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Antigravity Task',
        short_name: 'TaskMgr',
        description: 'Antigravity Task Management App',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'favicon.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'favicon.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        // Do NOT intercept Supabase API or auth requests with the service
        // worker.  The previous runtimeCaching + backgroundSync configuration
        // was causing inconsistent data on read (SELECT returning stale /
        // partial results) and silent write failures (INSERT queued instead
        // of executed).  Let the Supabase JS client handle networking directly.
        navigateFallbackDenylist: [/^\/rest/, /^\/auth/],
        runtimeCaching: []
      }
    })
  ],
})
