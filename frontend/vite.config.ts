import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'Rent Ledger',
        short_name: 'RentLedger',
        description: 'Monthly rent & utilities invoices for your tenants',
        theme_color: '#1d3a8a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // vite-plugin-pwa defaults navigateFallback to 'index.html', which binds
        // ALL navigation requests (hard loads/refreshes) to the precached app
        // shell from whenever the service worker last updated -- serving a
        // stale, possibly backend-incompatible build indefinitely instead of
        // hitting the network. This app always needs a live connection for its
        // API calls anyway, so there's no value in an offline app shell; every
        // navigation should just go to the network like a normal page load.
        navigateFallback: undefined,
        runtimeCaching: [
          {
            urlPattern: /^https?.*\/api\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } },
  },
})
