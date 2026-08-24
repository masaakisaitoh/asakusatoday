import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'

beforeEach(() => {
  process.env.DATABASE_PATH = ':memory:'
})

function insertUser(db: Database.Database, address: string): number {
  db.prepare(
    `INSERT INTO users (address, public_key, user_name, avatar_seed, created_at)
     VALUES (?, 'pub', ?, 'seed', datetime('now'))`
  ).run(address, `User_${address}`)
  return (db.prepare('SELECT id FROM users WHERE address = ?').get(address) as { id: number }).id
}

function insertArticle(db: Database.Database, overrides: { title?: string; status?: string } = {}): number {
  const result = db
    .prepare(
      `INSERT INTO articles (status, category, published_at, created_at)
       VALUES (?, 'asakusa-area', '2026-01-01T00:00:00Z', datetime('now'))`
    )
    .run(overrides.status ?? 'published')
  const articleId = result.lastInsertRowid as number
  db.prepare(
    `INSERT INTO article_translations (article_id, locale, title, body) VALUES (?, 'ja', ?, 'Body')`
  ).run(articleId, overrides.title ?? 'Title')
  return articleId
}

describe('isFavorited', () => {
  it('returns false when not favorited', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const userId = insertUser(db, 'addr1')
    const articleId = insertArticle(db)

    const { isFavorited } = await import('./favorites')
    expect(isFavorited(db, userId, articleId)).toBe(false)
  })

  it('returns true after favoriting', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const userId = insertUser(db, 'addr1')
    const articleId = insertArticle(db)

    const { toggleFavorite, isFavorited } = await import('./favorites')
    toggleFavorite(db, userId, articleId)
    expect(isFavorited(db, userId, articleId)).toBe(true)
  })
})

describe('toggleFavorite', () => {
  it('adds a favorite and returns true when not previously favorited', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const userId = insertUser(db, 'addr1')
    const articleId = insertArticle(db)

    const { toggleFavorite } = await import('./favorites')
    expect(toggleFavorite(db, userId, articleId)).toBe(true)
  })

  it('removes a favorite and returns false when already favorited', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const userId = insertUser(db, 'addr1')
    const articleId = insertArticle(db)

    const { toggleFavorite } = await import('./favorites')
    toggleFavorite(db, userId, articleId)
    expect(toggleFavorite(db, userId, articleId)).toBe(false)
  })
})

describe('listFavoriteArticles', () => {
  it("returns only the given user's favorited published articles, newest favorite first", async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const userA = insertUser(db, 'addrA')
    const userB = insertUser(db, 'addrB')
    const articleOld = insertArticle(db, { title: 'Old' })
    const articleNew = insertArticle(db, { title: 'New' })
    const articleOthers = insertArticle(db, { title: 'Others' })

    db.prepare(
      `INSERT INTO favorites (user_id, article_id, created_at) VALUES (?, ?, '2026-01-01T00:00:00Z')`
    ).run(userA, articleOld)
    db.prepare(
      `INSERT INTO favorites (user_id, article_id, created_at) VALUES (?, ?, '2026-02-01T00:00:00Z')`
    ).run(userA, articleNew)
    db.prepare(
      `INSERT INTO favorites (user_id, article_id, created_at) VALUES (?, ?, '2026-01-15T00:00:00Z')`
    ).run(userB, articleOthers)

    const { listFavoriteArticles } = await import('./favorites')
    const result = listFavoriteArticles(db, userA, 1, 'ja')
    expect(result.total).toBe(2)
    expect(result.articles.map((a) => a.title)).toEqual(['New', 'Old'])
  })

  it('excludes favorites whose article was unpublished after favoriting', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const userId = insertUser(db, 'addr1')
    const articleId = insertArticle(db)

    const { toggleFavorite, listFavoriteArticles } = await import('./favorites')
    toggleFavorite(db, userId, articleId)
    db.prepare(`UPDATE articles SET status = 'draft' WHERE id = ?`).run(articleId)

    const result = listFavoriteArticles(db, userId, 1, 'ja')
    expect(result.total).toBe(0)
    expect(result.articles).toEqual([])
  })

  it('paginates results at 5 per page', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const userId = insertUser(db, 'addr1')

    const { toggleFavorite, listFavoriteArticles } = await import('./favorites')
    for (let i = 0; i < 7; i++) {
      const articleId = insertArticle(db, { title: `Article ${i}` })
      toggleFavorite(db, userId, articleId)
    }

    const page1 = listFavoriteArticles(db, userId, 1, 'ja')
    const page2 = listFavoriteArticles(db, userId, 2, 'ja')
    expect(page1.articles).toHaveLength(5)
    expect(page2.articles).toHaveLength(2)
    expect(page1.total).toBe(7)
  })
})
