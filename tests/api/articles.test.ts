// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setup, $fetch, fetch as rawFetch } from '@nuxt/test-utils/e2e'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateAccount, signMessage } from '../../utils/symbolCrypto'

const dbDir = mkdtempSync(join(tmpdir(), 'asakusa-articles-'))
const dbPath = join(dbDir, 'test.sqlite3')

async function loginAndGetCookie(): Promise<string> {
  const account = generateAccount()
  const { nonce } = await $fetch('/api/auth/nonce', { method: 'POST', body: { address: account.address } })
  const signature = signMessage(account.privateKey, nonce)
  const response = await rawFetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: account.address, publicKey: account.publicKey, signature, nonce })
  })
  return (response.headers.get('set-cookie') ?? '').split(';')[0]
}

describe('articles API', async () => {
  await setup({ server: true, env: { DATABASE_PATH: dbPath } })

  beforeAll(async () => {
    process.env.DATABASE_PATH = dbPath
    const { useDb, resetDbForTests } = await import('../../server/utils/db')
    resetDbForTests()
    const db = useDb()
    const articleResult = db
      .prepare(
        `INSERT INTO articles (status, category, published_at, created_at)
         VALUES ('published', 'traffic', ?, datetime('now'))`
      )
      .run('2026-01-01T00:00:00Z')
    const articleId = articleResult.lastInsertRowid
    db.prepare(
      `INSERT INTO article_translations (article_id, locale, title, body) VALUES (?, 'ja', '公開記事', '本文です')`
    ).run(articleId)
    db.prepare(
      `INSERT INTO article_translations (article_id, locale, title, body) VALUES (?, 'en', 'Published Article', 'English body')`
    ).run(articleId)
    const sourceResult = db
      .prepare(
        `INSERT INTO sources (url, site_name, category, raw_text, fetched_at)
         VALUES ('https://example.com', 'Example', 'traffic', 'text', datetime('now'))`
      )
      .run()
    db.prepare(`INSERT INTO article_sources (article_id, source_id) VALUES (?, ?)`).run(
      articleId,
      sourceResult.lastInsertRowid
    )
    const draftResult = db
      .prepare(
        `INSERT INTO articles (status, category, created_at) VALUES ('draft', 'traffic', datetime('now'))`
      )
      .run()
    db.prepare(
      `INSERT INTO article_translations (article_id, locale, title, body) VALUES (?, 'ja', '下書き記事', '下書き本文')`
    ).run(draftResult.lastInsertRowid)

    const kuramaeResult = db
      .prepare(
        `INSERT INTO articles (status, category, published_at, created_at)
         VALUES ('published', 'kuramae-area', ?, datetime('now'))`
      )
      .run('2025-12-31T00:00:00Z')
    db.prepare(
      `INSERT INTO article_translations (article_id, locale, title, body) VALUES (?, 'en', 'Kuramae Article', 'Kuramae body')`
    ).run(kuramaeResult.lastInsertRowid)
  })

  afterAll(() => {
    rmSync(dbDir, { recursive: true, force: true })
  })

  it('lists only published articles, defaulting to en', async () => {
    const result: any = await $fetch('/api/articles')
    expect(result.articles).toHaveLength(2)
    expect(result.articles[0].title).toBe('Published Article')
  })

  it('filters the list to only the requested category', async () => {
    const result: any = await $fetch('/api/articles?category=kuramae-area')
    expect(result.articles).toHaveLength(1)
    expect(result.articles[0].title).toBe('Kuramae Article')
    expect(result.total).toBe(1)
  })

  it('returns no articles for a category with no published matches', async () => {
    const result: any = await $fetch('/api/articles?category=ryogoku-area')
    expect(result.articles).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('returns the ja title when lang=ja is requested', async () => {
    const result: any = await $fetch('/api/articles?lang=ja')
    expect(result.articles[0].title).toBe('公開記事')
  })

  it('falls back to ja when the requested lang has no translation', async () => {
    const result: any = await $fetch('/api/articles?lang=ko')
    expect(result.articles[0].title).toBe('公開記事')
  })

  it('includes category and sources for a listed article', async () => {
    const result: any = await $fetch('/api/articles')
    expect(result.articles[0].category).toBe('traffic')
    expect(result.articles[0].sources).toEqual([{ url: 'https://example.com', siteName: 'Example' }])
  })

  it('returns the published article by id, including category and sources', async () => {
    const list: any = await $fetch('/api/articles')
    const id = list.articles[0].id
    const article: any = await $fetch(`/api/articles/${id}?lang=ja`)
    expect(article.title).toBe('公開記事')
    expect(article.body).toBe('本文です')
    expect(article.category).toBe('traffic')
    expect(article.sources).toEqual([{ url: 'https://example.com', siteName: 'Example' }])
  })

  it('defaults the detail endpoint to en', async () => {
    const list: any = await $fetch('/api/articles')
    const id = list.articles[0].id
    const article: any = await $fetch(`/api/articles/${id}`)
    expect(article.title).toBe('Published Article')
    expect(article.body).toBe('English body')
  })

  it('404s for a draft article id', async () => {
    const { useDb } = await import('../../server/utils/db')
    const db = useDb()
    const draft = db.prepare(`SELECT id FROM articles WHERE status = 'draft'`).get() as {
      id: number
    }
    await expect($fetch(`/api/articles/${draft.id}`)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('404s for a nonexistent article id', async () => {
    await expect($fetch('/api/articles/999999')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('includes is_favorited: false for a logged-out request', async () => {
    const list: any = await $fetch('/api/articles')
    const id = list.articles[0].id
    const article: any = await $fetch(`/api/articles/${id}`)
    expect(article.is_favorited).toBe(false)
  })

  it('includes is_favorited: true after the article is favorited', async () => {
    const cookie = await loginAndGetCookie()
    const list: any = await $fetch('/api/articles')
    const id = list.articles[0].id
    await $fetch(`/api/articles/${id}/favorite`, { method: 'POST', headers: { cookie } })

    const article: any = await $fetch(`/api/articles/${id}`, { headers: { cookie } })
    expect(article.is_favorited).toBe(true)
  })

  it('includes favorite_count reflecting favorites from all users', async () => {
    const { useDb } = await import('../../server/utils/db')
    const db = useDb()
    const result = db
      .prepare(
        `INSERT INTO articles (status, category, published_at, created_at)
         VALUES ('published', 'traffic', '2026-01-01T00:00:00Z', datetime('now'))`
      )
      .run()
    const id = result.lastInsertRowid
    db.prepare(
      `INSERT INTO article_translations (article_id, locale, title, body) VALUES (?, 'en', 'Count Me', 'Body')`
    ).run(id)

    const cookieA = await loginAndGetCookie()
    const cookieB = await loginAndGetCookie()
    await $fetch(`/api/articles/${id}/favorite`, { method: 'POST', headers: { cookie: cookieA } })
    await $fetch(`/api/articles/${id}/favorite`, { method: 'POST', headers: { cookie: cookieB } })

    const article: any = await $fetch(`/api/articles/${id}`)
    expect(article.favorite_count).toBe(2)
  })

  it('does not leak another user\'s favorite into is_favorited', async () => {
    const cookieA = await loginAndGetCookie()
    const cookieB = await loginAndGetCookie()
    const list: any = await $fetch('/api/articles')
    const id = list.articles[0].id
    await $fetch(`/api/articles/${id}/favorite`, { method: 'POST', headers: { cookie: cookieA } })

    const asB: any = await $fetch(`/api/articles/${id}`, { headers: { cookie: cookieB } })
    expect(asB.is_favorited).toBe(false)
  })
})
