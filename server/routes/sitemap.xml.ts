import { listPublishedArticleUrlRows, buildSitemapXml } from '../utils/sitemap'

export default defineEventHandler((event) => {
  const db = useDb()
  const config = useRuntimeConfig()
  const rows = listPublishedArticleUrlRows(db)
  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  return buildSitemapXml(config.public.siteUrl, rows)
})
