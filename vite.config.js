import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const buildId = new Date().toISOString().replace(/[:.]/g, '-')

export default defineConfig({
  // './' makes it work even if you host it in a sub-folder on shared hosting
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Kapapa Finance',
        short_name: 'Kapapa',
        description: 'Offline-first personal finance tracker (local-only) with PIN lock.',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        start_url: './',
        scope: './',
        id: `kapapa-${buildId}`,
        version: buildId,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        cacheId: `kapapa-${buildId}`,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallbackDenylist: [/^\/assets\//],
      }
    })
  ]
})
