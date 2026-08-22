# カテゴリ単位の記事生成＋トーン変更 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ソースを`category`ごとにグループ化して1記事にまとめて生成するようにし、生成文体を地域ブログ風の親しみやすいトーンに変える。

**Architecture:** `generator.ts`の`generateDraftsForUnprocessedSources`が`sources.category`でグループ化し、グループごとに1回のClaude API呼び出しで1記事を生成する。記事とソースは新設の`article_sources`中間テーブルで多対多に結びつけ、`articles.source_url`/`source_name`は廃止して`articles.category`に置き換える。表示側（管理画面の下書き一覧・記事詳細ページ）は複数出典リンクの一覧表示に対応する。

**Tech Stack:** Nuxt 4 / Vue 3, better-sqlite3, Vitest, @anthropic-ai/sdk, @nuxt/test-utils (e2e)

## Global Constraints

- TDD必須：全ての新規/変更ロジックは失敗するテストを先に書き、失敗を確認してから実装する
- `docs/superpowers/specs/2026-08-15-category-generation-design.md`の設計を厳守する
- 開発用DBはデータを持たないため、スキーマ変更はマイグレーションでなく`SCHEMA`定義の書き換えでよい（ただしローカルの`data/app.sqlite3`が既にあれば削除してから`npm run dev`/テストを実行する必要がある — 各タスクでは`:memory:`または一時ファイルDBを使うテストのみを扱うため、通常のテスト実行には影響しない）
- 生成トーンは「地域ブログ風」：ですます調は維持、硬いニュース文体を避ける、絵文字は使わない、事実の捏造・誇張はしない、複数出典を箇条書きでなく1本の文章にまとめる
- git操作は行わない。各タスク末尾の「コミット」ステップはユーザー（人間）が行うため、エージェントは変更内容を報告するのみでよい

---

## Task 1: DBスキーマ — `articles.category` と `article_sources` テーブル

**Files:**
- Modify: `server/utils/db.ts`
- Test: `server/utils/db.test.ts`

**Interfaces:**
- Produces: `articles`テーブルは`category TEXT NOT NULL`列を持ち、`source_url`/`source_name`列は持たない。新設`article_sources`テーブルは`article_id INTEGER NOT NULL`, `source_id INTEGER NOT NULL`, `PRIMARY KEY (article_id, source_id)`を持つ。

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/db.test.ts`の`describe('useDb', ...)`ブロック内、既存の`'creates users, nonces, sessions, sources, articles tables'`テストの直後に以下を追加する:

```ts
  it('creates an article_sources table', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row: any) => row.name)
    expect(tables).toContain('article_sources')
  })

  it('creates an articles table with a category column', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const columns = db.prepare('PRAGMA table_info(articles)').all() as { name: string }[]
    expect(columns.some((c) => c.name === 'category')).toBe(true)
    expect(columns.some((c) => c.name === 'source_url')).toBe(false)
  })
```

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `npx vitest run server/utils/db.test.ts`
Expected: 新しい2件のテストが FAIL する（`article_sources`テーブルが存在しない／`category`列が存在しない）。既存の3件は引き続き PASS。

- [ ] **Step 3: スキーマを実装する**

`server/utils/db.ts`の`SCHEMA`定数内、`articles`テーブル定義を以下に置き換える:

```ts
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  category TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS article_sources (
  article_id INTEGER NOT NULL REFERENCES articles(id),
  source_id INTEGER NOT NULL REFERENCES sources(id),
  PRIMARY KEY (article_id, source_id)
);
```

（`sources`テーブル定義・`migrate()`関数は変更しない。`sources.category`の移行ロジックは既に存在する。）

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `npx vitest run server/utils/db.test.ts`
Expected: 全5件 PASS

- [ ] **Step 5: コミット**

このステップは人間が行う。変更内容を報告する:
```
server/utils/db.ts, server/utils/db.test.ts
```

---

## Task 2: `buildGenerationPrompt`を複数ソース対応＋地域ブログ風トーンに変更

**Files:**
- Modify: `server/utils/generator.ts`
- Test: `server/utils/generator.test.ts`

**Interfaces:**
- Produces: `export interface PromptSource { siteName: string; url: string; rawText: string }`, `export function buildGenerationPrompt(sources: PromptSource[]): string`

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/generator.test.ts`の`describe('buildGenerationPrompt', ...)`ブロック全体を以下に置き換える:

```ts
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

  it('instructs a friendly, local-blog-style tone instead of a stiff news style', async () => {
    const { buildGenerationPrompt } = await import('./generator')
    const prompt = buildGenerationPrompt([
      { siteName: 'a', url: 'https://a.example/', rawText: 'text' }
    ])
    expect(prompt).toContain('地域ブログ')
  })
})
```

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `npx vitest run server/utils/generator.test.ts`
Expected: この2件が FAIL する（`buildGenerationPrompt`は現状`(rawText, siteName, sourceUrl)`という別シグネチャで、配列を渡すと`.map`できずTypeErrorになるか、内容が一致せず失敗する）。他のテストも、以降のタスクで直すまでは失敗したままでよい（このタスクでは`buildGenerationPrompt`関連のみ確認する）。

- [ ] **Step 3: 実装する**

`server/utils/generator.ts`の`buildGenerationPrompt`関数を以下に置き換える（ファイル冒頭、`export interface GeneratedArticle`の前に`PromptSource`を追加）:

```ts
export interface PromptSource {
  siteName: string
  url: string
  rawText: string
}

export interface GeneratedArticle {
  title: string
  body: string
}
```

そして`buildGenerationPrompt`本体を置き換える:

```ts
export function buildGenerationPrompt(sources: PromptSource[]): string {
  const sourcesText = sources
    .map((source) => `【${source.siteName}】（${source.url}）\n${source.rawText}`)
    .join('\n\n---\n\n')

  return `あなたは浅草エリアの地域情報サイト「ASAKUSA TODAY」で、地元の人が読んで親しみやすいレポートを書くライターです。
以下は、同じカテゴリに属する複数の情報源から集めた本文です。

これらの内容をもとに、日本語のレポート記事を1本作成してください。
- 複数の出典の内容を、自然な1本の文章としてまとめること。出典ごとの箇条書き列挙にはしないこと。
- 硬いニュース記事の文体ではなく、地元の人が親しみを持って読めるような、地域ブログ風の少しくだけた文体にすること。ですます調は維持すること。
- 要約・リライトであること。元の文章の丸写しは絶対にしないこと。
- 事実を捏造しないこと。元の文章に書かれていない情報を追加しないこと。
- 絵文字は使わないこと。
- タイトルは記事の内容を端的に表す一文にすること。

出力は以下のJSON形式のみとし、他の文章は含めないこと：
{"title": "...", "body": "..."}

---
${sourcesText}
---`
}
```

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `npx vitest run server/utils/generator.test.ts`
Expected: `buildGenerationPrompt`の2件は PASS。他のテスト（`generateArticleFromSource`、`generateDraftsForUnprocessedSources`関連）はTask 3・4で直すまで FAIL のままでよい。

- [ ] **Step 5: コミット**

このステップは人間が行う。変更内容を報告する:
```
server/utils/generator.ts, server/utils/generator.test.ts
```

---

## Task 3: `generateArticleFromSources`（複数ソース対応にリネーム）

**Files:**
- Modify: `server/utils/generator.ts`
- Test: `server/utils/generator.test.ts`

**Interfaces:**
- Consumes: `PromptSource`, `buildGenerationPrompt(sources: PromptSource[]): string`（Task 2で定義済み）, `MessageClient`（既存）
- Produces: `export async function generateArticleFromSources(client: MessageClient, sources: PromptSource[]): Promise<GeneratedArticle>`

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/generator.test.ts`の`describe('generateArticleFromSource', ...)`ブロックを削除し、代わりに以下を追加する:

```ts
describe('generateArticleFromSources', () => {
  it('returns the parsed article from the model response', async () => {
    const { generateArticleFromSources } = await import('./generator')
    const client = fakeClient('{"title": "生成タイトル", "body": "生成本文"}')
    const article = await generateArticleFromSources(client, [
      { siteName: 'e-asakusa.jp', url: 'https://e-asakusa.jp/', rawText: '元テキスト' }
    ])
    expect(article).toEqual({ title: '生成タイトル', body: '生成本文' })
  })
})
```

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `npx vitest run server/utils/generator.test.ts`
Expected: `generateArticleFromSources`のテストが FAIL する（`generator.ts`にその名前のエクスポートがまだ存在しない）。

- [ ] **Step 3: 実装する**

`server/utils/generator.ts`の`generateArticleFromSource`関数（現状`rawText, siteName, sourceUrl`を個別引数に取るもの）を削除し、以下に置き換える:

```ts
export async function generateArticleFromSources(
  client: MessageClient,
  sources: PromptSource[]
): Promise<GeneratedArticle> {
  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: buildGenerationPrompt(sources) }]
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock?.text) throw new Error('No text content in response')
  return parseGeneratedArticle(textBlock.text)
}
```

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `npx vitest run server/utils/generator.test.ts`
Expected: `generateArticleFromSources`のテストは PASS。`generateDraftsForUnprocessedSources`関連はTask 4で直すまで FAIL のままでよい。

- [ ] **Step 5: コミット**

このステップは人間が行う。変更内容を報告する:
```
server/utils/generator.ts, server/utils/generator.test.ts
```

---

## Task 4: `generateDraftsForUnprocessedSources`をカテゴリ単位のグループ生成に変更

**Files:**
- Modify: `server/utils/generator.ts`
- Test: `server/utils/generator.test.ts`

**Interfaces:**
- Consumes: `generateArticleFromSources(client, sources: PromptSource[])`（Task 3）, `article_sources`テーブル・`articles.category`列（Task 1）
- Produces: `export async function generateDraftsForUnprocessedSources(db: Database.Database, client: MessageClient): Promise<{ generated: number; failed: number }>`（シグネチャは既存のまま。`generated`/`failed`は「カテゴリグループ単位」のカウントになる）

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/generator.test.ts`の`describe('generateDraftsForUnprocessedSources', ...)`ブロック全体を以下に置き換える:

```ts
describe('generateDraftsForUnprocessedSources', () => {
  it('groups unprocessed sources by category into one article each', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://a.example/', 'a', 'traffic', '本文A')
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://b.example/', 'b', 'traffic', '本文B')
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://c.example/', 'c', 'weather', '本文C')

    const { generateDraftsForUnprocessedSources } = await import('./generator')
    const client = fakeClient('{"title": "生成タイトル", "body": "生成本文"}')
    const result = await generateDraftsForUnprocessedSources(db, client)

    expect(result).toEqual({ generated: 2, failed: 0 })

    const articles = db.prepare(`SELECT * FROM articles ORDER BY category`).all() as any[]
    expect(articles.map((a) => a.category)).toEqual(['traffic', 'weather'])

    const trafficArticle = articles.find((a) => a.category === 'traffic')
    const links = db
      .prepare(`SELECT source_id FROM article_sources WHERE article_id = ?`)
      .all(trafficArticle.id) as { source_id: number }[]
    expect(links).toHaveLength(2)

    const processedCount = (
      db.prepare(`SELECT COUNT(*) as c FROM sources WHERE processed_at IS NOT NULL`).get() as { c: number }
    ).c
    expect(processedCount).toBe(3)
  })

  it('skips a failing category group without affecting other groups', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://a.example/', 'a', 'traffic', '本文A')
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://c.example/', 'c', 'weather', '本文C')

    const client: MessageClient = {
      messages: {
        create: async (params) => {
          if (params.messages[0].content.includes('本文A')) throw new Error('API error')
          return { content: [{ type: 'text', text: '{"title": "生成タイトル", "body": "生成本文"}' }] }
        }
      }
    }
    const { generateDraftsForUnprocessedSources } = await import('./generator')
    const result = await generateDraftsForUnprocessedSources(db, client)

    expect(result).toEqual({ generated: 1, failed: 1 })
    const trafficSource = db.prepare(`SELECT processed_at FROM sources WHERE url = ?`).get('https://a.example/') as any
    expect(trafficSource.processed_at).toBeNull()
    const weatherSource = db.prepare(`SELECT processed_at FROM sources WHERE url = ?`).get('https://c.example/') as any
    expect(weatherSource.processed_at).not.toBeNull()
  })
})
```

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `npx vitest run server/utils/generator.test.ts`
Expected: 上記2件が FAIL する（現状の実装はソース1件ごとに記事を作るため、`generated`が期待値と異なる／`category`列・`article_sources`が未対応）。

- [ ] **Step 3: 実装する**

`server/utils/generator.ts`の`UnprocessedSource`インターフェースと`generateDraftsForUnprocessedSources`関数を以下に置き換える:

```ts
interface UnprocessedSource {
  id: number
  url: string
  site_name: string
  category: string
  raw_text: string
}

export async function generateDraftsForUnprocessedSources(
  db: Database.Database,
  client: MessageClient
): Promise<{ generated: number; failed: number }> {
  const sources = db
    .prepare(`SELECT id, url, site_name, category, raw_text FROM sources WHERE processed_at IS NULL`)
    .all() as UnprocessedSource[]

  const groups = new Map<string, UnprocessedSource[]>()
  for (const source of sources) {
    const group = groups.get(source.category)
    if (group) {
      group.push(source)
    } else {
      groups.set(source.category, [source])
    }
  }

  let generated = 0
  let failed = 0

  const insertArticle = db.prepare(
    `INSERT INTO articles (title, body, status, category, created_at) VALUES (?, ?, 'draft', ?, datetime('now'))`
  )
  const insertArticleSource = db.prepare(
    `INSERT INTO article_sources (article_id, source_id) VALUES (?, ?)`
  )
  const markProcessed = db.prepare(`UPDATE sources SET processed_at = datetime('now') WHERE id = ?`)

  for (const [category, groupSources] of groups) {
    try {
      const promptSources: PromptSource[] = groupSources.map((source) => ({
        siteName: source.site_name,
        url: source.url,
        rawText: source.raw_text
      }))
      const article = await generateArticleFromSources(client, promptSources)
      const insertResult = insertArticle.run(article.title, article.body, category)
      const articleId = insertResult.lastInsertRowid as number
      for (const source of groupSources) {
        insertArticleSource.run(articleId, source.id)
        markProcessed.run(source.id)
      }
      generated++
    } catch {
      failed++
    }
  }

  return { generated, failed }
}
```

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `npx vitest run server/utils/generator.test.ts`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

このステップは人間が行う。変更内容を報告する:
```
server/utils/generator.ts, server/utils/generator.test.ts
```

---

## Task 5: `articles.ts` — 複数出典・カテゴリを含めて返す

**Files:**
- Modify: `server/utils/articles.ts`
- Test: `server/utils/articles.test.ts`

**Interfaces:**
- Consumes: `article_sources`テーブル・`articles.category`列（Task 1）
- Produces: `export interface ArticleSource { url: string; siteName: string }`, `export interface ArticleRow { id: number; title: string; body: string; image_url: string | null; status: string; category: string; published_at: string | null; created_at: string; sources: ArticleSource[] }`, `export interface ArticleColumns` (id, title, body, image_url, status, category, published_at, created_at), `export function attachArticleSources(db: Database.Database, articles: ArticleColumns[]): ArticleRow[]`（Task 6で管理画面APIからも使う）

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/articles.test.ts`の内容全体を以下に置き換える:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'

beforeEach(() => {
  process.env.DATABASE_PATH = ':memory:'
})

function insertArticle(
  db: Database.Database,
  overrides: { title?: string; status?: string; publishedAt?: string | null; category?: string } = {}
): number {
  const result = db
    .prepare(
      `INSERT INTO articles (title, body, status, category, published_at, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(
      overrides.title ?? 'Title',
      'Body',
      overrides.status ?? 'published',
      overrides.category ?? 'asakusa-area',
      overrides.publishedAt ?? '2026-01-01T00:00:00Z'
    )
  return result.lastInsertRowid as number
}

function linkSource(db: Database.Database, articleId: number, url: string, siteName: string): void {
  const sourceResult = db
    .prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at)
       VALUES (?, ?, 'asakusa-area', 'text', datetime('now'))`
    )
    .run(url, siteName)
  db.prepare(`INSERT INTO article_sources (article_id, source_id) VALUES (?, ?)`).run(
    articleId,
    sourceResult.lastInsertRowid
  )
}

describe('listPublishedArticles', () => {
  it('returns only published articles ordered by published_at desc', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    insertArticle(db, { title: 'Old', publishedAt: '2026-01-01T00:00:00Z' })
    insertArticle(db, { title: 'New', publishedAt: '2026-02-01T00:00:00Z' })
    insertArticle(db, { title: 'Draft', status: 'draft', publishedAt: null })

    const { listPublishedArticles } = await import('./articles')
    const result = listPublishedArticles(db, 1)

    expect(result.total).toBe(2)
    expect(result.articles.map((a) => a.title)).toEqual(['New', 'Old'])
  })

  it('paginates results at 10 per page', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    for (let i = 0; i < 15; i++) {
      insertArticle(db, {
        title: `Article ${i}`,
        publishedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`
      })
    }

    const { listPublishedArticles } = await import('./articles')
    const page1 = listPublishedArticles(db, 1)
    const page2 = listPublishedArticles(db, 2)

    expect(page1.articles).toHaveLength(10)
    expect(page2.articles).toHaveLength(5)
    expect(page1.total).toBe(15)
    expect(page1.pageSize).toBe(10)
  })

  it('returns an empty array for a page beyond the last', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    insertArticle(db)

    const { listPublishedArticles } = await import('./articles')
    const result = listPublishedArticles(db, 99)

    expect(result.articles).toEqual([])
  })

  it('clamps page numbers below 1 to page 1', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    insertArticle(db, { title: 'Only' })

    const { listPublishedArticles } = await import('./articles')
    const result = listPublishedArticles(db, 0)

    expect(result.page).toBe(1)
    expect(result.articles).toHaveLength(1)
  })

  it('includes the category and linked sources for each article', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const articleId = insertArticle(db, { title: 'WithSources', category: 'traffic' })
    linkSource(db, articleId, 'https://example.com/a', 'Example A')
    linkSource(db, articleId, 'https://example.com/b', 'Example B')

    const { listPublishedArticles } = await import('./articles')
    const result = listPublishedArticles(db, 1)

    expect(result.articles[0].category).toBe('traffic')
    expect(result.articles[0].sources).toEqual(
      expect.arrayContaining([
        { url: 'https://example.com/a', siteName: 'Example A' },
        { url: 'https://example.com/b', siteName: 'Example B' }
      ])
    )
  })
})

describe('getPublishedArticleById', () => {
  it('returns undefined for a draft article', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const id = insertArticle(db, { status: 'draft' })

    const { getPublishedArticleById } = await import('./articles')
    expect(getPublishedArticleById(db, id)).toBeUndefined()
  })

  it('returns undefined for a nonexistent id', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()

    const { getPublishedArticleById } = await import('./articles')
    expect(getPublishedArticleById(db, 999999)).toBeUndefined()
  })

  it('returns the article with its sources for a published id', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const id = insertArticle(db, { title: 'Findable' })
    linkSource(db, id, 'https://example.com/a', 'Example A')

    const { getPublishedArticleById } = await import('./articles')
    const article = getPublishedArticleById(db, id)
    expect(article?.title).toBe('Findable')
    expect(article?.sources).toEqual([{ url: 'https://example.com/a', siteName: 'Example A' }])
  })
})
```

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `npx vitest run server/utils/articles.test.ts`
Expected: `INSERT INTO articles (... category ...)`が現行の`articles.ts`実装とは無関係なので一旦PASSしうるINSERT自体は成功するが、`sources`プロパティが返らず「includes the category and linked sources」「returns the article with its sources」の2件が FAIL する。（他のテストは`insertArticle`の戻り値変更・列変更に追従済みなので影響なくPASSするはずだが、`articles.ts`側がまだ`source_url`/`source_name`を`SELECT *`しているため、Task 1でその列が削除済みだとSQL自体はエラーにならない点に注意。実際に流して結果を確認すること。）

- [ ] **Step 3: 実装する**

`server/utils/articles.ts`の内容全体を以下に置き換える:

```ts
import type Database from 'better-sqlite3'

export interface ArticleSource {
  url: string
  siteName: string
}

export interface ArticleColumns {
  id: number
  title: string
  body: string
  image_url: string | null
  status: string
  category: string
  published_at: string | null
  created_at: string
}

export interface ArticleRow extends ArticleColumns {
  sources: ArticleSource[]
}

export function attachArticleSources(db: Database.Database, articles: ArticleColumns[]): ArticleRow[] {
  if (articles.length === 0) return []
  const ids = articles.map((a) => a.id)
  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT article_sources.article_id as article_id, sources.url as url, sources.site_name as site_name
       FROM article_sources
       JOIN sources ON sources.id = article_sources.source_id
       WHERE article_sources.article_id IN (${placeholders})`
    )
    .all(...ids) as { article_id: number; url: string; site_name: string }[]

  const sourcesByArticle = new Map<number, ArticleSource[]>()
  for (const row of rows) {
    const list = sourcesByArticle.get(row.article_id) ?? []
    list.push({ url: row.url, siteName: row.site_name })
    sourcesByArticle.set(row.article_id, list)
  }

  return articles.map((a) => ({ ...a, sources: sourcesByArticle.get(a.id) ?? [] }))
}

export interface ArticleListResult {
  articles: ArticleRow[]
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 10

const ARTICLE_COLUMNS_SQL = 'id, title, body, image_url, status, category, published_at, created_at'

export function listPublishedArticles(db: Database.Database, page: number): ArticleListResult {
  const safePage = page < 1 ? 1 : page
  const offset = (safePage - 1) * PAGE_SIZE

  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM articles WHERE status = 'published'`).get() as {
      count: number
    }
  ).count

  const articleColumns = db
    .prepare(
      `SELECT ${ARTICLE_COLUMNS_SQL} FROM articles WHERE status = 'published' ORDER BY published_at DESC LIMIT ? OFFSET ?`
    )
    .all(PAGE_SIZE, offset) as ArticleColumns[]

  return { articles: attachArticleSources(db, articleColumns), total, page: safePage, pageSize: PAGE_SIZE }
}

export function getPublishedArticleById(db: Database.Database, id: number): ArticleRow | undefined {
  const articleColumns = db
    .prepare(`SELECT ${ARTICLE_COLUMNS_SQL} FROM articles WHERE id = ? AND status = 'published'`)
    .get(id) as ArticleColumns | undefined
  if (!articleColumns) return undefined
  return attachArticleSources(db, [articleColumns])[0]
}
```

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `npx vitest run server/utils/articles.test.ts`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

このステップは人間が行う。変更内容を報告する:
```
server/utils/articles.ts, server/utils/articles.test.ts
```

---

## Task 6: 管理画面「下書き一覧」APIが複数出典を返すようにする

**Files:**
- Modify: `server/api/admin/drafts/index.get.ts`
- Modify: `tests/api/admin.test.ts`

**Interfaces:**
- Consumes: `attachArticleSources(db, articles: ArticleColumns[]): ArticleRow[]`（Task 5）

- [ ] **Step 1: 失敗するテストを書く**

`tests/api/admin.test.ts`の`insertDraft`関数を以下に置き換える:

```ts
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
      `INSERT INTO articles (title, body, status, category, created_at)
       VALUES ('下書きタイトル', '下書き本文', 'draft', 'asakusa-area', datetime('now'))`
    )
    .run()
  const articleId = articleResult.lastInsertRowid as number
  db.prepare(`INSERT INTO article_sources (article_id, source_id) VALUES (?, ?)`).run(articleId, source.id)
  return articleId
}
```

そして`'lists drafts for an admin user'`テストのアサーションを以下に置き換える:

```ts
  it('lists drafts for an admin user', async () => {
    const { cookie, address } = await loginAndGetCookie()
    await makeAdmin(address)
    await insertDraft('https://e-asakusa.jp/list-test')

    const drafts: any = await $fetch('/api/admin/drafts', { headers: { cookie } })
    const draft = drafts.find((d: any) => d.sources.some((s: any) => s.url === 'https://e-asakusa.jp/list-test'))
    expect(draft).toBeDefined()
    expect(draft.category).toBe('asakusa-area')
  })
```

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `npx vitest run tests/api/admin.test.ts`
Expected: `'lists drafts for an admin user'`が FAIL する（現在の`/api/admin/drafts`は`sources`配列を返さない）。他のテストはTask 7で直すまで一部失敗のままでよい（`'rejects a draft...'`は`insertDraft`のSQL変更に伴い挙動が変わりうるため、この時点でのFAILは許容する）。

- [ ] **Step 3: 実装する**

`server/api/admin/drafts/index.get.ts`の内容全体を以下に置き換える:

```ts
import { useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/admin'
import { attachArticleSources, type ArticleColumns } from '../../../utils/articles'

export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const articles = db
    .prepare(
      `SELECT id, title, body, image_url, status, category, published_at, created_at
       FROM articles WHERE status = 'draft' ORDER BY created_at DESC`
    )
    .all() as ArticleColumns[]
  return attachArticleSources(db, articles)
})
```

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `npx vitest run tests/api/admin.test.ts`
Expected: `'rejects non-admin users with 403'`と`'lists drafts for an admin user'`は PASS。`'publishes a draft'`と`'rejects a draft...'`はTask 7で直すまで FAIL のままでよい。

- [ ] **Step 5: コミット**

このステップは人間が行う。変更内容を報告する:
```
server/api/admin/drafts/index.get.ts, tests/api/admin.test.ts
```

---

## Task 7: 却下（reject）APIを複数ソース対応にする

**Files:**
- Modify: `server/api/admin/drafts/[id]/reject.post.ts`
- Modify: `tests/api/admin.test.ts`

**Interfaces:**
- Consumes: `article_sources`テーブル（Task 1）

- [ ] **Step 1: 失敗するテストを書く**

`tests/api/admin.test.ts`の`'publishes a draft'`テストは変更不要（`insertDraft`のTask 6での変更により既に新スキーマに追従済み）。`'rejects a draft and resets its source for reprocessing'`テストも変更不要（`insertDraft`のTask 6変更で新スキーマに追従済みのため、このテスト自体はコード変更なしで良い）。

まずテストを実行して、Task 6時点でどちらが失敗しているかを確認する。

- [ ] **Step 2: テストを実行し、失敗を確認する**

Run: `npx vitest run tests/api/admin.test.ts`
Expected: `'rejects a draft and resets its source for reprocessing'`が FAIL する（現在の`reject.post.ts`は`SELECT * FROM articles ...`で`source_url`カラムを読もうとするが、Task 1でそのカラムは削除済みのため`article.source_url`が`undefined`になり、`UPDATE sources SET processed_at = NULL WHERE url = ?`が対象0件で終わり、`processed_at`がリセットされない）。`'publishes a draft'`は既に PASS しているはずである。

- [ ] **Step 3: 実装する**

`server/api/admin/drafts/[id]/reject.post.ts`の内容全体を以下に置き換える:

```ts
import { useDb } from '../../../../utils/db'
import { requireAdminUser } from '../../../../utils/admin'

export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const id = Number(getRouterParam(event, 'id'))
  const article = db.prepare(`SELECT id FROM articles WHERE id = ? AND status = 'draft'`).get(id)
  if (!article) {
    throw createError({ statusCode: 404, message: 'Draft not found' })
  }

  const links = db
    .prepare(`SELECT source_id FROM article_sources WHERE article_id = ?`)
    .all(id) as { source_id: number }[]
  const resetSource = db.prepare(`UPDATE sources SET processed_at = NULL WHERE id = ?`)
  for (const { source_id } of links) {
    resetSource.run(source_id)
  }

  db.prepare(`DELETE FROM article_sources WHERE article_id = ?`).run(id)
  db.prepare(`DELETE FROM articles WHERE id = ?`).run(id)
  return { ok: true }
})
```

- [ ] **Step 4: テストを実行し、成功を確認する**

Run: `npx vitest run tests/api/admin.test.ts`
Expected: 全4件 PASS

- [ ] **Step 5: コミット**

このステップは人間が行う。変更内容を報告する:
```
server/api/admin/drafts/[id]/reject.post.ts, tests/api/admin.test.ts
```

---

## Task 8: 記事一覧・詳細APIの結合テストを新スキーマに追従させる

**Files:**
- Modify: `tests/api/articles.test.ts`

**Interfaces:**
- Consumes: `listPublishedArticles`, `getPublishedArticleById`（Task 5で変更済み、シグネチャ自体は不変）

- [ ] **Step 1: 失敗するテストを確認する**

先にテストを実行して、Task 1のスキーマ変更により`beforeAll`のINSERT文（`source_url`, `source_name`列を参照）がそもそもSQLエラーで落ちることを確認する。

Run: `npx vitest run tests/api/articles.test.ts`
Expected: `beforeAll`内のINSERTが`table articles has no column named source_url`のようなエラーで失敗し、既存4件のテスト全てが FAIL する。

- [ ] **Step 2: 修正し、category・sourcesを検証するテストを追加する**

`tests/api/articles.test.ts`の内容全体を以下に置き換える:

```ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dbDir = mkdtempSync(join(tmpdir(), 'asakusa-articles-'))
const dbPath = join(dbDir, 'test.sqlite3')

describe('articles API', async () => {
  await setup({ server: true, env: { DATABASE_PATH: dbPath } })

  beforeAll(async () => {
    process.env.DATABASE_PATH = dbPath
    const { useDb, resetDbForTests } = await import('../../server/utils/db')
    resetDbForTests()
    const db = useDb()
    const articleResult = db
      .prepare(
        `INSERT INTO articles (title, body, status, category, published_at, created_at)
         VALUES (?, ?, 'published', 'traffic', ?, datetime('now'))`
      )
      .run('公開記事', '本文です', '2026-01-01T00:00:00Z')
    const sourceResult = db
      .prepare(
        `INSERT INTO sources (url, site_name, category, raw_text, fetched_at)
         VALUES ('https://example.com', 'Example', 'traffic', 'text', datetime('now'))`
      )
      .run()
    db.prepare(`INSERT INTO article_sources (article_id, source_id) VALUES (?, ?)`).run(
      articleResult.lastInsertRowid,
      sourceResult.lastInsertRowid
    )
    db.prepare(
      `INSERT INTO articles (title, body, status, category, created_at)
       VALUES (?, ?, 'draft', 'traffic', datetime('now'))`
    ).run('下書き記事', '下書き本文')
  })

  afterAll(() => {
    rmSync(dbDir, { recursive: true, force: true })
  })

  it('lists only published articles', async () => {
    const result: any = await $fetch('/api/articles')
    expect(result.articles).toHaveLength(1)
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
    const article: any = await $fetch(`/api/articles/${id}`)
    expect(article.title).toBe('公開記事')
    expect(article.body).toBe('本文です')
    expect(article.category).toBe('traffic')
    expect(article.sources).toEqual([{ url: 'https://example.com', siteName: 'Example' }])
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
})
```

- [ ] **Step 3: テストを実行し、成功を確認する**

Run: `npx vitest run tests/api/articles.test.ts`
Expected: 全6件 PASS

- [ ] **Step 4: コミット**

このステップは人間が行う。変更内容を報告する:
```
tests/api/articles.test.ts
```

---

## Task 9: 管理画面「下書き一覧」ページの表示を複数出典対応にする

**Files:**
- Modify: `pages/admin/drafts.vue`

**Interfaces:**
- Consumes: `GET /api/admin/drafts`が返す各下書きの`sources: { url: string; siteName: string }[]`（Task 6）

- [ ] **Step 1: 実装する**

`pages/admin/drafts.vue`のテンプレート内、出典表示の`<p>`タグを以下に置き換える:

```html
        <p class="text-sm text-muted mb-4">
          Sources:
          <template v-for="(source, index) in draft.sources" :key="source.url">
            <a :href="source.url" target="_blank" rel="noopener" class="text-primary underline">{{ source.siteName }}</a><span v-if="index < draft.sources.length - 1">, </span>
          </template>
        </p>
```

- [ ] **Step 2: 型エラーがないことを確認する**

Run: `npx tsc --noEmit -p .`
Expected: `pages/admin/drafts.vue`に関するエラーが出力されない

- [ ] **Step 3: コミット**

このステップは人間が行う。変更内容を報告する:
```
pages/admin/drafts.vue
```

---

## Task 10: 記事詳細ページの表示を複数出典対応にする

**Files:**
- Modify: `pages/articles/[id].vue`

**Interfaces:**
- Consumes: `GET /api/articles/:id`が返す`sources: { url: string; siteName: string }[]`（Task 5）

- [ ] **Step 1: 実装する**

`pages/articles/[id].vue`のテンプレート内、出典表示の`<p>`タグを以下に置き換える:

```html
    <p class="mt-8 pt-4 border-t border-default text-sm text-muted">
      <template v-if="article.sources.length > 1">Sources:</template>
      <template v-else>Source:</template>
      <template v-for="(source, index) in article.sources" :key="source.url">
        <a :href="source.url" target="_blank" rel="noopener" class="text-primary underline">{{ source.siteName }}</a><span v-if="index < article.sources.length - 1">, </span>
      </template>
    </p>
```

- [ ] **Step 2: 型エラーがないことを確認する**

Run: `npx tsc --noEmit -p .`
Expected: `pages/articles/[id].vue`に関するエラーが出力されない

- [ ] **Step 3: コミット**

このステップは人間が行う。変更内容を報告する:
```
pages/articles/[id].vue
```

---

## Task 11: 全体テスト実行とブラウザでの手動確認

**Files:**
- (変更なし。確認のみ)

- [ ] **Step 1: 全テストを実行する**

Run: `npx vitest run`
Expected: 全テストファイル PASS

- [ ] **Step 2: ローカルDBを作り直す**

既存の`data/app.sqlite3`が残っていれば削除する（旧スキーマのままだと`npm run dev`実行時にエラーになるため）:

Run: `rm -f data/app.sqlite3 data/app.sqlite3-wal data/app.sqlite3-shm`

- [ ] **Step 3: 収集・生成コマンドを試す（`ANTHROPIC_API_KEY`が設定されている場合）**

Run: `npm run collect`
Expected: `sources`テーブルに`category`付きでURLが収集される

Run: `npm run generate`
Expected: カテゴリごとに1記事ずつ`articles`に`draft`として保存され、コンソールに`生成完了: 成功N件, 失敗0件`のようなログが出る（Nはカテゴリ数に近い値になる）

- [ ] **Step 4: `run`スキルで開発サーバーを起動しブラウザで確認する**

`/admin/drafts`にadminユーザーでログインし、下書きの出典が複数リンクで表示されること、「承認」で`/articles/:id`に複数出典が表示されることを確認する。`ANTHROPIC_API_KEY`が無く生成できない場合は、テスト用のINSERT文（Task 6のSQLを参考に）で手動的に複数ソース付きの下書きを1件作ってから確認してよい。
