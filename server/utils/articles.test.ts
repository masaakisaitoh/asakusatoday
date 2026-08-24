import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'

beforeEach(() => {
  process.env.DATABASE_PATH = ':memory:'
})

function insertArticle(
  db: Database.Database,
  overrides: { title?: string; status?: string; publishedAt?: string | null; category?: string } = {}
): number {
  const result = db
    .prepare(
      `INSERT INTO articles (status, category, published_at, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    )
    .run(
      overrides.status ?? 'published',
      overrides.category ?? 'asakusa-area',
      overrides.publishedAt ?? '2026-01-01T00:00:00Z'
    )
  const articleId = result.lastInsertRowid as number
  db.prepare(
    `INSERT INTO article_translations (article_id, locale, title, body) VALUES (?, 'ja', ?, 'Body')`
  ).run(articleId, overrides.title ?? 'Title')
  return articleId
}

function linkSource(db: Database.Database, articleId: number, url: string, siteName: string): void {
  const sourceResult = db
    .prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at)
       VALUES (?, ?, 'asakusa-area', 'text', datetime('now'))`
    )
    .run(url, siteName)
  db.prepare(`INSERT INTO article_sources (article_id, source_id) VALUES (?, ?)`).run(
    articleId,
    sourceResult.lastInsertRowid
  )
}

describe('normalizeLocale', () => {
  it('returns the value when it is a supported locale', async () => {
    const { normalizeLocale } = await import('./articles')
    expect(normalizeLocale('ja')).toBe('ja')
    expect(normalizeLocale('zh-Hant')).toBe('zh-Hant')
  })

  it('defaults to en for unsupported or missing values', async () => {
    const { normalizeLocale } = await import('./articles')
    expect(normalizeLocale('fr')).toBe('en')
    expect(normalizeLocale(undefined)).toBe('en')
    expect(normalizeLocale(Array.isArray(['a']) ? ['a'] : 'x')).toBe('en')
  })
})

describe('parsePage', () => {
  it('returns the value when it is a positive integer', async () => {
    const { parsePage } = await import('./articles')
    expect(parsePage(3)).toBe(3)
    expect(parsePage('3')).toBe(3)
  })

  it('defaults to 1 for non-integer, zero, negative, or missing values', async () => {
    const { parsePage } = await import('./articles')
    expect(parsePage(1.5)).toBe(1)
    expect(parsePage('1.5')).toBe(1)
    expect(parsePage(0)).toBe(1)
    expect(parsePage(-1)).toBe(1)
    expect(parsePage(undefined)).toBe(1)
    expect(parsePage('abc')).toBe(1)
  })
})

describe('listPublishedArticles', () => {
  it('returns only published articles ordered by published_at desc', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    insertArticle(db, { title: 'Old', publishedAt: '2026-01-01T00:00:00Z' })
    insertArticle(db, { title: 'New', publishedAt: '2026-02-01T00:00:00Z' })
    insertArticle(db, { title: 'Draft', status: 'draft', publishedAt: null })

    const { listPublishedArticles } = await import('./articles')
    const result = listPublishedArticles(db, 1, 'ja')

    expect(result.total).toBe(2)
    expect(result.articles.map((a) => a.title)).toEqual(['New', 'Old'])
  })

  it('filters by category when one is provided', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    insertArticle(db, { title: 'Kuramae News', category: 'kuramae-area' })
    insertArticle(db, { title: 'Ryogoku News', category: 'ryogoku-area' })

    const { listPublishedArticles } = await import('./articles')
    const result = listPublishedArticles(db, 1, 'ja', 'kuramae-area')

    expect(result.total).toBe(1)
    expect(result.articles.map((a) => a.title)).toEqual(['Kuramae News'])
  })

  it('paginates results at 5 per page', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    for (let i = 0; i < 12; i++) {
      insertArticle(db, {
        title: `Article ${i}`,
        publishedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`
      })
    }

    const { listPublishedArticles } = await import('./articles')
    const page1 = listPublishedArticles(db, 1, 'ja')
    const page2 = listPublishedArticles(db, 2, 'ja')
    const page3 = listPublishedArticles(db, 3, 'ja')

    expect(page1.articles).toHaveLength(5)
    expect(page2.articles).toHaveLength(5)
    expect(page3.articles).toHaveLength(2)
    expect(page1.total).toBe(12)
    expect(page1.pageSize).toBe(5)
  })

  it('returns an empty array for a page beyond the last', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    insertArticle(db)

    const { listPublishedArticles } = await import('./articles')
    const result = listPublishedArticles(db, 99, 'ja')

    expect(result.articles).toEqual([])
  })

  it('clamps page numbers below 1 to page 1', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    insertArticle(db, { title: 'Only' })

    const { listPublishedArticles } = await import('./articles')
    const result = listPublishedArticles(db, 0, 'ja')

    expect(result.page).toBe(1)
    expect(result.articles).toHaveLength(1)
  })

  it('includes the category and linked sources for each article', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const articleId = insertArticle(db, { title: 'WithSources', category: 'traffic' })
    linkSource(db, articleId, 'https://example.com/a', 'Example A')
    linkSource(db, articleId, 'https://example.com/b', 'Example B')

    const { listPublishedArticles } = await import('./articles')
    const result = listPublishedArticles(db, 1, 'ja')

    expect(result.articles[0].category).toBe('traffic')
    expect(result.articles[0].sources).toEqual(
      expect.arrayContaining([
        { url: 'https://example.com/a', siteName: 'Example A' },
        { url: 'https://example.com/b', siteName: 'Example B' }
      ])
    )
  })

  it('returns the requested locale translation when it exists', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const articleId = insertArticle(db, { title: 'Japanese Title' })
    db.prepare(
      `INSERT INTO article_translations (article_id, locale, title, body) VALUES (?, 'en', 'English Title', 'English Body')`
    ).run(articleId)

    const { listPublishedArticles } = await import('./articles')
    const result = listPublishedArticles(db, 1, 'en')

    expect(result.articles[0].title).toBe('English Title')
    expect(result.articles[0].body).toBe('English Body')
  })

  it('falls back to the ja translation when the requested locale has none', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    insertArticle(db, { title: 'Only Japanese' })

    const { listPublishedArticles } = await import('./articles')
    const result = listPublishedArticles(db, 1, 'en')

    expect(result.articles[0].title).toBe('Only Japanese')
  })
})

describe('getPublishedArticleById', () => {
  it('returns undefined for a draft article', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const id = insertArticle(db, { status: 'draft' })

    const { getPublishedArticleById } = await import('./articles')
    expect(getPublishedArticleById(db, id, 'ja')).toBeUndefined()
  })

  it('returns undefined for a nonexistent id', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()

    const { getPublishedArticleById } = await import('./articles')
    expect(getPublishedArticleById(db, 999999, 'ja')).toBeUndefined()
  })

  it('returns the article with its sources for a published id', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const id = insertArticle(db, { title: 'Findable' })
    linkSource(db, id, 'https://example.com/a', 'Example A')

    const { getPublishedArticleById } = await import('./articles')
    const article = getPublishedArticleById(db, id, 'ja')
    expect(article?.title).toBe('Findable')
    expect(article?.sources).toEqual([{ url: 'https://example.com/a', siteName: 'Example A' }])
  })

  it('falls back to the ja translation when the requested locale has none', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const id = insertArticle(db, { title: 'Japanese Only' })

    const { getPublishedArticleById } = await import('./articles')
    const article = getPublishedArticleById(db, id, 'ko')
    expect(article?.title).toBe('Japanese Only')
  })
})

describe('publishedArticleExists', () => {
  it('returns true for a published article', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const id = insertArticle(db)

    const { publishedArticleExists } = await import('./articles')
    expect(publishedArticleExists(db, id)).toBe(true)
  })

  it('returns false for a draft article', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const id = insertArticle(db, { status: 'draft' })

    const { publishedArticleExists } = await import('./articles')
    expect(publishedArticleExists(db, id)).toBe(false)
  })

  it('returns false for a nonexistent id', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()

    const { publishedArticleExists } = await import('./articles')
    expect(publishedArticleExists(db, 999999)).toBe(false)
  })
})
