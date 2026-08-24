import { describe, it, expect, vi } from 'vitest'
import type { MessageClient, BatchResultEntry } from './generator'

const unusedBatches: MessageClient['messages']['batches'] = {
  create: async () => {
    throw new Error('batches.create not used in this test')
  },
  retrieve: async () => {
    throw new Error('batches.retrieve not used in this test')
  },
  results: async () => {
    throw new Error('batches.results not used in this test')
  }
}

function succeeded(text: string): BatchResultEntry {
  return { type: 'succeeded', message: { content: [{ type: 'text', text }] } }
}

function errored(): BatchResultEntry {
  return { type: 'errored', error: { type: 'api_error', message: 'API error' } }
}

function makeBatchClient(
  handler: (params: { messages: { role: 'user'; content: string }[] }) => BatchResultEntry
): MessageClient {
  const batches = new Map<string, Map<string, BatchResultEntry>>()
  let counter = 0
  return {
    messages: {
      create: async () => {
        throw new Error('messages.create not used in this test')
      },
      batches: {
        create: async ({ requests }) => {
          const id = `batch-${++counter}`
          batches.set(id, new Map(requests.map((r) => [r.custom_id, handler(r.params)])))
          return { id, processing_status: 'ended' }
        },
        retrieve: async () => ({ processing_status: 'ended' }),
        results: async (id: string) => {
          const map = batches.get(id) ?? new Map()
          return (async function* () {
            for (const [custom_id, result] of map) {
              yield { custom_id, result }
            }
          })()
        }
      }
    }
  }
}

describe('buildGenerationPrompt', () => {
  it('includes each source text, site name, and url', async () => {
    const { buildGenerationPrompt } = await import('./generator')
    const prompt = buildGenerationPrompt([
      { siteName: 'e-asakusa.jp', url: 'https://e-asakusa.jp/news/1', rawText: '元の本文A' },
      { siteName: 'senso-ji.jp', url: 'https://www.senso-ji.jp/news/2', rawText: '元の本文B' }
    ])
    expect(prompt).toContain('元の本文A')
    expect(prompt).toContain('元の本文B')
    expect(prompt).toContain('e-asakusa.jp')
    expect(prompt).toContain('senso-ji.jp')
    expect(prompt).toContain('https://e-asakusa.jp/news/1')
    expect(prompt).toContain('https://www.senso-ji.jp/news/2')
  })

  it('instructs a concise news-style structure with a soft, friendly tone', async () => {
    const { buildGenerationPrompt } = await import('./generator')
    const prompt = buildGenerationPrompt([
      { siteName: 'a', url: 'https://a.example/', rawText: 'text' }
    ])
    expect(prompt).toContain('ニュース記事')
    expect(prompt).toContain('ですます調')
    expect(prompt).toContain('簡潔')
  })

  it('instructs extracting the source publish date and stating it in the body', async () => {
    const { buildGenerationPrompt } = await import('./generator')
    const prompt = buildGenerationPrompt([
      { siteName: 'a', url: 'https://a.example/', rawText: 'text' }
    ])
    expect(prompt).toContain('sourceDate')
    expect(prompt).toContain('本文中に')
  })
})

describe('parseGeneratedArticle', () => {
  it('parses a valid JSON response', async () => {
    const { parseGeneratedArticle } = await import('./generator')
    const result = parseGeneratedArticle('{"title": "タイトル", "body": "本文"}')
    expect(result).toEqual({ title: 'タイトル', body: '本文', sourceDate: null })
  })

  it('parses the sourceDate field when present', async () => {
    const { parseGeneratedArticle } = await import('./generator')
    const result = parseGeneratedArticle('{"title": "タイトル", "body": "本文", "sourceDate": "2026-08-24"}')
    expect(result).toEqual({ title: 'タイトル', body: '本文', sourceDate: '2026-08-24' })
  })

  it('throws when the shape is invalid', async () => {
    const { parseGeneratedArticle } = await import('./generator')
    expect(() => parseGeneratedArticle('{"title": "タイトルのみ"}')).toThrow()
  })
})

function fakeClient(responseText: string): MessageClient {
  return {
    messages: {
      create: async () => ({ content: [{ type: 'text', text: responseText }] }),
      batches: unusedBatches
    }
  }
}

describe('generateArticleFromSources', () => {
  it('returns the parsed article from the model response', async () => {
    const { generateArticleFromSources } = await import('./generator')
    const client = fakeClient('{"title": "生成タイトル", "body": "生成本文"}')
    const article = await generateArticleFromSources(client, [
      { siteName: 'e-asakusa.jp', url: 'https://e-asakusa.jp/', rawText: '元テキスト' }
    ])
    expect(article).toEqual({ title: '生成タイトル', body: '生成本文', sourceDate: null })
  })

  it('requests enough max_tokens to leave room for extended thinking without truncating output', async () => {
    const { generateArticleFromSources } = await import('./generator')
    const create = vi.fn(async () => ({ content: [{ type: 'text', text: '{"title": "t", "body": "b"}' }] }))
    await generateArticleFromSources({ messages: { create, batches: unusedBatches } }, [
      { siteName: 'e-asakusa.jp', url: 'https://e-asakusa.jp/', rawText: '元テキスト' }
    ])
    expect(create.mock.calls[0][0].max_tokens).toBeGreaterThanOrEqual(16000)
  })
})

const TRANSLATION_JSON = JSON.stringify({
  en: { title: 'EN title', body: 'EN body' },
  ko: { title: 'KO title', body: 'KO body' },
  'zh-Hant': { title: 'ZHT title', body: 'ZHT body' },
  'zh-Hans': { title: 'ZHS title', body: 'ZHS body' },
  pt: { title: 'PT title', body: 'PT body' }
})

describe('buildTranslationPrompt', () => {
  it('includes the original title and body, and instructs translation into 5 languages', async () => {
    const { buildTranslationPrompt } = await import('./generator')
    const prompt = buildTranslationPrompt({ title: '元タイトル', body: '元本文' })
    expect(prompt).toContain('元タイトル')
    expect(prompt).toContain('元本文')
    expect(prompt).toContain('タイトル：')
    expect(prompt).toContain('en')
    expect(prompt).toContain('ko')
    expect(prompt).toContain('zh-Hant')
    expect(prompt).toContain('zh-Hans')
    expect(prompt).toContain('pt')
  })
})

describe('parseTranslatedArticle', () => {
  it('parses a valid JSON response with all 5 locales', async () => {
    const { parseTranslatedArticle } = await import('./generator')
    const result = parseTranslatedArticle(TRANSLATION_JSON)
    expect(result).toEqual({
      en: { title: 'EN title', body: 'EN body' },
      ko: { title: 'KO title', body: 'KO body' },
      'zh-Hant': { title: 'ZHT title', body: 'ZHT body' },
      'zh-Hans': { title: 'ZHS title', body: 'ZHS body' },
      pt: { title: 'PT title', body: 'PT body' }
    })
  })

  it('throws when a locale is missing', async () => {
    const { parseTranslatedArticle } = await import('./generator')
    expect(() =>
      parseTranslatedArticle(JSON.stringify({ en: { title: 't', body: 'b' } }))
    ).toThrow()
  })

  it('throws when a locale entry has the wrong shape', async () => {
    const { parseTranslatedArticle } = await import('./generator')
    expect(() =>
      parseTranslatedArticle(
        JSON.stringify({
          en: { title: 't' },
          ko: { title: 't', body: 'b' },
          'zh-Hant': { title: 't', body: 'b' },
          'zh-Hans': { title: 't', body: 'b' },
          pt: { title: 't', body: 'b' }
        })
      )
    ).toThrow()
  })
})

describe('translateArticle', () => {
  it('returns the parsed translations from the model response', async () => {
    const { translateArticle } = await import('./generator')
    const client = fakeClient(TRANSLATION_JSON)
    const translations = await translateArticle(client, { title: '元タイトル', body: '元本文' })
    expect(translations.en).toEqual({ title: 'EN title', body: 'EN body' })
    expect(translations['zh-Hans']).toEqual({ title: 'ZHS title', body: 'ZHS body' })
  })

  it('requests enough max_tokens to leave room for extended thinking without truncating 4-locale output', async () => {
    const { translateArticle } = await import('./generator')
    const create = vi.fn(async () => ({ content: [{ type: 'text', text: TRANSLATION_JSON }] }))
    await translateArticle({ messages: { create, batches: unusedBatches } }, { title: '元タイトル', body: '元本文' })
    expect(create.mock.calls[0][0].max_tokens).toBeGreaterThanOrEqual(16000)
  })
})

function fakeGenerateAndTranslateClient(): MessageClient {
  return makeBatchClient((params) => {
    const content = params.messages[0].content
    if (content.includes('タイトル：')) {
      return succeeded(TRANSLATION_JSON)
    }
    return succeeded('{"title": "生成タイトル", "body": "生成本文"}')
  })
}

describe('generateDraftsForUnprocessedSources', () => {
  it('generates a separate article per source even within the same category', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://a.example/', 'a', 'asakusa-area', '本文A')
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://b.example/', 'b', 'asakusa-area', '本文B')

    const { generateDraftsForUnprocessedSources } = await import('./generator')
    const client = fakeGenerateAndTranslateClient()
    const result = await generateDraftsForUnprocessedSources(db, client)

    expect(result).toEqual({ generated: 2, failed: 0, skippedOld: 0 })

    const articles = db.prepare(`SELECT * FROM articles`).all() as any[]
    expect(articles).toHaveLength(2)
    expect(articles.every((a) => a.category === 'asakusa-area')).toBe(true)

    for (const article of articles) {
      const links = db
        .prepare(`SELECT source_id FROM article_sources WHERE article_id = ?`)
        .all(article.id) as { source_id: number }[]
      expect(links).toHaveLength(1)

      const translations = db
        .prepare(`SELECT locale FROM article_translations WHERE article_id = ?`)
        .all(article.id) as { locale: string }[]
      expect(translations.map((t) => t.locale).sort()).toEqual(['en', 'ja', 'ko', 'pt', 'zh-Hans', 'zh-Hant'])
    }

    const processedCount = (
      db.prepare(`SELECT COUNT(*) as c FROM sources WHERE processed_at IS NOT NULL`).get() as { c: number }
    ).c
    expect(processedCount).toBe(2)
  })

  it('skips a failing source without affecting others', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://a.example/', 'a', 'asakusa-area', '本文A')
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://c.example/', 'c', 'asakusa-culture', '本文C')

    const client = makeBatchClient((params) => {
      const content = params.messages[0].content
      if (content.includes('本文A')) return errored()
      if (content.includes('タイトル：')) return succeeded(TRANSLATION_JSON)
      return succeeded('{"title": "生成タイトル", "body": "生成本文"}')
    })
    const { generateDraftsForUnprocessedSources } = await import('./generator')
    const result = await generateDraftsForUnprocessedSources(db, client)

    expect(result).toEqual({ generated: 1, failed: 1, skippedOld: 0 })
    const failingSource = db.prepare(`SELECT processed_at FROM sources WHERE url = ?`).get('https://a.example/') as any
    expect(failingSource.processed_at).toBeNull()
    const succeedingSource = db.prepare(`SELECT processed_at FROM sources WHERE url = ?`).get('https://c.example/') as any
    expect(succeedingSource.processed_at).not.toBeNull()
  })

  it('excludes weather and traffic sources from generation', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://weather.example/', 'w', 'weather', '天気本文')
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://traffic.example/', 't', 'traffic', '交通本文')

    const batchCreate = vi.fn(async () => ({ id: 'batch-x', processing_status: 'ended' }))
    const client: MessageClient = {
      messages: {
        create: async () => {
          throw new Error('messages.create not used in this test')
        },
        batches: {
          create: batchCreate,
          retrieve: async () => ({ processing_status: 'ended' }),
          results: async () => (async function* () {})()
        }
      }
    }
    const { generateDraftsForUnprocessedSources } = await import('./generator')
    const result = await generateDraftsForUnprocessedSources(db, client)

    expect(result).toEqual({ generated: 0, failed: 0, skippedOld: 0 })
    expect(batchCreate).not.toHaveBeenCalled()
    const articles = db.prepare(`SELECT * FROM articles`).all()
    expect(articles).toHaveLength(0)
    const unprocessed = db
      .prepare(`SELECT COUNT(*) as c FROM sources WHERE processed_at IS NULL`)
      .get() as { c: number }
    expect(unprocessed.c).toBe(2)
  })

  it('logs the source url and error when a source fails to generate', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://a.example/', 'a', 'asakusa-area', '本文A')

    const client = makeBatchClient(() => errored())
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { generateDraftsForUnprocessedSources } = await import('./generator')
    await generateDraftsForUnprocessedSources(db, client)

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://a.example/'),
      expect.any(Error)
    )
    errorSpy.mockRestore()
  })

  it('does not insert an article or its translations when translation fails', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://a.example/', 'a', 'asakusa-area', '本文A')

    const client = makeBatchClient((params) => {
      const content = params.messages[0].content
      if (content.includes('タイトル：')) return errored()
      return succeeded('{"title": "生成タイトル", "body": "生成本文"}')
    })
    const { generateDraftsForUnprocessedSources } = await import('./generator')
    const result = await generateDraftsForUnprocessedSources(db, client)

    expect(result).toEqual({ generated: 0, failed: 1, skippedOld: 0 })
    const articles = db.prepare(`SELECT * FROM articles`).all()
    expect(articles).toHaveLength(0)
    const translations = db.prepare(`SELECT * FROM article_translations`).all()
    expect(translations).toHaveLength(0)
    const source = db.prepare(`SELECT processed_at FROM sources WHERE url = ?`).get('https://a.example/') as any
    expect(source.processed_at).toBeNull()
  })

  it('skips a source whose extracted date is before the 2026-07-03 cutoff, without creating an article', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://old.example/', 'old', 'asakusa-area', '本文Old')

    const client = makeBatchClient(() =>
      succeeded('{"title": "旧タイトル", "body": "旧本文", "sourceDate": "2026-06-30"}')
    )
    const { generateDraftsForUnprocessedSources } = await import('./generator')
    const result = await generateDraftsForUnprocessedSources(db, client)

    expect(result).toEqual({ generated: 0, failed: 0, skippedOld: 1 })
    const articles = db.prepare(`SELECT * FROM articles`).all()
    expect(articles).toHaveLength(0)
    const source = db
      .prepare(`SELECT processed_at, resource_created_at FROM sources WHERE url = ?`)
      .get('https://old.example/') as any
    expect(source.processed_at).not.toBeNull()
    expect(source.resource_created_at).toBe('2026-06-30')
  })

  it('generates and stores the extracted date when it is on or after the cutoff', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://new.example/', 'new', 'asakusa-area', '本文New')

    const client = makeBatchClient((params) => {
      const content = params.messages[0].content
      if (content.includes('タイトル：')) return succeeded(TRANSLATION_JSON)
      return succeeded('{"title": "新タイトル", "body": "新本文", "sourceDate": "2026-07-03"}')
    })
    const { generateDraftsForUnprocessedSources } = await import('./generator')
    const result = await generateDraftsForUnprocessedSources(db, client)

    expect(result).toEqual({ generated: 1, failed: 0, skippedOld: 0 })
    const source = db
      .prepare(`SELECT resource_created_at FROM sources WHERE url = ?`)
      .get('https://new.example/') as any
    expect(source.resource_created_at).toBe('2026-07-03')
  })

  it('polls the batch status until it ends before reading results', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://slow.example/', 'slow', 'asakusa-area', '本文Slow')

    const results = new Map([
      ['gen-1', succeeded('{"title": "遅延タイトル", "body": "遅延本文"}')],
      ['trans-1', succeeded(TRANSLATION_JSON)]
    ])
    let retrieveCalls = 0
    const client: MessageClient = {
      messages: {
        create: async () => {
          throw new Error('messages.create not used in this test')
        },
        batches: {
          create: async () => ({ id: 'batch-slow', processing_status: 'in_progress' }),
          retrieve: async () => {
            retrieveCalls++
            return { processing_status: retrieveCalls >= 2 ? 'ended' : 'in_progress' }
          },
          results: async () =>
            (async function* () {
              for (const [custom_id, result] of results) {
                yield { custom_id, result }
              }
            })()
        }
      }
    }
    const { generateDraftsForUnprocessedSources } = await import('./generator')
    const result = await generateDraftsForUnprocessedSources(db, client, { pollIntervalMs: 1 })

    expect(result).toEqual({ generated: 1, failed: 0, skippedOld: 0 })
    expect(retrieveCalls).toBeGreaterThanOrEqual(2)
  })

  it('treats every source as failed and logs a timeout when the batch never ends in time', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://stuck.example/', 'stuck', 'asakusa-area', '本文Stuck')

    const client: MessageClient = {
      messages: {
        create: async () => {
          throw new Error('messages.create not used in this test')
        },
        batches: {
          create: async () => ({ id: 'batch-stuck', processing_status: 'in_progress' }),
          retrieve: async () => ({ processing_status: 'in_progress' }),
          results: async () => (async function* () {})()
        }
      }
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { generateDraftsForUnprocessedSources } = await import('./generator')
    const result = await generateDraftsForUnprocessedSources(db, client, {
      pollIntervalMs: 1,
      maxWaitMs: 1
    })

    expect(result).toEqual({ generated: 0, failed: 1, skippedOld: 0 })
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('タイムアウト'))
    errorSpy.mockRestore()
  })
})
