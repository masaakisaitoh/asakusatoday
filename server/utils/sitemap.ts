import type Database from 'better-sqlite3'

export interface SitemapUrlRow {
  id: number
  published_at: string
}

export function listPublishedArticleUrlRows(db: Database.Database): SitemapUrlRow[] {
  return db
    .prepare(
      `SELECT id, published_at FROM articles WHERE status = 'published' AND published_at IS NOT NULL ORDER BY published_at DESC`
    )
    .all() as SitemapUrlRow[]
}

export function buildSitemapXml(siteUrl: string, articleRows: SitemapUrlRow[]): string {
  const staticUrls = ['/', '/map']
  const staticEntries = staticUrls.map((path) => `  <url><loc>${siteUrl}${path}</loc></url>`)
  const articleEntries = articleRows.map(
    (row) =>
      `  <url><loc>${siteUrl}/articles/${row.id}</loc><lastmod>${row.published_at.slice(0, 10)}</lastmod></url>`
  )
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticEntries, ...articleEntries].join('\n')}\n</urlset>`
}
