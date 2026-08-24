export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return [
    'User-agent: *',
    'Disallow: /login',
    'Disallow: /profile',
    'Disallow: /favorites',
    'Disallow: /account/',
    'Disallow: /admin/',
    'Disallow: /api/',
    '',
    `Sitemap: ${config.public.siteUrl}/sitemap.xml`
  ].join('\n')
})
