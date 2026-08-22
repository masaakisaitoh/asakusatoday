# 記事の多言語翻訳・保存 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **プロジェクト方針（CLAUDE.md）により、gitコマンドはAIが実行してはならない。** 各タスク末尾の「Commit」ステップは、人間がその内容を確認したうえで実行すること。AIはコミットを代行しない。

**Goal:** 記事生成パイプラインに翻訳ステップを追加し、日本語・英語・韓国語・繁体字中国語・簡体字中国語の5言語で記事を保存・配信できるようにする。あわせてフロントエンドに言語選択UIを追加する。

**Architecture:** `articles`テーブルからtitle/bodyを分離し、新設の`article_translations`テーブル（article_id, locale, title, body）に5言語ぶん保持する。`npm run generate`は日本語記事生成に続けてClaude APIへの翻訳呼び出しを1回行い、両方成功した場合のみ記事とその5言語ぶんの翻訳をまとめてDBに保存する。一覧・詳細APIは`lang`クエリで指定localeの翻訳を返し、未翻訳の場合はjaにフォールバックする。フロントエンドはヘッダーの言語ドロップダウン（localStorage保存、初期値en）で選択した言語をAPI呼び出しに渡す。

**Tech Stack:** Nuxt 3 (Nitro), better-sqlite3, @anthropic-ai/sdk, Vitest, @vue/test-utils, @nuxt/test-utils

## Global Constraints

- 対応言語はこの5つに固定：`ja`, `en`, `ko`, `zh-Hant`, `zh-Hans`
- 翻訳は`npm run generate`実行時、日本語記事生成に続けて同じ処理内で行う（承認フローは変更しない）
- 翻訳はClaude APIへの1回の呼び出しで英語・韓国語・繁体字・簡体字の4言語ぶんをJSON一括取得する
- 日本語記事生成・翻訳のどちらかが失敗したら、その記事は丸ごと失敗扱い（部分保存禁止）とし、`source.processed_at`も更新しない
- 管理画面（`/admin/drafts`）のレビュー対象は日本語(ja)のみ
- 翻訳が存在しないlocaleがリクエストされた場合はjaにフォールバックする
- APIの`lang`クエリが5言語以外の不正値・未指定の場合は`en`扱いにする
- フロントエンドの言語選択はドロップダウン、選択値は`localStorage`に保存、未選択時の初期値は`en`

---

## Task 1: DBスキーマ — article_translations テーブルの追加とマイグレーション

**Files:**
- Modify: `server/utils/db.ts`
- Test: `server/utils/db.test.ts`

**Interfaces:**
- Produces: `article_translations`テーブル（列: `article_id INTEGER`, `locale TEXT`, `title TEXT`, `body TEXT`, PK `(article_id, locale)`）。`articles`テーブルから`title`/`body`列を削除。既存データは`migrate()`実行時に`locale='ja'`として`article_translations`へコピーされる。

- [ ] **Step 1: 失敗するテストを書く（新テーブル・カラム構成の確認）**

`server/utils/db.test.ts`の`describe('useDb', ...)`ブロック内、既存の`it('creates an articles table with a category column', ...)`の直後に追記する：

```ts
  it('creates an article_translations table', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row: any) => row.name)
    expect(tables).toContain('article_translations')
  })

  it('creates an articles table without title/body columns', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const columns = db.prepare('PRAGMA table_info(articles)').all() as { name: string }[]
    expect(columns.some((c) => c.name === 'title')).toBe(false)
    expect(columns.some((c) => c.name === 'body')).toBe(false)
  })
```

同じファイルの末尾、`describe('useDb', ...)`ブロックの閉じ`})`の直前に、レガシーデータの移行テストを追記する：

```ts
  it('migrates an existing articles table with title/body into article_translations as ja', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'asakusa-migrate-articles-'))
    const path = join(dir, 'legacy.sqlite3')

    const legacyDb = new Database(path)
    legacyDb.exec(`
      CREATE TABLE articles (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        image_url TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        category TEXT NOT NULL,
        published_at TEXT,
        created_at TEXT NOT NULL
      );
    `)
    legacyDb
      .prepare(
        `INSERT INTO articles (title, body, status, category, created_at)
         VALUES ('レガシータイトル', 'レガシー本文', 'published', 'traffic', datetime('now'))`
      )
      .run()
    legacyDb.close()

    process.env.DATABASE_PATH = path
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()

    const columns = db.prepare('PRAGMA table_info(articles)').all() as { name: string }[]
    expect(columns.some((c) => c.name === 'title')).toBe(false)
    expect(columns.some((c) => c.name === 'body')).toBe(false)

    const translation = db
      .prepare(`SELECT article_id, title, body FROM article_translations WHERE locale = 'ja'`)
      .get() as { article_id: number; title: string; body: string }
    expect(translation.title).toBe('レガシータイトル')
    expect(translation.body).toBe('レガシー本文')

    rmSync(dir, { recursive: true, force: true })
  })
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/db.test.ts`
Expected: FAIL（`article_translations`テーブルが存在しない、`articles`に`title`/`body`列が残っている等）

- [ ] **Step 3: `server/utils/db.ts`を実装する**

ファイル全体を次の内容に置き換える：

```ts
import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

let db: Database.Database | null = null

function dbPath(): string {
  return process.env.DATABASE_PATH || './data/app.sqlite3'
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  address TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  user_name TEXT UNIQUE NOT NULL,
  gender TEXT,
  birth_year INTEGER,
  nationality TEXT,
  avatar_seed TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  url TEXT UNIQUE NOT NULL,
  site_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  raw_text TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  category TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS article_translations (
  article_id INTEGER NOT NULL REFERENCES articles(id),
  locale TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (article_id, locale)
);

CREATE TABLE IF NOT EXISTS article_sources (
  article_id INTEGER NOT NULL REFERENCES articles(id),
  source_id INTEGER NOT NULL REFERENCES sources(id),
  PRIMARY KEY (article_id, source_id)
);
`

function migrate(database: Database.Database): void {
  const userColumns = database.prepare('PRAGMA table_info(users)').all() as { name: string }[]
  if (!userColumns.some((c) => c.name === 'is_admin')) {
    database.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0')
  }
  const sourceColumns = database.prepare('PRAGMA table_info(sources)').all() as { name: string }[]
  if (!sourceColumns.some((c) => c.name === 'category')) {
    database.exec("ALTER TABLE sources ADD COLUMN category TEXT NOT NULL DEFAULT ''")
  }
  const articleColumns = database.prepare('PRAGMA table_info(articles)').all() as { name: string }[]
  if (articleColumns.some((c) => c.name === 'title')) {
    database.exec(`
      INSERT INTO article_translations (article_id, locale, title, body)
      SELECT id, 'ja', title, body FROM articles
    `)
    database.exec('ALTER TABLE articles DROP COLUMN title')
    database.exec('ALTER TABLE articles DROP COLUMN body')
  }
}

export function useDb(): Database.Database {
  if (db) return db
  const path = dbPath()
  if (path !== ':memory:') {
    const dir = dirname(path)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  migrate(db)
  return db
}

export function resetDbForTests(): void {
  db = null
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run server/utils/db.test.ts`
Expected: PASS（全テストグリーン）

- [ ] **Step 5: Commit**

```bash
git add server/utils/db.ts server/utils/db.test.ts
git commit -m "feat: add article_translations table and migrate legacy title/body"
```

---

## Task 2: articles.ts — locale対応（TranslationLocale型・翻訳の取得・フォールバック）

**Files:**
- Modify: `server/utils/articles.ts`
- Test: `server/utils/articles.test.ts`

**Interfaces:**
- Consumes: Task 1で作った`article_translations`テーブル（`article_id, locale, title, body`）
- Produces:
  - `export type TranslationLocale = 'ja' | 'en' | 'ko' | 'zh-Hant' | 'zh-Hans'`
  - `export const SUPPORTED_LOCALES: TranslationLocale[]`
  - `export function normalizeLocale(value: unknown): TranslationLocale`
  - `export interface ArticleColumns { id, image_url, status, category, published_at, created_at }`（title/bodyなし）
  - `export interface ArticleWithTranslation extends ArticleColumns { title: string; body: string }`
  - `export interface ArticleRow extends ArticleWithTranslation { sources: ArticleSource[] }`
  - `export function attachArticleTranslations(db, articles: ArticleColumns[], locale: TranslationLocale): ArticleWithTranslation[]`
  - `export function attachArticleSources<T extends { id: number }>(db, articles: T[]): (T & { sources: ArticleSource[] })[]`（既存より汎用化）
  - `export function listPublishedArticles(db, page: number, locale: TranslationLocale): ArticleListResult`
  - `export function getPublishedArticleById(db, id: number, locale: TranslationLocale): ArticleRow | undefined`

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/articles.test.ts`をファイル全体、次の内容に置き換える：

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
      `INSERT INTO articles (status, category, published_at, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    )
    .run(
      overrides.status ?? 'published',
      overrides.category ?? 'asakusa-area',
      overrides.publishedAt ?? '2026-01-01T00:00:00Z'
    )
  const articleId = result.lastInsertRowid as number
  db.prepare(
    `INSERT INTO article_translations (article_id, locale, title, body) VALUES (?, 'ja', ?, 'Body')`
  ).run(articleId, overrides.title ?? 'Title')
  return articleId
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

describe('normalizeLocale', () => {
  it('returns the value when it is a supported locale', async () => {
    const { normalizeLocale } = await import('./articles')
    expect(normalizeLocale('ja')).toBe('ja')
    expect(normalizeLocale('zh-Hant')).toBe('zh-Hant')
  })

  it('defaults to en for unsupported or missing values', async () => {
    const { normalizeLocale } = await import('./articles')
    expect(normalizeLocale('fr')).toBe('en')
    expect(normalizeLocale(undefined)).toBe('en')
    expect(normalizeLocale(Array.isArray(['a']) ? ['a'] : 'x')).toBe('en')
  })
})

describe('listPublishedArticles', () => {
  it('returns only published articles ordered by published_at desc', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    insertArticle(db, { title: 'Old', publishedAt: '2026-01-01T00:00:00Z' })
    insertArticle(db, { title: 'New', publishedAt: '2026-02-01T00:00:00Z' })
    insertArticle(db, { title: 'Draft', status: 'draft', publishedAt: null })

    const { listPublishedArticles } = await import('./articles')
    const result = listPublishedArticles(db, 1, 'ja')

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
    const page1 = listPublishedArticles(db, 1, 'ja')
    const page2 = listPublishedArticles(db, 2, 'ja')

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
    const result = listPublishedArticles(db, 99, 'ja')

    expect(result.articles).toEqual([])
  })

  it('clamps page numbers below 1 to page 1', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    insertArticle(db, { title: 'Only' })

    const { listPublishedArticles } = await import('./articles')
    const result = listPublishedArticles(db, 0, 'ja')

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
    const result = listPublishedArticles(db, 1, 'ja')

    expect(result.articles[0].category).toBe('traffic')
    expect(result.articles[0].sources).toEqual(
      expect.arrayContaining([
        { url: 'https://example.com/a', siteName: 'Example A' },
        { url: 'https://example.com/b', siteName: 'Example B' }
      ])
    )
  })

  it('returns the requested locale translation when it exists', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const articleId = insertArticle(db, { title: 'Japanese Title' })
    db.prepare(
      `INSERT INTO article_translations (article_id, locale, title, body) VALUES (?, 'en', 'English Title', 'English Body')`
    ).run(articleId)

    const { listPublishedArticles } = await import('./articles')
    const result = listPublishedArticles(db, 1, 'en')

    expect(result.articles[0].title).toBe('English Title')
    expect(result.articles[0].body).toBe('English Body')
  })

  it('falls back to the ja translation when the requested locale has none', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    insertArticle(db, { title: 'Only Japanese' })

    const { listPublishedArticles } = await import('./articles')
    const result = listPublishedArticles(db, 1, 'en')

    expect(result.articles[0].title).toBe('Only Japanese')
  })
})

describe('getPublishedArticleById', () => {
  it('returns undefined for a draft article', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const id = insertArticle(db, { status: 'draft' })

    const { getPublishedArticleById } = await import('./articles')
    expect(getPublishedArticleById(db, id, 'ja')).toBeUndefined()
  })

  it('returns undefined for a nonexistent id', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()

    const { getPublishedArticleById } = await import('./articles')
    expect(getPublishedArticleById(db, 999999, 'ja')).toBeUndefined()
  })

  it('returns the article with its sources for a published id', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const id = insertArticle(db, { title: 'Findable' })
    linkSource(db, id, 'https://example.com/a', 'Example A')

    const { getPublishedArticleById } = await import('./articles')
    const article = getPublishedArticleById(db, id, 'ja')
    expect(article?.title).toBe('Findable')
    expect(article?.sources).toEqual([{ url: 'https://example.com/a', siteName: 'Example A' }])
  })

  it('falls back to the ja translation when the requested locale has none', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const id = insertArticle(db, { title: 'Japanese Only' })

    const { getPublishedArticleById } = await import('./articles')
    const article = getPublishedArticleById(db, id, 'ko')
    expect(article?.title).toBe('Japanese Only')
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/articles.test.ts`
Expected: FAIL（`normalizeLocale`が存在しない、`listPublishedArticles`の引数不足でTypeError、`article_translations`未対応でtitleが取得できない、など）

- [ ] **Step 3: `server/utils/articles.ts`を実装する**

ファイル全体を次の内容に置き換える：

```ts
import type Database from 'better-sqlite3'

export interface ArticleSource {
  url: string
  siteName: string
}

export type TranslationLocale = 'ja' | 'en' | 'ko' | 'zh-Hant' | 'zh-Hans'

export const SUPPORTED_LOCALES: TranslationLocale[] = ['ja', 'en', 'ko', 'zh-Hant', 'zh-Hans']

export function normalizeLocale(value: unknown): TranslationLocale {
  return (SUPPORTED_LOCALES as string[]).includes(value as string)
    ? (value as TranslationLocale)
    : 'en'
}

export interface ArticleColumns {
  id: number
  image_url: string | null
  status: string
  category: string
  published_at: string | null
  created_at: string
}

export interface ArticleWithTranslation extends ArticleColumns {
  title: string
  body: string
}

export interface ArticleRow extends ArticleWithTranslation {
  sources: ArticleSource[]
}

export function attachArticleTranslations(
  db: Database.Database,
  articles: ArticleColumns[],
  locale: TranslationLocale
): ArticleWithTranslation[] {
  if (articles.length === 0) return []
  const ids = articles.map((a) => a.id)
  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT article_id, locale, title, body FROM article_translations WHERE article_id IN (${placeholders})`
    )
    .all(...ids) as { article_id: number; locale: string; title: string; body: string }[]

  const translationsByArticle = new Map<number, Map<string, { title: string; body: string }>>()
  for (const row of rows) {
    const map = translationsByArticle.get(row.article_id) ?? new Map()
    map.set(row.locale, { title: row.title, body: row.body })
    translationsByArticle.set(row.article_id, map)
  }

  return articles.map((a) => {
    const translations = translationsByArticle.get(a.id)
    const translation = translations?.get(locale) ?? translations?.get('ja')
    return { ...a, title: translation?.title ?? '', body: translation?.body ?? '' }
  })
}

export function attachArticleSources<T extends { id: number }>(
  db: Database.Database,
  articles: T[]
): (T & { sources: ArticleSource[] })[] {
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

const ARTICLE_COLUMNS_SQL = 'id, image_url, status, category, published_at, created_at'

export function listPublishedArticles(
  db: Database.Database,
  page: number,
  locale: TranslationLocale
): ArticleListResult {
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

  const withTranslations = attachArticleTranslations(db, articleColumns, locale)
  return { articles: attachArticleSources(db, withTranslations), total, page: safePage, pageSize: PAGE_SIZE }
}

export function getPublishedArticleById(
  db: Database.Database,
  id: number,
  locale: TranslationLocale
): ArticleRow | undefined {
  const articleColumns = db
    .prepare(`SELECT ${ARTICLE_COLUMNS_SQL} FROM articles WHERE id = ? AND status = 'published'`)
    .get(id) as ArticleColumns | undefined
  if (!articleColumns) return undefined
  const withTranslations = attachArticleTranslations(db, [articleColumns], locale)
  return attachArticleSources(db, withTranslations)[0]
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run server/utils/articles.test.ts`
Expected: PASS（全テストグリーン）

- [ ] **Step 5: Commit**

```bash
git add server/utils/articles.ts server/utils/articles.test.ts
git commit -m "feat: support locale-aware article translations with ja fallback"
```

---

## Task 3: generator.ts — 翻訳ステップの追加

**Files:**
- Modify: `server/utils/generator.ts`
- Test: `server/utils/generator.test.ts`

**Interfaces:**
- Consumes: `TranslationLocale`（`../utils/articles`からimport。ただし本タスクでは`'en' | 'ko' | 'zh-Hant' | 'zh-Hans'`のサブセットを`TranslatedLocale`として使う）
- Produces:
  - `export type TranslatedLocale = 'en' | 'ko' | 'zh-Hant' | 'zh-Hans'`
  - `export function buildTranslationPrompt(article: GeneratedArticle): string`
  - `export function parseTranslatedArticle(responseText: string): Record<TranslatedLocale, GeneratedArticle>`
  - `export function translateArticle(client: MessageClient, article: GeneratedArticle): Promise<Record<TranslatedLocale, GeneratedArticle>>`
  - `generateDraftsForUnprocessedSources`は変更後、日本語生成→翻訳の両方が成功した場合のみ`articles`(1行)＋`article_translations`(5行: ja+4言語)＋`article_sources`(1行)を書き込む。どちらか失敗時はDB書き込みなしで`failed++`。

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/generator.test.ts`をファイル全体、次の内容に置き換える：

```ts
import { describe, it, expect } from 'vitest'
import type { MessageClient } from './generator'

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

describe('parseGeneratedArticle', () => {
  it('parses a valid JSON response', async () => {
    const { parseGeneratedArticle } = await import('./generator')
    const result = parseGeneratedArticle('{"title": "タイトル", "body": "本文"}')
    expect(result).toEqual({ title: 'タイトル', body: '本文' })
  })

  it('throws when the shape is invalid', async () => {
    const { parseGeneratedArticle } = await import('./generator')
    expect(() => parseGeneratedArticle('{"title": "タイトルのみ"}')).toThrow()
  })
})

function fakeClient(responseText: string): MessageClient {
  return {
    messages: {
      create: async () => ({ content: [{ type: 'text', text: responseText }] })
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
    expect(article).toEqual({ title: '生成タイトル', body: '生成本文' })
  })
})

const TRANSLATION_JSON = JSON.stringify({
  en: { title: 'EN title', body: 'EN body' },
  ko: { title: 'KO title', body: 'KO body' },
  'zh-Hant': { title: 'ZHT title', body: 'ZHT body' },
  'zh-Hans': { title: 'ZHS title', body: 'ZHS body' }
})

describe('buildTranslationPrompt', () => {
  it('includes the original title and body, and instructs translation into 4 languages', async () => {
    const { buildTranslationPrompt } = await import('./generator')
    const prompt = buildTranslationPrompt({ title: '元タイトル', body: '元本文' })
    expect(prompt).toContain('元タイトル')
    expect(prompt).toContain('元本文')
    expect(prompt).toContain('タイトル：')
    expect(prompt).toContain('en')
    expect(prompt).toContain('ko')
    expect(prompt).toContain('zh-Hant')
    expect(prompt).toContain('zh-Hans')
  })
})

describe('parseTranslatedArticle', () => {
  it('parses a valid JSON response with all 4 locales', async () => {
    const { parseTranslatedArticle } = await import('./generator')
    const result = parseTranslatedArticle(TRANSLATION_JSON)
    expect(result).toEqual({
      en: { title: 'EN title', body: 'EN body' },
      ko: { title: 'KO title', body: 'KO body' },
      'zh-Hant': { title: 'ZHT title', body: 'ZHT body' },
      'zh-Hans': { title: 'ZHS title', body: 'ZHS body' }
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
          'zh-Hans': { title: 't', body: 'b' }
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
})

function fakeGenerateAndTranslateClient(): MessageClient {
  return {
    messages: {
      create: async (params) => {
        const content = params.messages[0].content
        if (content.includes('タイトル：')) {
          return { content: [{ type: 'text', text: TRANSLATION_JSON }] }
        }
        return { content: [{ type: 'text', text: '{"title": "生成タイトル", "body": "生成本文"}' }] }
      }
    }
  }
}

describe('generateDraftsForUnprocessedSources', () => {
  it('generates a separate article per source even within the same category', async () => {
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

    const { generateDraftsForUnprocessedSources } = await import('./generator')
    const client = fakeGenerateAndTranslateClient()
    const result = await generateDraftsForUnprocessedSources(db, client)

    expect(result).toEqual({ generated: 2, failed: 0 })

    const articles = db.prepare(`SELECT * FROM articles`).all() as any[]
    expect(articles).toHaveLength(2)
    expect(articles.every((a) => a.category === 'traffic')).toBe(true)

    for (const article of articles) {
      const links = db
        .prepare(`SELECT source_id FROM article_sources WHERE article_id = ?`)
        .all(article.id) as { source_id: number }[]
      expect(links).toHaveLength(1)

      const translations = db
        .prepare(`SELECT locale FROM article_translations WHERE article_id = ?`)
        .all(article.id) as { locale: string }[]
      expect(translations.map((t) => t.locale).sort()).toEqual(['en', 'ja', 'ko', 'zh-Hans', 'zh-Hant'])
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
    ).run('https://a.example/', 'a', 'traffic', '本文A')
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://c.example/', 'c', 'weather', '本文C')

    const client: MessageClient = {
      messages: {
        create: async (params) => {
          const content = params.messages[0].content
          if (content.includes('本文A')) throw new Error('API error')
          if (content.includes('タイトル：')) {
            return { content: [{ type: 'text', text: TRANSLATION_JSON }] }
          }
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

  it('does not insert an article or its translations when translation fails', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://a.example/', 'a', 'traffic', '本文A')

    const client: MessageClient = {
      messages: {
        create: async (params) => {
          const content = params.messages[0].content
          if (content.includes('タイトル：')) throw new Error('translation API error')
          return { content: [{ type: 'text', text: '{"title": "生成タイトル", "body": "生成本文"}' }] }
        }
      }
    }
    const { generateDraftsForUnprocessedSources } = await import('./generator')
    const result = await generateDraftsForUnprocessedSources(db, client)

    expect(result).toEqual({ generated: 0, failed: 1 })
    const articles = db.prepare(`SELECT * FROM articles`).all()
    expect(articles).toHaveLength(0)
    const translations = db.prepare(`SELECT * FROM article_translations`).all()
    expect(translations).toHaveLength(0)
    const source = db.prepare(`SELECT processed_at FROM sources WHERE url = ?`).get('https://a.example/') as any
    expect(source.processed_at).toBeNull()
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/generator.test.ts`
Expected: FAIL（`buildTranslationPrompt`/`parseTranslatedArticle`/`translateArticle`が存在しない、`generateDraftsForUnprocessedSources`が翻訳を保存しない）

- [ ] **Step 3: `server/utils/generator.ts`を実装する**

ファイル全体を次の内容に置き換える：

```ts
import type Database from 'better-sqlite3'

export interface PromptSource {
  siteName: string
  url: string
  rawText: string
}

export interface GeneratedArticle {
  title: string
  body: string
}

export type TranslatedLocale = 'en' | 'ko' | 'zh-Hant' | 'zh-Hans'

const TRANSLATED_LOCALES: TranslatedLocale[] = ['en', 'ko', 'zh-Hant', 'zh-Hans']

export interface MessageClient {
  messages: {
    create(params: {
      model: string
      max_tokens: number
      messages: { role: 'user'; content: string }[]
    }): Promise<{ content: Array<{ type: string; text?: string }> }>
  }
}

export function buildGenerationPrompt(sources: PromptSource[]): string {
  const sourcesText = sources
    .map((source) => `【${source.siteName}】（${source.url}）\n${source.rawText}`)
    .join('\n\n---\n\n')

  return `あなたは浅草エリアの地域情報サイト「ASAKUSA TODAY」で、地元の人が読んで親しみやすいレポートを書くライターです。
以下は、ある情報源から集めた本文です。

この内容をもとに、日本語のレポート記事を1本作成してください。
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

export function parseGeneratedArticle(responseText: string): GeneratedArticle {
  const parsed = JSON.parse(responseText)
  if (typeof parsed.title !== 'string' || typeof parsed.body !== 'string') {
    throw new Error('Invalid generated article shape')
  }
  return { title: parsed.title, body: parsed.body }
}

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

export function buildTranslationPrompt(article: GeneratedArticle): string {
  return `以下は日本語で書かれた地域情報サイト「ASAKUSA TODAY」の記事です。
この内容を、英語（en）・韓国語（ko）・繁体字中国語（zh-Hant）・簡体字中国語（zh-Hans）の4言語に翻訳してください。

- 元記事のトーン（地域ブログ風の親しみやすさ）を保つこと。
- 事実を追加・削除しないこと。原文に忠実に翻訳すること。
- 意訳しすぎず、原文の意味を正確に伝えること。

出力は以下のJSON形式のみとし、他の文章は含めないこと：
{"en": {"title": "...", "body": "..."}, "ko": {"title": "...", "body": "..."}, "zh-Hant": {"title": "...", "body": "..."}, "zh-Hans": {"title": "...", "body": "..."}}

---
タイトル：${article.title}
本文：
${article.body}
---`
}

export function parseTranslatedArticle(responseText: string): Record<TranslatedLocale, GeneratedArticle> {
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
    'zh-Hans': { title: parsed['zh-Hans'].title, body: parsed['zh-Hans'].body }
  }
}

export async function translateArticle(
  client: MessageClient,
  article: GeneratedArticle
): Promise<Record<TranslatedLocale, GeneratedArticle>> {
  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 4096,
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
  client: MessageClient
): Promise<{ generated: number; failed: number }> {
  const sources = db
    .prepare(`SELECT id, url, site_name, category, raw_text FROM sources WHERE processed_at IS NULL`)
    .all() as UnprocessedSource[]

  let generated = 0
  let failed = 0

  const insertArticle = db.prepare(
    `INSERT INTO articles (status, category, created_at) VALUES ('draft', ?, datetime('now'))`
  )
  const insertTranslation = db.prepare(
    `INSERT INTO article_translations (article_id, locale, title, body) VALUES (?, ?, ?, ?)`
  )
  const insertArticleSource = db.prepare(
    `INSERT INTO article_sources (article_id, source_id) VALUES (?, ?)`
  )
  const markProcessed = db.prepare(`UPDATE sources SET processed_at = datetime('now') WHERE id = ?`)

  for (const source of sources) {
    try {
      const article = await generateArticleFromSources(client, [
        { siteName: source.site_name, url: source.url, rawText: source.raw_text }
      ])
      const translations = await translateArticle(client, article)

      const insertResult = insertArticle.run(source.category)
      const articleId = insertResult.lastInsertRowid as number
      insertTranslation.run(articleId, 'ja', article.title, article.body)
      for (const locale of TRANSLATED_LOCALES) {
        insertTranslation.run(articleId, locale, translations[locale].title, translations[locale].body)
      }
      insertArticleSource.run(articleId, source.id)
      markProcessed.run(source.id)
      generated++
    } catch {
      failed++
    }
  }

  return { generated, failed }
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run server/utils/generator.test.ts`
Expected: PASS（全テストグリーン）

- [ ] **Step 5: Commit**

```bash
git add server/utils/generator.ts server/utils/generator.test.ts
git commit -m "feat: translate generated articles into 4 languages during generation"
```

---

## Task 4: 記事一覧・詳細API — langクエリ対応

**Files:**
- Modify: `server/api/articles/index.get.ts`
- Modify: `server/api/articles/[id].get.ts`
- Test: `tests/api/articles.test.ts`

**Interfaces:**
- Consumes: `listPublishedArticles(db, page, locale)`, `getPublishedArticleById(db, id, locale)`, `normalizeLocale(value)`（すべてTask 2で`server/utils/articles.ts`に定義済み）

- [ ] **Step 1: 失敗するテストを書く**

`tests/api/articles.test.ts`をファイル全体、次の内容に置き換える：

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
  })

  afterAll(() => {
    rmSync(dbDir, { recursive: true, force: true })
  })

  it('lists only published articles, defaulting to en', async () => {
    const result: any = await $fetch('/api/articles')
    expect(result.articles).toHaveLength(1)
    expect(result.articles[0].title).toBe('Published Article')
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
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/api/articles.test.ts`
Expected: FAIL（`lang`クエリが未対応で常にjaを返す、デフォルトがenでない、など）

- [ ] **Step 3: `server/api/articles/index.get.ts`を実装する**

ファイル全体を次の内容に置き換える：

```ts
import { useDb } from '../../utils/db'
import { listPublishedArticles, normalizeLocale } from '../../utils/articles'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const page = Number(query.page) || 1
  const locale = normalizeLocale(query.lang)
  const db = useDb()
  return listPublishedArticles(db, page, locale)
})
```

- [ ] **Step 4: `server/api/articles/[id].get.ts`を実装する**

ファイル全体を次の内容に置き換える：

```ts
import { useDb } from '../../utils/db'
import { getPublishedArticleById, normalizeLocale } from '../../utils/articles'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  const query = getQuery(event)
  const locale = normalizeLocale(query.lang)
  const db = useDb()
  const article = getPublishedArticleById(db, id, locale)
  if (!article) {
    throw createError({ statusCode: 404, message: 'Article not found' })
  }
  return article
})
```

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `npx vitest run tests/api/articles.test.ts`
Expected: PASS（全テストグリーン）

- [ ] **Step 6: Commit**

```bash
git add server/api/articles/index.get.ts server/api/articles/[id].get.ts tests/api/articles.test.ts
git commit -m "feat: add lang query support to the articles list/detail API"
```

---

## Task 5: 管理画面API — ja翻訳の参照とreject時のクリーンアップ

**Files:**
- Modify: `server/api/admin/drafts/index.get.ts`
- Modify: `server/api/admin/drafts/[id]/reject.post.ts`
- Test: `tests/api/admin.test.ts`

**Interfaces:**
- Consumes: `attachArticleTranslations(db, articles, 'ja')`, `attachArticleSources(db, articles)`, `ArticleColumns`（すべてTask 2）

- [ ] **Step 1: 失敗するテストを書く**

`tests/api/admin.test.ts`の`insertDraft`関数を次の内容に置き換える：

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
```

`it('lists drafts for an admin user', ...)`のテスト本体を次の内容に置き換える（タイトルの検証を追加）：

```ts
  it('lists drafts for an admin user', async () => {
    const { cookie, address } = await loginAndGetCookie()
    await makeAdmin(address)
    await insertDraft('https://e-asakusa.jp/list-test')

    const drafts: any = await $fetch('/api/admin/drafts', { headers: { cookie } })
    const draft = drafts.find((d: any) => d.sources.some((s: any) => s.url === 'https://e-asakusa.jp/list-test'))
    expect(draft).toBeDefined()
    expect(draft.category).toBe('asakusa-area')
    expect(draft.title).toBe('下書きタイトル')
  })
```

`it('rejects a draft and resets its source for reprocessing', ...)`のテスト本体を次の内容に置き換える（翻訳行の削除を検証する行を追加）：

```ts
  it('rejects a draft and resets its source for reprocessing', async () => {
    const { cookie, address } = await loginAndGetCookie()
    await makeAdmin(address)
    const sourceUrl = 'https://e-asakusa.jp/reject-test'
    const id = await insertDraft(sourceUrl)

    await $fetch(`/api/admin/drafts/${id}/reject`, { method: 'POST', headers: { cookie } })

    const { useDb } = await import('../../server/utils/db')
    const db = useDb()
    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(id)
    expect(article).toBeUndefined()
    const translations = db.prepare('SELECT * FROM article_translations WHERE article_id = ?').all(id)
    expect(translations).toHaveLength(0)
    const source = db.prepare('SELECT processed_at FROM sources WHERE url = ?').get(sourceUrl) as any
    expect(source.processed_at).toBeNull()
  })
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/api/admin.test.ts`
Expected: FAIL（`articles`テーブルに存在しない`title`/`body`列へのINSERTでエラー、または`draft.title`がundefined、`article_translations`が削除されず残る）

- [ ] **Step 3: `server/api/admin/drafts/index.get.ts`を実装する**

ファイル全体を次の内容に置き換える：

```ts
import { useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/admin'
import { attachArticleSources, attachArticleTranslations, type ArticleColumns } from '../../../utils/articles'

export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const articles = db
    .prepare(
      `SELECT id, image_url, status, category, published_at, created_at
       FROM articles WHERE status = 'draft' ORDER BY created_at DESC`
    )
    .all() as ArticleColumns[]
  const withTranslations = attachArticleTranslations(db, articles, 'ja')
  return attachArticleSources(db, withTranslations)
})
```

- [ ] **Step 4: `server/api/admin/drafts/[id]/reject.post.ts`を実装する**

ファイル全体を次の内容に置き換える：

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
  db.prepare(`DELETE FROM article_translations WHERE article_id = ?`).run(id)
  db.prepare(`DELETE FROM articles WHERE id = ?`).run(id)
  return { ok: true }
})
```

- [ ] **Step 5: テストを実行して成功を確認する**

Run: `npx vitest run tests/api/admin.test.ts`
Expected: PASS（全テストグリーン）

- [ ] **Step 6: Commit**

```bash
git add server/api/admin/drafts/index.get.ts server/api/admin/drafts/[id]/reject.post.ts tests/api/admin.test.ts
git commit -m "fix: read ja translation for draft review and clean up translations on reject"
```

---

## Task 6: フロントエンド — 言語選択ドロップダウンと表示切り替え

**Files:**
- Create: `composables/useLocale.ts`
- Test: `composables/useLocale.test.ts`
- Modify: `layouts/default.vue`
- Test: `layouts/default.test.ts`
- Modify: `pages/index.vue`
- Modify: `pages/articles/[id].vue`

**Interfaces:**
- Consumes: `TranslationLocale`, `SUPPORTED_LOCALES`（`../server/utils/articles`からimport。Task 2で定義済み）
- Produces: `useLocale(): { locale: Ref<TranslationLocale>; setLocale(value: TranslationLocale): void; loadStoredLocale(): void }`（Nuxtのcomposables自動importで`useLocale()`としてどこからでも呼べる）

- [ ] **Step 1: 失敗するテストを書く（useLocale）**

`composables/useLocale.test.ts`を新規作成する：

```ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { ref } from 'vue'

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('useState', (_key: string, init: () => unknown) => ref(init()))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useLocale', () => {
  it('defaults to en', async () => {
    const { useLocale } = await import('./useLocale')
    const { locale } = useLocale()
    expect(locale.value).toBe('en')
  })

  it('setLocale updates the state and persists to localStorage', async () => {
    const { useLocale } = await import('./useLocale')
    const { locale, setLocale } = useLocale()
    setLocale('ja')
    expect(locale.value).toBe('ja')
    expect(localStorage.getItem('locale')).toBe('ja')
  })

  it('loadStoredLocale reads a valid persisted value', async () => {
    localStorage.setItem('locale', 'ko')
    const { useLocale } = await import('./useLocale')
    const { locale, loadStoredLocale } = useLocale()
    loadStoredLocale()
    expect(locale.value).toBe('ko')
  })

  it('loadStoredLocale ignores an invalid persisted value', async () => {
    localStorage.setItem('locale', 'fr')
    const { useLocale } = await import('./useLocale')
    const { locale, loadStoredLocale } = useLocale()
    loadStoredLocale()
    expect(locale.value).toBe('en')
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run composables/useLocale.test.ts`
Expected: FAIL（`./useLocale`モジュールが存在しない）

- [ ] **Step 3: `composables/useLocale.ts`を実装する**

新規作成：

```ts
import type { TranslationLocale } from '../server/utils/articles'
import { SUPPORTED_LOCALES } from '../server/utils/articles'

const STORAGE_KEY = 'locale'

export function useLocale() {
  const locale = useState<TranslationLocale>('locale', () => 'en')

  function setLocale(value: TranslationLocale): void {
    locale.value = value
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, value)
    }
  }

  function loadStoredLocale(): void {
    if (typeof localStorage === 'undefined') return
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (SUPPORTED_LOCALES as string[]).includes(stored)) {
      locale.value = stored as TranslationLocale
    }
  }

  return { locale, setLocale, loadStoredLocale }
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run composables/useLocale.test.ts`
Expected: PASS（全テストグリーン）

- [ ] **Step 5: 失敗するテストを書く（言語ドロップダウン）**

`layouts/default.test.ts`をファイル全体、次の内容に置き換える：

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import DefaultLayout from './default.vue'

const stubs = { NuxtLink: { template: '<a><slot /></a>' } }

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubUseState() {
  vi.stubGlobal('useState', (_key: string, init: () => unknown) => ref(init()))
}

describe('default layout', () => {
  it('renders the site logo linking to home', () => {
    stubUseState()
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    expect(wrapper.text()).toContain('ASAKUSA TODAY')
  })

  it('renders the AI-generation disclosure in the footer', () => {
    stubUseState()
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    expect(wrapper.text()).toContain('AI-generated')
  })

  it('renders slot content in the main area', () => {
    stubUseState()
    const wrapper = mount(DefaultLayout, {
      slots: { default: '<div class="test-content">Hello</div>' },
      global: { stubs }
    })
    expect(wrapper.find('.test-content').exists()).toBe(true)
  })

  it('renders a language selector with all supported locales', () => {
    stubUseState()
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    const options = wrapper.findAll('option')
    expect(options.map((o) => o.attributes('value'))).toEqual(['ja', 'en', 'ko', 'zh-Hant', 'zh-Hans'])
  })

  it('changing the language selector updates the selected locale', async () => {
    stubUseState()
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    const select = wrapper.find('select')
    await select.setValue('ja')
    expect((select.element as HTMLSelectElement).value).toBe('ja')
  })
})
```

- [ ] **Step 6: テストを実行して失敗を確認する**

Run: `npx vitest run layouts/default.test.ts`
Expected: FAIL（`select`要素が存在しない）

- [ ] **Step 7: `layouts/default.vue`を実装する**

ファイル全体を次の内容に置き換える：

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { SUPPORTED_LOCALES, type TranslationLocale } from '../server/utils/articles'

const { locale, setLocale, loadStoredLocale } = useLocale()

const localeLabels: Record<TranslationLocale, string> = {
  ja: '日本語',
  en: 'English',
  ko: '한국어',
  'zh-Hant': '繁體中文',
  'zh-Hans': '简体中文'
}

onMounted(() => {
  loadStoredLocale()
})

function onLocaleChange(event: Event): void {
  setLocale((event.target as HTMLSelectElement).value as TranslationLocale)
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-default">
      <div class="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <NuxtLink to="/" class="text-xl font-bold text-primary no-underline">
          ASAKUSA TODAY
        </NuxtLink>
        <select
          class="rounded border border-default bg-default px-2 py-1 text-sm"
          :value="locale"
          @change="onLocaleChange"
        >
          <option v-for="l in SUPPORTED_LOCALES" :key="l" :value="l">{{ localeLabels[l] }}</option>
        </select>
      </div>
    </header>
    <main class="flex-1">
      <slot />
    </main>
    <footer class="border-t border-default">
      <div class="max-w-5xl mx-auto px-4 py-4 text-sm text-muted">
        Articles are AI-generated from public sources and reviewed by our editors before publishing.
      </div>
    </footer>
  </div>
</template>
```

- [ ] **Step 8: テストを実行して成功を確認する**

Run: `npx vitest run layouts/default.test.ts`
Expected: PASS（全テストグリーン）

- [ ] **Step 9: `pages/index.vue`を実装する（一覧に選択言語を反映）**

ファイル全体を次の内容に置き換える：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { WeatherForecast } from '../server/utils/weather'

const route = useRoute()
const router = useRouter()
const { locale } = useLocale()

const page = computed({
  get: () => Number(route.query.page) || 1,
  set: (value: number) => {
    router.push({ path: '/', query: { page: value } })
  }
})

const { data } = await useFetch('/api/articles', {
  query: { page, lang: locale },
  watch: [page, locale]
})

const { data: weather } = await useFetch<WeatherForecast | null>('/api/weather')
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold text-primary mb-6">ASAKUSA TODAY</h1>
    <WeatherCard
      v-if="weather"
      :weather-emoji="weather.weatherEmoji"
      :weather-label="weather.weatherLabel"
      :pop="weather.pop"
      :high-temp="weather.highTemp"
      class="mb-6"
    />
    <p v-if="data && data.articles.length === 0" class="text-muted">
      No articles yet.
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <ArticleCard
        v-for="article in data?.articles"
        :id="article.id"
        :key="article.id"
        :title="article.title"
        :image-url="article.image_url"
        :published-at="article.published_at ?? ''"
      />
    </div>
    <div v-if="data && data.total > data.pageSize" class="flex justify-center mt-8">
      <UPagination v-model:page="page" :total="data.total" :items-per-page="data.pageSize" />
    </div>
  </div>
</template>
```

- [ ] **Step 10: `pages/articles/[id].vue`を実装する（詳細に選択言語を反映）**

ファイル全体を次の内容に置き換える：

```vue
<script setup lang="ts">
const route = useRoute()
const { locale } = useLocale()
const { data: article, error } = await useFetch(`/api/articles/${route.params.id}`, {
  query: { lang: locale },
  watch: [locale]
})

if (error.value) {
  throw createError({ statusCode: error.value.statusCode || 404, statusMessage: 'Article not found' })
}
</script>

<template>
  <div v-if="article" class="max-w-2xl mx-auto px-4 py-8">
    <img
      v-if="article.image_url"
      :src="article.image_url"
      :alt="article.title"
      class="w-full aspect-video object-cover rounded-lg mb-6"
    >
    <h1 class="text-3xl font-bold text-highlighted mb-2">{{ article.title }}</h1>
    <time class="text-sm text-muted">{{ article.published_at }}</time>
    <p class="mt-6 leading-relaxed whitespace-pre-wrap">{{ article.body }}</p>
    <p class="mt-8 pt-4 border-t border-default text-sm text-muted">
      <template v-if="article.sources.length > 1">Sources:</template>
      <template v-else>Source:</template>
      <template v-for="(source, index) in article.sources" :key="source.url">
        <a :href="source.url" target="_blank" rel="noopener" class="text-primary underline">{{ source.siteName }}</a><span v-if="index < article.sources.length - 1">, </span>
      </template>
    </p>
  </div>
</template>
```

- [ ] **Step 11: 全体テストを実行し、手動確認を行う**

Run: `npm run test`
Expected: PASS（全テストグリーン）

続けて開発サーバーで目視確認する：

Run: `npm run dev`
確認内容：
- トップページのヘッダーに言語ドロップダウンが表示される
- ドロップダウンで言語を切り替えると、記事一覧のタイトルが（翻訳データがあれば）切り替わる
- リロードしても選択した言語が保持される（localStorage）

- [ ] **Step 12: Commit**

```bash
git add composables/useLocale.ts composables/useLocale.test.ts layouts/default.vue layouts/default.test.ts pages/index.vue pages/articles/[id].vue
git commit -m "feat: add a language selector and wire locale through article pages"
```
