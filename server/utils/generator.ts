import type Database from 'better-sqlite3'

export interface PromptSource {
  siteName: string
  url: string
  rawText: string
}

export interface ArticleText {
  title: string
  body: string
}

export interface GeneratedArticle extends ArticleText {
  sourceDate: string | null
}

const MIN_SOURCE_DATE = '2026-07-03'
const MODEL = 'claude-sonnet-5'
const DEFAULT_POLL_INTERVAL_MS = 10_000
const DEFAULT_MAX_WAIT_MS = 20 * 60 * 1000

export type TranslatedLocale = 'en' | 'ko' | 'zh-Hant' | 'zh-Hans' | 'pt'

const TRANSLATED_LOCALES: TranslatedLocale[] = ['en', 'ko', 'zh-Hant', 'zh-Hans', 'pt']

interface BatchRequestParams {
  model: string
  max_tokens: number
  messages: { role: 'user'; content: string }[]
}

export interface BatchResultEntry {
  type: 'succeeded' | 'errored' | 'canceled' | 'expired'
  message?: { content: Array<{ type: string; text?: string }> }
  error?: unknown
}

export interface MessageClient {
  messages: {
    create(params: BatchRequestParams): Promise<{ content: Array<{ type: string; text?: string }> }>
    batches: {
      create(params: {
        requests: Array<{ custom_id: string; params: BatchRequestParams }>
      }): Promise<{ id: string; processing_status: string }>
      retrieve(id: string): Promise<{ processing_status: string }>
      results(id: string): Promise<AsyncIterable<{ custom_id: string; result: BatchResultEntry }>>
    }
  }
}

export interface BatchPollOptions {
  pollIntervalMs?: number
  maxWaitMs?: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function runBatch(
  client: MessageClient,
  requests: Array<{ custom_id: string; params: BatchRequestParams }>,
  options: BatchPollOptions
): Promise<Map<string, BatchResultEntry>> {
  if (requests.length === 0) return new Map()

  const batch = await client.messages.batches.create({ requests })
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS
  const deadline = Date.now() + maxWaitMs

  let status = batch.processing_status
  while (status !== 'ended') {
    if (Date.now() >= deadline) {
      console.error(`バッチ処理がタイムアウトしました (batch: ${batch.id})`)
      return new Map()
    }
    await sleep(pollIntervalMs)
    const polled = await client.messages.batches.retrieve(batch.id)
    status = polled.processing_status
  }

  const results = new Map<string, BatchResultEntry>()
  for await (const result of await client.messages.batches.results(batch.id)) {
    results.set(result.custom_id, result.result)
  }
  return results
}

function errorForBatchResult(result: BatchResultEntry | undefined): Error {
  if (!result) return new Error('batch result missing')
  if (result.type === 'succeeded') return new Error('missing message content in batch result')
  return new Error(`batch request ${result.type}: ${JSON.stringify(result.error ?? {})}`)
}

function textFromBatchResult(result: BatchResultEntry): string {
  const textBlock = result.message?.content.find((b) => b.type === 'text')
  if (!textBlock?.text) throw new Error('No text content in response')
  return textBlock.text
}

export function buildGenerationPrompt(sources: PromptSource[]): string {
  const sourcesText = sources
    .map((source) => `【${source.siteName}】（${source.url}）\n${source.rawText}`)
    .join('\n\n---\n\n')

  return `あなたは浅草エリアの地域情報サイト「ASAKUSA TODAY」で、地元の人が読んで親しみやすいレポートを書くライターです。
以下は、ある情報源から集めた本文です。

この内容をもとに、日本語のレポート記事を1本作成してください。
- 地域ブログ風の長い前置きや世間話は避け、要点を絞ったニュース記事のような簡潔な構成にすること。文体はですます調のやわらかい書き方を維持すること。
- 本文は300字程度を目安に、簡潔にまとめること。
- 要約・リライトであること。元の文章の丸写しは絶対にしないこと。
- 事実を捏造しないこと。元の文章に書かれていない情報を追加しないこと。
- 絵文字は使わないこと。
- タイトルは記事の内容を端的に表す一文にすること。
- 情報源の本文から、そのお知らせ・記事が公開または更新された日付を読み取れる場合は、本文中に「〇年〇月〇日発表」のように明記すること。日付が読み取れない場合は、無理に日付へ言及しないこと。
- 情報源の本文から読み取れた公開日または更新日を、YYYY-MM-DD形式で "sourceDate" に設定すること。読み取れない場合は "sourceDate" を null にすること。

出力は以下のJSON形式のみとし、他の文章は含めないこと：
{"title": "...", "body": "...", "sourceDate": "YYYY-MM-DD" または null}

---
${sourcesText}
---`
}

export function parseGeneratedArticle(responseText: string): GeneratedArticle {
  const parsed = JSON.parse(responseText)
  if (typeof parsed.title !== 'string' || typeof parsed.body !== 'string') {
    throw new Error('Invalid generated article shape')
  }
  return {
    title: parsed.title,
    body: parsed.body,
    sourceDate: typeof parsed.sourceDate === 'string' ? parsed.sourceDate : null
  }
}

export async function generateArticleFromSources(
  client: MessageClient,
  sources: PromptSource[]
): Promise<GeneratedArticle> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    messages: [{ role: 'user', content: buildGenerationPrompt(sources) }]
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock?.text) throw new Error('No text content in response')
  return parseGeneratedArticle(textBlock.text)
}

export function buildTranslationPrompt(article: ArticleText): string {
  return `以下は日本語で書かれた地域情報サイト「ASAKUSA TODAY」の記事です。
この内容を、英語（en）・韓国語（ko）・繁体字中国語（zh-Hant）・簡体字中国語（zh-Hans）・ポルトガル語（pt）の5言語に翻訳してください。

- 元記事のトーン（地域ブログ風の親しみやすさ）を保つこと。
- 事実を追加・削除しないこと。原文に忠実に翻訳すること。
- 意訳しすぎず、原文の意味を正確に伝えること。

出力は以下のJSON形式のみとし、他の文章は含めないこと：
{"en": {"title": "...", "body": "..."}, "ko": {"title": "...", "body": "..."}, "zh-Hant": {"title": "...", "body": "..."}, "zh-Hans": {"title": "...", "body": "..."}, "pt": {"title": "...", "body": "..."}}

---
タイトル：${article.title}
本文：
${article.body}
---`
}

export function parseTranslatedArticle(responseText: string): Record<TranslatedLocale, ArticleText> {
  const parsed = JSON.parse(responseText)
  for (const locale of TRANSLATED_LOCALES) {
    const entry = parsed[locale]
    if (!entry || typeof entry.title !== 'string' || typeof entry.body !== 'string') {
      throw new Error(`Invalid translation shape for locale: ${locale}`)
    }
  }
  return {
    en: { title: parsed.en.title, body: parsed.en.body },
    ko: { title: parsed.ko.title, body: parsed.ko.body },
    'zh-Hant': { title: parsed['zh-Hant'].title, body: parsed['zh-Hant'].body },
    'zh-Hans': { title: parsed['zh-Hans'].title, body: parsed['zh-Hans'].body },
    pt: { title: parsed.pt.title, body: parsed.pt.body }
  }
}

export async function translateArticle(
  client: MessageClient,
  article: ArticleText
): Promise<Record<TranslatedLocale, ArticleText>> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    messages: [{ role: 'user', content: buildTranslationPrompt(article) }]
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock?.text) throw new Error('No text content in response')
  return parseTranslatedArticle(textBlock.text)
}

interface UnprocessedSource {
  id: number
  url: string
  site_name: string
  category: string
  raw_text: string
}

export async function generateDraftsForUnprocessedSources(
  db: Database.Database,
  client: MessageClient,
  options: BatchPollOptions = {}
): Promise<{ generated: number; failed: number; skippedOld: number }> {
  const sources = db
    .prepare(
      `SELECT id, url, site_name, category, raw_text FROM sources WHERE processed_at IS NULL AND category NOT IN ('weather', 'traffic')`
    )
    .all() as UnprocessedSource[]

  let generated = 0
  let failed = 0
  let skippedOld = 0

  if (sources.length === 0) return { generated, failed, skippedOld }

  const insertArticle = db.prepare(
    `INSERT INTO articles (status, category, created_at) VALUES ('draft', ?, datetime('now'))`
  )
  const insertTranslation = db.prepare(
    `INSERT INTO article_translations (article_id, locale, title, body) VALUES (?, ?, ?, ?)`
  )
  const insertArticleSource = db.prepare(
    `INSERT INTO article_sources (article_id, source_id) VALUES (?, ?)`
  )
  const markProcessed = db.prepare(
    `UPDATE sources SET processed_at = datetime('now'), resource_created_at = ? WHERE id = ?`
  )

  const genResults = await runBatch(
    client,
    sources.map((source) => ({
      custom_id: `gen-${source.id}`,
      params: {
        model: MODEL,
        max_tokens: 16000,
        messages: [
          {
            role: 'user' as const,
            content: buildGenerationPrompt([
              { siteName: source.site_name, url: source.url, rawText: source.raw_text }
            ])
          }
        ]
      }
    })),
    options
  )

  const pendingTranslation: Array<{ source: UnprocessedSource; article: GeneratedArticle }> = []

  for (const source of sources) {
    const result = genResults.get(`gen-${source.id}`)
    if (!result || result.type !== 'succeeded') {
      console.error(`記事生成に失敗しました (source: ${source.url}):`, errorForBatchResult(result))
      failed++
      continue
    }
    try {
      const article = parseGeneratedArticle(textFromBatchResult(result))

      if (article.sourceDate && article.sourceDate < MIN_SOURCE_DATE) {
        markProcessed.run(article.sourceDate, source.id)
        skippedOld++
        continue
      }

      pendingTranslation.push({ source, article })
    } catch (err) {
      console.error(`記事生成に失敗しました (source: ${source.url}):`, err)
      failed++
    }
  }

  if (pendingTranslation.length === 0) {
    return { generated, failed, skippedOld }
  }

  const transResults = await runBatch(
    client,
    pendingTranslation.map(({ source, article }) => ({
      custom_id: `trans-${source.id}`,
      params: {
        model: MODEL,
        max_tokens: 16000,
        messages: [{ role: 'user' as const, content: buildTranslationPrompt(article) }]
      }
    })),
    options
  )

  for (const { source, article } of pendingTranslation) {
    const result = transResults.get(`trans-${source.id}`)
    if (!result || result.type !== 'succeeded') {
      console.error(`記事生成に失敗しました (source: ${source.url}):`, errorForBatchResult(result))
      failed++
      continue
    }
    try {
      const translations = parseTranslatedArticle(textFromBatchResult(result))

      const insertResult = insertArticle.run(source.category)
      const articleId = insertResult.lastInsertRowid as number
      insertTranslation.run(articleId, 'ja', article.title, article.body)
      for (const locale of TRANSLATED_LOCALES) {
        insertTranslation.run(articleId, locale, translations[locale].title, translations[locale].body)
      }
      insertArticleSource.run(articleId, source.id)
      markProcessed.run(article.sourceDate, source.id)
      generated++
    } catch (err) {
      console.error(`記事生成に失敗しました (source: ${source.url}):`, err)
      failed++
    }
  }

  return { generated, failed, skippedOld }
}
