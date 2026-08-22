import { describe, it, expect } from 'vitest'
import type Database from 'better-sqlite3'
import type { SourceSite } from '../config/sources'

describe('extractArticleText', () => {
  it('strips scripts and styles, keeping visible text', async () => {
    const { extractArticleText } = await import('./collector')
    const html =
      '<html><head><style>.a{color:red}</style></head><body><script>alert(1)</script><h1>タイトル</h1><p>本文です</p></body></html>'
    const text = extractArticleText(html)
    expect(text).toContain('タイトル')
    expect(text).toContain('本文です')
    expect(text).not.toContain('alert')
  })
})

describe('extractArticleLinks', () => {
  it('extracts links matching the pattern and resolves them to absolute URLs', async () => {
    const { extractArticleLinks } = await import('./collector')
    const html = `
      <html><body>
        <a href="/headline/1059/">記事1</a>
        <a href="/headline/1058/">記事2</a>
        <a href="/gourmet/archives/1/">カテゴリ一覧</a>
        <a href="https://asakusa.keizai.biz/headline/1057/">記事3(絶対URL)</a>
      </body></html>
    `
    const links = extractArticleLinks(html, 'https://asakusa.keizai.biz/', /\/headline\/\d+\//)
    expect(links).toEqual([
      'https://asakusa.keizai.biz/headline/1059/',
      'https://asakusa.keizai.biz/headline/1058/',
      'https://asakusa.keizai.biz/headline/1057/'
    ])
  })

  it('dedupes repeated hrefs pointing to the same article', async () => {
    const { extractArticleLinks } = await import('./collector')
    const html = `
      <html><body>
        <a href="/headline/1059/"><img src="thumb.jpg" /></a>
        <a href="/headline/1059/">記事1</a>
      </body></html>
    `
    const links = extractArticleLinks(html, 'https://asakusa.keizai.biz/', /\/headline\/\d+\//)
    expect(links).toEqual(['https://asakusa.keizai.biz/headline/1059/'])
  })
})

function fakeFetch(responses: Record<string, { ok: boolean; text: string }>): typeof fetch {
  return (async (url: string) => {
    const res = responses[url]
    return { ok: res.ok, text: async () => res.text } as Response
  }) as typeof fetch
}

describe('collectSource', () => {
  it('inserts a new source row on success', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db: Database.Database = useDb()
    const { collectSource } = await import('./collector')
    const site: Extract<SourceSite, { type: 'page' }> = { type: 'page', url: 'https://e-asakusa.jp/', siteName: 'e-asakusa.jp', category: 'asakusa-area' }
    const fetchFn = fakeFetch({ 'https://e-asakusa.jp/': { ok: true, text: '<p>本文</p>' } })

    const result = await collectSource(db, site, fetchFn)

    expect(result).toBe('inserted')
    const row = db.prepare('SELECT * FROM sources').get() as any
    expect(row.url).toBe('https://e-asakusa.jp/')
    expect(row.raw_text).toContain('本文')
    expect(row.category).toBe('asakusa-area')
  })

  it('skips a url that was already collected', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db: Database.Database = useDb()
    const { collectSource } = await import('./collector')
    const site: Extract<SourceSite, { type: 'page' }> = { type: 'page', url: 'https://e-asakusa.jp/', siteName: 'e-asakusa.jp', category: 'asakusa-area' }
    const fetchFn = fakeFetch({ 'https://e-asakusa.jp/': { ok: true, text: '<p>本文</p>' } })

    await collectSource(db, site, fetchFn)
    const result = await collectSource(db, site, fetchFn)

    expect(result).toBe('skipped')
    const count = (db.prepare('SELECT COUNT(*) as c FROM sources').get() as any).c
    expect(count).toBe(1)
  })

  it('returns error when the fetch response is not ok', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db: Database.Database = useDb()
    const { collectSource } = await import('./collector')
    const site: Extract<SourceSite, { type: 'page' }> = { type: 'page', url: 'https://e-asakusa.jp/broken', siteName: 'e-asakusa.jp', category: 'asakusa-area' }
    const fetchFn = fakeFetch({ 'https://e-asakusa.jp/broken': { ok: false, text: '' } })

    const result = await collectSource(db, site, fetchFn)
    expect(result).toBe('error')
  })

  it('does not call fetchFn when the url already exists in the db', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db: Database.Database = useDb()
    const { collectSource } = await import('./collector')
    const site: Extract<SourceSite, { type: 'page' }> = {
      type: 'page',
      url: 'https://e-asakusa.jp/',
      siteName: 'e-asakusa.jp',
      category: 'asakusa-area'
    }
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(site.url, site.siteName, site.category, '既存の本文')

    let callCount = 0
    const fetchFn = (async () => {
      callCount++
      return { ok: true, text: async () => '<p>新しい本文</p>' } as Response
    }) as typeof fetch

    const result = await collectSource(db, site, fetchFn)

    expect(result).toBe('skipped')
    expect(callCount).toBe(0)
  })
})

describe('collectListSource', () => {
  const site: Extract<SourceSite, { type: 'list' }> = {
    type: 'list',
    url: 'https://asakusa.keizai.biz/',
    siteName: 'asakusa.keizai.biz',
    category: 'asakusa-area',
    articleLinkPattern: /\/headline\/\d+\//
  }

  function listFetchFn(overrides: Record<string, { ok: boolean; text: string } | 'throw'>): {
    fetchFn: typeof fetch
    calls: string[]
  } {
    const calls: string[] = []
    const fetchFn = (async (url: string) => {
      calls.push(url)
      const entry = overrides[url]
      if (entry === 'throw') throw new Error('network error')
      if (!entry) throw new Error(`unexpected url in test: ${url}`)
      return { ok: entry.ok, text: async () => entry.text } as Response
    }) as typeof fetch
    return { fetchFn, calls }
  }

  it('collects multiple new articles found on the list page', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db: Database.Database = useDb()
    const { collectListSource } = await import('./collector')

    const { fetchFn } = listFetchFn({
      'https://asakusa.keizai.biz/': {
        ok: true,
        text: '<a href="/headline/1059/">記事1</a><a href="/headline/1058/">記事2</a>'
      },
      'https://asakusa.keizai.biz/headline/1059/': { ok: true, text: '<p>記事1本文</p>' },
      'https://asakusa.keizai.biz/headline/1058/': { ok: true, text: '<p>記事2本文</p>' }
    })

    const result = await collectListSource(db, site, fetchFn)

    expect(result).toEqual({ inserted: 2, skipped: 0, error: 0 })
    const rows = db.prepare('SELECT url, site_name, category, raw_text FROM sources ORDER BY url').all() as any[]
    expect(rows).toHaveLength(2)
    expect(rows[0].url).toBe('https://asakusa.keizai.biz/headline/1058/')
    expect(rows[0].site_name).toBe('asakusa.keizai.biz')
    expect(rows[0].category).toBe('asakusa-area')
    expect(rows[0].raw_text).toContain('記事2本文')
  })

  it('skips article urls already in the db without calling fetchFn for them', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db: Database.Database = useDb()
    const { collectListSource } = await import('./collector')

    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://asakusa.keizai.biz/headline/1059/', site.siteName, site.category, '既存記事')

    const { fetchFn, calls } = listFetchFn({
      'https://asakusa.keizai.biz/': {
        ok: true,
        text: '<a href="/headline/1059/">記事1</a><a href="/headline/1058/">記事2</a>'
      },
      'https://asakusa.keizai.biz/headline/1058/': { ok: true, text: '<p>記事2本文</p>' }
    })

    const result = await collectListSource(db, site, fetchFn)

    expect(result).toEqual({ inserted: 1, skipped: 1, error: 0 })
    expect(calls).not.toContain('https://asakusa.keizai.biz/headline/1059/')
  })

  it('counts a failed article fetch as error and continues with other articles', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db: Database.Database = useDb()
    const { collectListSource } = await import('./collector')

    const { fetchFn } = listFetchFn({
      'https://asakusa.keizai.biz/': {
        ok: true,
        text: '<a href="/headline/1059/">記事1</a><a href="/headline/1058/">記事2</a>'
      },
      'https://asakusa.keizai.biz/headline/1059/': 'throw',
      'https://asakusa.keizai.biz/headline/1058/': { ok: true, text: '<p>記事2本文</p>' }
    })

    const result = await collectListSource(db, site, fetchFn)

    expect(result).toEqual({ inserted: 1, skipped: 0, error: 1 })
  })

  it('returns an all-error tally when the list page itself fails to fetch', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db: Database.Database = useDb()
    const { collectListSource } = await import('./collector')

    const { fetchFn } = listFetchFn({
      'https://asakusa.keizai.biz/': { ok: false, text: '' }
    })

    const result = await collectListSource(db, site, fetchFn)

    expect(result).toEqual({ inserted: 0, skipped: 0, error: 1 })
  })
})

describe('collectAllSources', () => {
  it('continues past a failing site and tallies results', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db: Database.Database = useDb()
    const { collectAllSources } = await import('./collector')
    const sites: SourceSite[] = [
      { type: 'page', url: 'https://a.example/', siteName: 'a', category: 'asakusa-area' },
      { type: 'page', url: 'https://b.example/', siteName: 'b', category: 'asakusa-area' }
    ]
    const fetchFn = (async (url: string) => {
      if (url === 'https://a.example/') {
        return { ok: true, text: async () => '<p>a</p>' } as Response
      }
      throw new Error('network error')
    }) as typeof fetch

    const result = await collectAllSources(db, sites, fetchFn)
    expect(result).toEqual({ inserted: 1, skipped: 0, error: 1 })
  })

  it('aggregates counts across mixed page and list type sites', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db: Database.Database = useDb()
    const { collectAllSources } = await import('./collector')
    const sites: SourceSite[] = [
      { type: 'page', url: 'https://a.example/', siteName: 'a', category: 'asakusa-area' },
      {
        type: 'list',
        url: 'https://list.example/',
        siteName: 'list.example',
        category: 'asakusa-area',
        articleLinkPattern: /\/headline\/\d+\//
      }
    ]
    const responses: Record<string, { ok: boolean; text: string }> = {
      'https://a.example/': { ok: true, text: '<p>a</p>' },
      'https://list.example/': {
        ok: true,
        text: '<a href="/headline/1/">記事1</a><a href="/headline/2/">記事2</a>'
      },
      'https://list.example/headline/1/': { ok: true, text: '<p>記事1</p>' },
      'https://list.example/headline/2/': { ok: true, text: '<p>記事2</p>' }
    }
    const fetchFn = (async (url: string) => {
      const res = responses[url]
      return { ok: res.ok, text: async () => res.text } as Response
    }) as typeof fetch

    const result = await collectAllSources(db, sites, fetchFn)

    expect(result).toEqual({ inserted: 3, skipped: 0, error: 0 })
  })
})
