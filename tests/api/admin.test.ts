// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest'
import { setup, $fetch, fetch as rawFetch } from '@nuxt/test-utils/e2e'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateAccount, signMessage } from '../../utils/symbolCrypto'

const dbDir = mkdtempSync(join(tmpdir(), 'asakusa-admin-'))
const dbPath = join(dbDir, 'test.sqlite3')
// The test process and the spawned server process are separate — both must
// point at the same DB file. setup()'s `env` option covers the server
// process; this covers useDb() calls made directly from this test file.
process.env.DATABASE_PATH = dbPath

async function loginAndGetCookie(): Promise<{ cookie: string; address: string }> {
  const account = generateAccount()
  const { nonce } = await $fetch('/api/auth/nonce', {
    method: 'POST',
    body: { address: account.address }
  })
  const signature = signMessage(account.privateKey, nonce)
  const response = await rawFetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: account.address, publicKey: account.publicKey, signature, nonce })
  })
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]
  return { cookie, address: account.address }
}

async function makeAdmin(address: string): Promise<void> {
  const { useDb } = await import('../../server/utils/db')
  const db = useDb()
  db.prepare('UPDATE users SET is_admin = 1 WHERE address = ?').run(address)
}

async function insertDraft(sourceUrl: string): Promise<number> {
  const { useDb } = await import('../../server/utils/db')
  const db = useDb()
  db.prepare(
    `INSERT OR IGNORE INTO sources (url, site_name, category, raw_text, fetched_at)
     VALUES (?, 'e-asakusa.jp', 'asakusa-area', '元テキスト', datetime('now'))`
  ).run(sourceUrl)
  const source = db.prepare(`SELECT id FROM sources WHERE url = ?`).get(sourceUrl) as { id: number }
  const articleResult = db
    .prepare(
      `INSERT INTO articles (status, category, created_at)
       VALUES ('draft', 'asakusa-area', datetime('now'))`
    )
    .run()
  const articleId = articleResult.lastInsertRowid as number
  db.prepare(
    `INSERT INTO article_translations (article_id, locale, title, body)
     VALUES (?, 'ja', '下書きタイトル', '下書き本文')`
  ).run(articleId)
  db.prepare(`INSERT INTO article_sources (article_id, source_id) VALUES (?, ?)`).run(articleId, source.id)
  return articleId
}

async function insertPublished(sourceUrl: string): Promise<number> {
  const { useDb } = await import('../../server/utils/db')
  const db = useDb()
  db.prepare(
    `INSERT OR IGNORE INTO sources (url, site_name, category, raw_text, fetched_at)
     VALUES (?, 'e-asakusa.jp', 'asakusa-area', '元テキスト', datetime('now'))`
  ).run(sourceUrl)
  const source = db.prepare(`SELECT id FROM sources WHERE url = ?`).get(sourceUrl) as { id: number }
  const articleResult = db
    .prepare(
      `INSERT INTO articles (status, category, published_at, created_at)
       VALUES ('published', 'asakusa-area', datetime('now'), datetime('now'))`
    )
    .run()
  const articleId = articleResult.lastInsertRowid as number
  db.prepare(
    `INSERT INTO article_translations (article_id, locale, title, body)
     VALUES (?, 'ja', '公開タイトル', '公開本文')`
  ).run(articleId)
  db.prepare(`INSERT INTO article_sources (article_id, source_id) VALUES (?, ?)`).run(articleId, source.id)
  return articleId
}

describe('admin drafts API', async () => {
  await setup({ server: true, env: { DATABASE_PATH: dbPath } })

  afterAll(() => {
    rmSync(dbDir, { recursive: true, force: true })
  })

  it('rejects non-admin users with 403', async () => {
    const { cookie } = await loginAndGetCookie()
    await expect($fetch('/api/admin/drafts', { headers: { cookie } })).rejects.toMatchObject({
      statusCode: 403
    })
  })

  it('lists drafts for an admin user', async () => {
    const { cookie, address } = await loginAndGetCookie()
    await makeAdmin(address)
    await insertDraft('https://e-asakusa.jp/list-test')

    const drafts: any = await $fetch('/api/admin/drafts', { headers: { cookie } })
    const draft = drafts.articles.find((d: any) => d.sources.some((s: any) => s.url === 'https://e-asakusa.jp/list-test'))
    expect(draft).toBeDefined()
    expect(draft.category).toBe('asakusa-area')
    expect(draft.title).toBe('下書きタイトル')
  })

  it('publishes a draft', async () => {
    const { cookie, address } = await loginAndGetCookie()
    await makeAdmin(address)
    const id = await insertDraft('https://e-asakusa.jp/publish-test')

    const published: any = await $fetch(`/api/admin/drafts/${id}/publish`, {
      method: 'POST',
      headers: { cookie }
    })
    expect(published.status).toBe('published')
    expect(published.published_at).not.toBeNull()
  })

  it('rejects a draft and resets its source for reprocessing', async () => {
    const { cookie, address } = await loginAndGetCookie()
    await makeAdmin(address)
    const sourceUrl = 'https://e-asakusa.jp/reject-test'
    const id = await insertDraft(sourceUrl)

    const { useDb: useDbBefore } = await import('../../server/utils/db')
    const dbBefore = useDbBefore()
    const user = dbBefore.prepare('SELECT id FROM users WHERE address = ?').get(address) as { id: number }
    // Defensive insurance: today a draft can never actually be favorited, but this
    // confirms any stray favorites row referencing the rejected article is cleaned up.
    dbBefore
      .prepare(`INSERT INTO favorites (user_id, article_id, created_at) VALUES (?, ?, datetime('now'))`)
      .run(user.id, id)

    await $fetch(`/api/admin/drafts/${id}/reject`, { method: 'POST', headers: { cookie } })

    const { useDb } = await import('../../server/utils/db')
    const db = useDb()
    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(id)
    expect(article).toBeUndefined()
    const translations = db.prepare('SELECT * FROM article_translations WHERE article_id = ?').all(id)
    expect(translations).toHaveLength(0)
    const source = db.prepare('SELECT processed_at FROM sources WHERE url = ?').get(sourceUrl) as any
    expect(source.processed_at).toBeNull()
    const favorites = db.prepare('SELECT * FROM favorites WHERE article_id = ?').all(id)
    expect(favorites).toHaveLength(0)
  })

  it('lists articles of every status for an admin user (admin articles endpoint)', async () => {
    const { cookie, address } = await loginAndGetCookie()
    await makeAdmin(address)
    await insertDraft('https://e-asakusa.jp/all-list-draft')
    await insertPublished('https://e-asakusa.jp/all-list-published')

    const result: any = await $fetch('/api/admin/articles', { headers: { cookie } })
    expect(result.articles.find((a: any) => a.sources.some((s: any) => s.url === 'https://e-asakusa.jp/all-list-draft'))).toBeDefined()
    expect(result.articles.find((a: any) => a.sources.some((s: any) => s.url === 'https://e-asakusa.jp/all-list-published'))).toBeDefined()
  })

  it('rejects non-admin users from the admin articles endpoint with 403', async () => {
    const { cookie } = await loginAndGetCookie()
    await expect($fetch('/api/admin/articles', { headers: { cookie } })).rejects.toMatchObject({
      statusCode: 403
    })
  })

  it('deletes a published article without resetting its source processed_at', async () => {
    const { cookie, address } = await loginAndGetCookie()
    await makeAdmin(address)
    const sourceUrl = 'https://e-asakusa.jp/delete-published-test'
    const id = await insertPublished(sourceUrl)
    const { useDb: useDbBefore } = await import('../../server/utils/db')
    useDbBefore()
      .prepare(`UPDATE sources SET processed_at = '2026-01-01T00:00:00Z' WHERE url = ?`)
      .run(sourceUrl)

    await $fetch(`/api/admin/articles/${id}`, { method: 'DELETE', headers: { cookie } })

    const { useDb } = await import('../../server/utils/db')
    const db = useDb()
    expect(db.prepare('SELECT * FROM articles WHERE id = ?').get(id)).toBeUndefined()
    const source = db.prepare('SELECT processed_at FROM sources WHERE url = ?').get(sourceUrl) as any
    expect(source.processed_at).toBe('2026-01-01T00:00:00Z')
  })

  it('refuses to delete a draft article with 404', async () => {
    const { cookie, address } = await loginAndGetCookie()
    await makeAdmin(address)
    const id = await insertDraft('https://e-asakusa.jp/delete-draft-test')

    await expect(
      $fetch(`/api/admin/articles/${id}`, { method: 'DELETE', headers: { cookie } })
    ).rejects.toMatchObject({ statusCode: 404 })

    const { useDb } = await import('../../server/utils/db')
    const db = useDb()
    expect(db.prepare('SELECT * FROM articles WHERE id = ?').get(id)).toBeDefined()
  })

  it('rejects non-admin users from the delete endpoint with 403', async () => {
    const { address } = await loginAndGetCookie()
    await makeAdmin(address)
    const id = await insertPublished('https://e-asakusa.jp/delete-non-admin-test')
    const { cookie: userCookie } = await loginAndGetCookie()

    await expect(
      $fetch(`/api/admin/articles/${id}`, { method: 'DELETE', headers: { cookie: userCookie } })
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})
