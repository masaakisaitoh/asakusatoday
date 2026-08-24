export default defineNuxtConfig({
  compatibilityDate: '2026-08-13',
  devtools: { enabled: false },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css', 'leaflet/dist/leaflet.css', 'maplibre-gl/dist/maplibre-gl.css'],
  runtimeConfig: {
    public: {
      maptilerKey: process.env.MAPTILER_KEY ?? '',
      siteUrl: process.env.SITE_URL ?? 'https://asakusatoday.com'
    }
  },
  app: {
    head: {
      titleTemplate: '%s | ASAKUSA TODAY',
      link: [
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'shortcut icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' }
      ],
      meta: [
        { name: 'theme-color', content: '#c83b32' },
        { name: 'description', content: 'Local news and updates from Asakusa, Tokyo.' },
        { property: 'og:site_name', content: 'ASAKUSA TODAY' },
        { property: 'og:image', content: 'https://asakusatoday.com/logo.png' },
        { name: 'twitter:card', content: 'summary_large_image' }
      ],
      script: [
        {
          src: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4995620565805965',
          async: true,
          crossorigin: 'anonymous'
        }
      ]
    }
  }
})
