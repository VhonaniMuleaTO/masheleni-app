import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'Masheleni Budget',
      short_name: 'Masheleni',
      description: 'A personal budget and savings tracker.',
      theme_color: '#232522',
      background_color: '#f4f2ec',
      display: 'standalone',
      start_url: './',
      icons: [
        { src: './2.png', sizes: '500x500', type: 'image/png' },
      ],
    },
    workbox: { navigateFallback: './index.html' },
  })],
})
