// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest'
import { setup, $fetch, fetch as rawFetch } from '@nuxt/test-utils/e2e'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateAccount, signMessage } from '../../utils/symbolCrypto'

const dbDir = mkdtempSync(join(tmpdir(), 'asakusa-favorites-'))
const dbPath = join(dbDir, 'test.sqlite3')
process.env.DATABASE_PATH = dbPath

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

async function insertPublishedArticle(title: string): Promise<number> {
  const { useDb } = await import('../../server/utils/db')
  const db = useDb()
  const result = db
    .prepare(
      `INSERT INTO articles (status, category, published_at, created_at)
       VALUES ('published', 'traffic', '2026-01-01T00:00:00Z', datetime('now'))`
    )
    .run()
  const articleId = result.lastInsertRowid as number
  db.prepare(
    `INSERT INTO article_translations (article_id, locale, title, body) VALUES (?, 'ja', ?, 'Body')`
  ).run(articleId, title)
  return articleId
}

describe('favorites API', async () => {
  await setup({ server: true, env: { DATABASE_PATH: dbPath } })

  afterAll(() => {
    rmSync(dbDir, { recursive: true, force: true })
  })

  it('rejects a toggle request without a session', async () => {
    const articleId = await insertPublishedArticle('No Session')
    await expect($fetch(`/api/articles/${articleId}/favorite`, { method: 'POST' })).rejects.toMatchObject({
      statusCode: 401
    })
  })

  it('404s when toggling a nonexistent article', async () => {
    const cookie = await loginAndGetCookie()
    await expect(
      $fetch('/api/articles/999999/favorite', { method: 'POST', headers: { cookie } })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('adds a favorite on first toggle and removes it on second toggle', async () => {
    const cookie = await loginAndGetCookie()
    const articleId = await insertPublishedArticle('Toggle Me')

    const first: any = await $fetch(`/api/articles/${articleId}/favorite`, {
      method: 'POST',
      headers: { cookie }
    })
    expect(first.favorited).toBe(true)

    const second: any = await $fetch(`/api/articles/${articleId}/favorite`, {
      method: 'POST',
      headers: { cookie }
    })
    expect(second.favorited).toBe(false)
  })

  it('returns the updated favorite_count after each toggle', async () => {
    const cookieA = await loginAndGetCookie()
    const cookieB = await loginAndGetCookie()
    const articleId = await insertPublishedArticle('Count Toggle')

    const first: any = await $fetch(`/api/articles/${articleId}/favorite`, {
      method: 'POST',
      headers: { cookie: cookieA }
    })
    expect(first.favorite_count).toBe(1)

    const second: any = await $fetch(`/api/articles/${articleId}/favorite`, {
      method: 'POST',
      headers: { cookie: cookieB }
    })
    expect(second.favorite_count).toBe(2)

    const third: any = await $fetch(`/api/articles/${articleId}/favorite`, {
      method: 'POST',
      headers: { cookie: cookieA }
    })
    expect(third.favorite_count).toBe(1)
  })

  it('rejects a list request without a session', async () => {
    await expect($fetch('/api/favorites')).rejects.toMatchObject({ statusCode: 401 })
  })

  it("lists only the current user's favorited articles", async () => {
    const cookieA = await loginAndGetCookie()
    const cookieB = await loginAndGetCookie()
    const articleA = await insertPublishedArticle('Mine')
    const articleB = await insertPublishedArticle('Not Mine')

    await $fetch(`/api/articles/${articleA}/favorite`, { method: 'POST', headers: { cookie: cookieA } })
    await $fetch(`/api/articles/${articleB}/favorite`, { method: 'POST', headers: { cookie: cookieB } })

    const result: any = await $fetch('/api/favorites', { headers: { cookie: cookieA } })
    expect(result.total).toBe(1)
    expect(result.articles[0].title).toBe('Mine')
  })

  it('paginates favorites at 5 per page', async () => {
    const cookie = await loginAndGetCookie()
    for (let i = 0; i < 7; i++) {
      const articleId = await insertPublishedArticle(`Page Article ${i}`)
      await $fetch(`/api/articles/${articleId}/favorite`, { method: 'POST', headers: { cookie } })
    }

    const page1: any = await $fetch('/api/favorites?page=1', { headers: { cookie } })
    const page2: any = await $fetch('/api/favorites?page=2', { headers: { cookie } })
    expect(page1.articles).toHaveLength(5)
    expect(page2.articles).toHaveLength(2)
  })
})
