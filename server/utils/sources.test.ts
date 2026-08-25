import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'

beforeEach(() => {
  process.env.DATABASE_PATH = ':memory:'
})

function insertSource(
  db: Database.Database,
  overrides: {
    url?: string
    siteName?: string
    category?: string
    fetchedAt?: string
    processedAt?: string | null
  } = {}
): number {
  const result = db
    .prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at, processed_at)
       VALUES (?, ?, ?, 'raw text', ?, ?)`
    )
    .run(
      overrides.url ?? `https://e-asakusa.jp/source-${Math.random()}`,
      overrides.siteName ?? 'e-asakusa.jp',
      overrides.category ?? 'asakusa-area',
      overrides.fetchedAt ?? '2026-01-01T00:00:00Z',
      overrides.processedAt ?? null
    )
  return result.lastInsertRowid as number
}

describe('listSources', () => {
  it('returns sources ordered by fetched_at desc', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    insertSource(db, { url: 'https://e-asakusa.jp/old', fetchedAt: '2026-01-01T00:00:00Z' })
    insertSource(db, { url: 'https://e-asakusa.jp/new', fetchedAt: '2026-02-01T00:00:00Z' })

    const { listSources } = await import('./sources')
    const result = listSources(db, 1)

    expect(result.total).toBe(2)
    expect(result.sources.map((s) => s.url)).toEqual(['https://e-asakusa.jp/new', 'https://e-asakusa.jp/old'])
  })

  it('includes sources regardless of processed_at, and paginates at 20 per page', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    for (let i = 0; i < 25; i++) {
      insertSource(db, {
        url: `https://e-asakusa.jp/item-${i}`,
        fetchedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        processedAt: i % 2 === 0 ? '2026-03-01T00:00:00Z' : null
      })
    }

    const { listSources } = await import('./sources')
    const page1 = listSources(db, 1)
    const page2 = listSources(db, 2)

    expect(page1.sources).toHaveLength(20)
    expect(page2.sources).toHaveLength(5)
    expect(page1.total).toBe(25)
    expect(page1.pageSize).toBe(20)
    expect(page1.sources.some((s) => s.processed_at === null)).toBe(true)
    expect(page1.sources.some((s) => s.processed_at !== null)).toBe(true)
  })
})
