// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setup, createPage } from '@nuxt/test-utils/e2e'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dbDir = mkdtempSync(join(tmpdir(), 'asakusa-favorites-e2e-'))
const dbPath = join(dbDir, 'test.sqlite3')
process.env.DATABASE_PATH = dbPath

async function createAndLoginAccount(page: Awaited<ReturnType<typeof createPage>>): Promise<void> {
  await page.check('input[type=checkbox]')
  await page.click('text=Create account')
  await page.check('input[type=checkbox]')
  await page.click('text=Continue')
  await page.waitForURL(/\/profile/)
}

describe('favorites flow', async () => {
  await setup({ server: true, env: { DATABASE_PATH: dbPath } })

  beforeAll(async () => {
    const { useDb, resetDbForTests } = await import('../../server/utils/db')
    resetDbForTests()
    const db = useDb()
    const result = db
      .prepare(
        `INSERT INTO articles (status, category, published_at, created_at)
         VALUES ('published', 'traffic', '2026-01-01T00:00:00Z', datetime('now'))`
      )
      .run()
    const articleId = result.lastInsertRowid as number
    db.prepare(
      `INSERT INTO article_translations (article_id, locale, title, body)
       VALUES (?, 'en', 'Favorite Test Article', 'Body text')`
    ).run(articleId)

    const otherResult = db
      .prepare(
        `INSERT INTO articles (status, category, published_at, created_at)
         VALUES ('published', 'traffic', '2026-01-02T00:00:00Z', datetime('now'))`
      )
      .run()
    db.prepare(
      `INSERT INTO article_translations (article_id, locale, title, body)
       VALUES (?, 'en', 'Never Favorited Article', 'Other body')`
    ).run(otherResult.lastInsertRowid)
  })

  afterAll(() => {
    rmSync(dbDir, { recursive: true, force: true })
  })

  it('redirects to login when visiting /favorites while logged out', async () => {
    const page = await createPage('/favorites')
    await page.waitForURL(/\/login/)
    await page.close()
  }, 30000)

  it('shows the heart button but redirects to login on click when logged out', async () => {
    const page = await createPage('/')
    await page.waitForSelector('a[href^="/articles/"]')
    await page.click('a[href^="/articles/"]')
    await page.waitForURL(/\/articles\//)
    await page.click('[aria-label="Add to favorites"]')
    await page.waitForURL(/\/login/)
    await page.close()
  }, 30000)

  it('favorites an article, sees it in the Favorites list, then unfavorites it', async () => {
    const page = await createPage('/account/create')
    await createAndLoginAccount(page)

    await page.goto(new URL('/', page.url()).toString())
    await page.waitForSelector('text=Favorite Test Article')
    await page.click('text=Favorite Test Article')
    await page.waitForURL(/\/articles\//)

    await page.click('[aria-label="Add to favorites"]')
    await page.waitForSelector('[aria-label="Remove from favorites"]')

    await page.click('[aria-label="User menu"]')
    await page.click('text=Favorites')
    await page.waitForURL(/\/favorites/)
    await page.waitForSelector('a[href^="/articles/"]')
    expect(await page.locator('a[href^="/articles/"]').count()).toBe(1)

    await page.goBack()
    await page.waitForURL(/\/articles\//)
    await page.click('[aria-label="Remove from favorites"]')
    await page.waitForSelector('[aria-label="Add to favorites"]')

    await page.click('[aria-label="User menu"]')
    await page.click('text=Favorites')
    await page.waitForURL(/\/favorites/)
    await page.waitForSelector('text=No favorites yet.')
    expect(await page.locator('text=No favorites yet.').isVisible()).toBe(true)

    await page.close()
  }, 30000)
})
