// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // <<< Add the VitePWA plugin configuration >>>
    VitePWA({
      registerType: 'autoUpdate', // Automatically update SW when new content is available
      injectRegister: 'auto', // Let the plugin handle registration script injection
      // <<< COMMENTED OUT devOptions to disable PWA features in dev server >>>
      // devOptions: {
      //   enabled: true // Enable PWA features in development (for testing)
      // },
      manifest: {
        // Copy details from your existing manifest.json here
        short_name: "GearShift",
        name: "GearShift Dashboard",
        description: "A personal productivity and planning dashboard.",
        icons: [
          // Use icons from your /public/icon folder
          {
            "src": "/icon/android-launchericon-192-192.png",
            "type": "image/png",
            "sizes": "192x192",
            "purpose": "any" // Keep 'any' for broader compatibility
          },
          {
            "src": "/icon/android-launchericon-192-192.png",
            "type": "image/png",
            "sizes": "192x192",
            "purpose": "maskable"
          },
          {
            "src": "/icon/android-launchericon-512-512.png",
            "type": "image/png",
            "sizes": "512x512",
            "purpose": "any"
          },
           {
            "src": "/icon/android-launchericon-512-512.png",
            "type": "image/png",
            "sizes": "512x512",
            "purpose": "maskable"
          }
        ],
        start_url: "/",
        display: "standalone",
        theme_color: "#355E58", // Spruce
        background_color: "#BCDDDC", // Arctic
        scope: "/",
        orientation: "portrait",
        // You can add the screenshots array here too if you have the images
        // "screenshots": [ ... ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MiB
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/assets\//, /\.[^/?]+$/], // Don't intercept asset/JS/CSS requests
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,woff,woff2}'], // Files to cache
        runtimeCaching: [ // Cache strategies for runtime requests (e.g., fonts, APIs)
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }, // Cache for a year
              cacheableResponse: { statuses: [0, 200] },
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }, // Cache for a year
              cacheableResponse: { statuses: [0, 200] },
            }
          },
          // Add caching strategies for other external resources or API calls if needed
        ]
      }
    })
    // <<< End VitePWA plugin configuration >>>
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 3000
  }
})
