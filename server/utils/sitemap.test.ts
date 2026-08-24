import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'

beforeEach(() => {
  process.env.DATABASE_PATH = ':memory:'
})

function insertArticle(
  db: Database.Database,
  overrides: { status?: string; publishedAt?: string | null } = {}
): number {
  const result = db
    .prepare(
      `INSERT INTO articles (status, category, published_at, created_at)
       VALUES (?, 'asakusa-area', ?, datetime('now'))`
    )
    .run(
      overrides.status ?? 'published',
      'publishedAt' in overrides ? overrides.publishedAt : '2026-01-01T00:00:00Z'
    )
  const articleId = result.lastInsertRowid as number
  db.prepare(
    `INSERT INTO article_translations (article_id, locale, title, body) VALUES (?, 'en', 'Title', 'Body')`
  ).run(articleId)
  return articleId
}

describe('listPublishedArticleUrlRows', () => {
  it('returns only published articles with a published_at, newest first', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const olderId = insertArticle(db, { publishedAt: '2026-01-01T00:00:00Z' })
    const newerId = insertArticle(db, { publishedAt: '2026-01-02T00:00:00Z' })
    insertArticle(db, { status: 'draft', publishedAt: null })

    const { listPublishedArticleUrlRows } = await import('./sitemap')
    const rows = listPublishedArticleUrlRows(db)

    expect(rows.map((r) => r.id)).toEqual([newerId, olderId])
  })

  it('excludes published articles with a null published_at', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    insertArticle(db, { status: 'published', publishedAt: null })

    const { listPublishedArticleUrlRows } = await import('./sitemap')
    expect(listPublishedArticleUrlRows(db)).toEqual([])
  })
})

describe('buildSitemapXml', () => {
  it('includes static pages and article URLs with lastmod dates', async () => {
    const { buildSitemapXml } = await import('./sitemap')
    const xml = buildSitemapXml('https://asakusatoday.com', [
      { id: 5, published_at: '2026-01-02T03:04:05Z' }
    ])

    expect(xml).toContain('<loc>https://asakusatoday.com/</loc>')
    expect(xml).toContain('<loc>https://asakusatoday.com/map</loc>')
    expect(xml).toContain('<loc>https://asakusatoday.com/articles/5</loc>')
    expect(xml).toContain('<lastmod>2026-01-02</lastmod>')
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
  })

  it('produces a valid urlset with no article rows', async () => {
    const { buildSitemapXml } = await import('./sitemap')
    const xml = buildSitemapXml('https://asakusatoday.com', [])

    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).not.toContain('/articles/')
  })
})
