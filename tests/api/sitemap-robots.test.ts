// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest'
import { setup, fetch as rawFetch } from '@nuxt/test-utils/e2e'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dbDir = mkdtempSync(join(tmpdir(), 'asakusa-sitemap-'))
const dbPath = join(dbDir, 'test.sqlite3')
process.env.DATABASE_PATH = dbPath

async function insertArticle(status: 'published' | 'draft', publishedAt: string | null): Promise<number> {
  const { useDb } = await import('../../server/utils/db')
  const db = useDb()
  const result = db
    .prepare(
      `INSERT INTO articles (status, category, published_at, created_at)
       VALUES (?, 'traffic', ?, datetime('now'))`
    )
    .run(status, publishedAt)
  const articleId = result.lastInsertRowid as number
  db.prepare(
    `INSERT INTO article_translations (article_id, locale, title, body) VALUES (?, 'en', 'Title', 'Body')`
  ).run(articleId)
  return articleId
}

describe('sitemap.xml and robots.txt', async () => {
  await setup({ server: true, env: { DATABASE_PATH: dbPath } })

  afterAll(() => {
    rmSync(dbDir, { recursive: true, force: true })
  })

  it('serves an XML sitemap with published article URLs and not draft ones', async () => {
    const publishedId = await insertArticle('published', '2026-01-05T00:00:00Z')
    const draftId = await insertArticle('draft', null)

    const response = await rawFetch('/sitemap.xml')
    expect(response.headers.get('content-type')).toContain('application/xml')

    const body = await response.text()
    expect(body).toContain(`https://asakusatoday.com/articles/${publishedId}`)
    expect(body).not.toContain(`https://asakusatoday.com/articles/${draftId}`)
    expect(body).toContain('https://asakusatoday.com/map')
  })

  it('serves a robots.txt disallowing private pages and pointing at the sitemap', async () => {
    const response = await rawFetch('/robots.txt')
    expect(response.headers.get('content-type')).toContain('text/plain')

    const body = await response.text()
    expect(body).toContain('Disallow: /login')
    expect(body).toContain('Disallow: /admin/')
    expect(body).toContain('Sitemap: https://asakusatoday.com/sitemap.xml')
  })
})
