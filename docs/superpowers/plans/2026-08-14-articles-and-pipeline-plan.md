# 記事表示 + 自動生成パイプライン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 浅草の記事を一覧・詳細で表示する機能と、外部サイトからの収集→AI生成→管理者承認による記事投入パイプラインを実装する。

**Architecture:** 既存のNuxt 3（Nitroサーバー）+ better-sqlite3構成に相乗り。`articles`/`sources`テーブルと`users.is_admin`を追加し、収集(`npm run collect`)・生成(`npm run generate`)は独立スクリプト、承認は`/admin/drafts`管理画面で行う。一般公開の一覧・詳細は`status='published'`の記事のみを返す。

**Tech Stack:** Nuxt 3 / Nitro, better-sqlite3, zod, vitest + @nuxt/test-utils/e2e + @vue/test-utils, cheerio（新規）, @anthropic-ai/sdk（新規）, tsx（新規、スクリプト実行用）

## Global Constraints

- テストは既存パターンに従う：`server/utils/*.test.ts`はDB直接操作のユニットテスト、`tests/api/*.test.ts`は`@nuxt/test-utils/e2e`の`setup({server:true})`を使ったAPI結合テスト、`components/*.test.ts`は`@vue/test-utils`。
- e2eテスト（`tests/api/*.test.ts`）でDBに事前データが必要な場合は、`DATABASE_PATH`に一時ファイルパスを指定し、テストプロセス側から直接`useDb()`でINSERTしてからAPIを叩く（`:memory:`はサーバー子プロセスと共有されないため）。
- 記事・下書きAPIはstatusで公開範囲を絞る。一般公開APIは`status='published'`以外を404扱いする。
- 管理API（`/api/admin/*`）は`is_admin`ユーザーのみ、それ以外は403。
- 各タスクの最後に`npm test`ではなく該当ファイルのみ`npx vitest run <path>`で確認してからコミットする（他タスクの一時的な失敗に引きずられないため）。全タスク完了後に`npm test`で全体確認する。
- コミットメッセージは日本語可・英語可どちらでもよいが、本プランでは英語の短い一文で統一する。

---

### Task 1: DBスキーマ拡張（articles, sources, users.is_admin）

**Files:**
- Modify: `server/utils/db.ts`
- Modify: `server/utils/session.ts`
- Modify: `server/utils/db.test.ts`

**Interfaces:**
- Produces: `useDb()`が返すDBに`articles`, `sources`テーブル、`users.is_admin`カラムが存在する。`UserRow`インターフェースに`is_admin: number`が追加される。

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/db.test.ts`を以下の内容に置き換える：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

beforeEach(() => {
  process.env.DATABASE_PATH = ':memory:'
})

describe('useDb', () => {
  it('creates users, nonces, sessions, sources, articles tables', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row: any) => row.name)
    expect(tables).toEqual(
      expect.arrayContaining(['users', 'nonces', 'sessions', 'sources', 'articles'])
    )
  })

  it('creates a fresh users table with an is_admin column', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const columns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[]
    expect(columns.some((c) => c.name === 'is_admin')).toBe(true)
  })

  it('migrates an existing users table without is_admin', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'asakusa-migrate-'))
    const path = join(dir, 'legacy.sqlite3')

    const legacyDb = new Database(path)
    legacyDb.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        address TEXT UNIQUE NOT NULL,
        public_key TEXT NOT NULL,
        user_name TEXT UNIQUE NOT NULL,
        gender TEXT,
        birth_year INTEGER,
        nationality TEXT,
        avatar_seed TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)
    legacyDb
      .prepare(
        `INSERT INTO users (address, public_key, user_name, avatar_seed, created_at)
         VALUES ('addr1', 'pub1', 'LegacyUser000001', 'seed1', datetime('now'))`
      )
      .run()
    legacyDb.close()

    process.env.DATABASE_PATH = path
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()

    const columns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[]
    expect(columns.some((c) => c.name === 'is_admin')).toBe(true)

    const user = db.prepare('SELECT is_admin FROM users WHERE address = ?').get('addr1') as {
      is_admin: number
    }
    expect(user.is_admin).toBe(0)

    rmSync(dir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run server/utils/db.test.ts`
Expected: FAIL（`sources`/`articles`テーブルが存在しない、`is_admin`カラムが存在しない）

- [ ] **Step 3: `server/utils/db.ts`を実装**

`server/utils/db.ts`を以下に置き換える：

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
  raw_text TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL
);
`

function migrate(database: Database.Database): void {
  const columns = database.prepare('PRAGMA table_info(users)').all() as { name: string }[]
  if (!columns.some((c) => c.name === 'is_admin')) {
    database.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0')
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

- [ ] **Step 4: `server/utils/session.ts`のUserRowにis_adminを追加**

`server/utils/session.ts`の`UserRow`インターフェースを以下に変更する（該当ブロックのみ差し替え）：

```ts
export interface UserRow {
  id: number
  address: string
  public_key: string
  user_name: string
  gender: string | null
  birth_year: number | null
  nationality: string | null
  avatar_seed: string
  is_admin: number
  created_at: string
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npx vitest run server/utils/db.test.ts`
Expected: PASS

- [ ] **Step 6: 既存テストが壊れていないことを確認**

Run: `npx vitest run server/utils/username.test.ts tests/api/auth.test.ts tests/api/user.test.ts`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add server/utils/db.ts server/utils/db.test.ts server/utils/session.ts
git commit -m "feat: add articles, sources tables and users.is_admin column"
```

---

### Task 2: 記事取得ユーティリティ（server/utils/articles.ts）

**Files:**
- Create: `server/utils/articles.ts`
- Create: `server/utils/articles.test.ts`

**Interfaces:**
- Consumes: `useDb()` from `./db`（Task 1）
- Produces: `ArticleRow`型、`listPublishedArticles(db, page): ArticleListResult`、`getPublishedArticleById(db, id): ArticleRow | undefined`

- [ ] **Step 1: 失敗するテストを書く**

Create `server/utils/articles.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'

beforeEach(() => {
  process.env.DATABASE_PATH = ':memory:'
})

function insertArticle(
  db: Database.Database,
  overrides: { title?: string; status?: string; publishedAt?: string | null } = {}
) {
  db.prepare(
    `INSERT INTO articles (title, body, status, source_url, source_name, published_at, created_at)
     VALUES (?, ?, ?, 'https://example.com', 'Example', ?, datetime('now'))`
  ).run(overrides.title ?? 'Title', 'Body', overrides.status ?? 'published', overrides.publishedAt ?? '2026-01-01T00:00:00Z')
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
})

describe('getPublishedArticleById', () => {
  it('returns undefined for a draft article', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    insertArticle(db, { status: 'draft' })
    const id = (db.prepare('SELECT id FROM articles').get() as { id: number }).id

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

  it('returns the article for a published id', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    insertArticle(db, { title: 'Findable' })
    const id = (db.prepare('SELECT id FROM articles').get() as { id: number }).id

    const { getPublishedArticleById } = await import('./articles')
    const article = getPublishedArticleById(db, id)
    expect(article?.title).toBe('Findable')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run server/utils/articles.test.ts`
Expected: FAIL（`./articles`が存在しない）

- [ ] **Step 3: `server/utils/articles.ts`を実装**

```ts
import type Database from 'better-sqlite3'

export interface ArticleRow {
  id: number
  title: string
  body: string
  image_url: string | null
  status: string
  source_url: string
  source_name: string
  published_at: string | null
  created_at: string
}

export interface ArticleListResult {
  articles: ArticleRow[]
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 10

export function listPublishedArticles(db: Database.Database, page: number): ArticleListResult {
  const safePage = page < 1 ? 1 : page
  const offset = (safePage - 1) * PAGE_SIZE

  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM articles WHERE status = 'published'`).get() as {
      count: number
    }
  ).count

  const articles = db
    .prepare(
      `SELECT * FROM articles WHERE status = 'published' ORDER BY published_at DESC LIMIT ? OFFSET ?`
    )
    .all(PAGE_SIZE, offset) as ArticleRow[]

  return { articles, total, page: safePage, pageSize: PAGE_SIZE }
}

export function getPublishedArticleById(db: Database.Database, id: number): ArticleRow | undefined {
  return db.prepare(`SELECT * FROM articles WHERE id = ? AND status = 'published'`).get(id) as
    | ArticleRow
    | undefined
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run server/utils/articles.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add server/utils/articles.ts server/utils/articles.test.ts
git commit -m "feat: add published article list/get query utilities"
```

---

### Task 3: 記事一覧・詳細API

**Files:**
- Create: `server/api/articles/index.get.ts`
- Create: `server/api/articles/[id].get.ts`
- Create: `tests/api/articles.test.ts`

**Interfaces:**
- Consumes: `listPublishedArticles`, `getPublishedArticleById` from `../../utils/articles`（Task 2）
- Produces: `GET /api/articles?page=` → `ArticleListResult`、`GET /api/articles/:id` → `ArticleRow`（404 on not found/draft）

- [ ] **Step 1: 失敗するテストを書く**

Create `tests/api/articles.test.ts`:

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
    db.prepare(
      `INSERT INTO articles (title, body, status, source_url, source_name, published_at, created_at)
       VALUES (?, ?, 'published', 'https://example.com', 'Example', ?, datetime('now'))`
    ).run('公開記事', '本文です', '2026-01-01T00:00:00Z')
    db.prepare(
      `INSERT INTO articles (title, body, status, source_url, source_name, created_at)
       VALUES (?, ?, 'draft', 'https://example.com', 'Example', datetime('now'))`
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

  it('returns the published article by id', async () => {
    const list: any = await $fetch('/api/articles')
    const id = list.articles[0].id
    const article: any = await $fetch(`/api/articles/${id}`)
    expect(article.title).toBe('公開記事')
    expect(article.body).toBe('本文です')
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

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/api/articles.test.ts`
Expected: FAIL（`/api/articles`が存在しない）

- [ ] **Step 3: APIエンドポイントを実装**

Create `server/api/articles/index.get.ts`:

```ts
import { useDb } from '../../utils/db'
import { listPublishedArticles } from '../../utils/articles'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const page = Number(query.page) || 1
  const db = useDb()
  return listPublishedArticles(db, page)
})
```

Create `server/api/articles/[id].get.ts`:

```ts
import { useDb } from '../../utils/db'
import { getPublishedArticleById } from '../../utils/articles'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const article = getPublishedArticleById(db, id)
  if (!article) {
    throw createError({ statusCode: 404, message: 'Article not found' })
  }
  return article
})
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/api/articles.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add server/api/articles tests/api/articles.test.ts
git commit -m "feat: add published article list/detail API"
```

---

### Task 4: ArticleCardコンポーネント

**Files:**
- Create: `components/ArticleCard.vue`
- Create: `components/ArticleCard.test.ts`

**Interfaces:**
- Produces: `<ArticleCard :id :title :image-url :published-at />`（`/articles/:id`へのリンク）

- [ ] **Step 1: 失敗するテストを書く**

Create `components/ArticleCard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ArticleCard from './ArticleCard.vue'

const stubs = { NuxtLink: { template: '<a><slot /></a>' } }

describe('ArticleCard', () => {
  it('renders the title and published date', () => {
    const wrapper = mount(ArticleCard, {
      props: { id: 1, title: 'テスト記事', publishedAt: '2026-08-14', imageUrl: null },
      global: { stubs }
    })
    expect(wrapper.text()).toContain('テスト記事')
    expect(wrapper.text()).toContain('2026-08-14')
  })

  it('renders an image when imageUrl is provided', () => {
    const wrapper = mount(ArticleCard, {
      props: { id: 1, title: 'テスト記事', publishedAt: '2026-08-14', imageUrl: 'https://example.com/a.jpg' },
      global: { stubs }
    })
    expect(wrapper.find('img').exists()).toBe(true)
  })

  it('does not render an image when imageUrl is absent', () => {
    const wrapper = mount(ArticleCard, {
      props: { id: 1, title: 'テスト記事', publishedAt: '2026-08-14' },
      global: { stubs }
    })
    expect(wrapper.find('img').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run components/ArticleCard.test.ts`
Expected: FAIL（`./ArticleCard.vue`が存在しない）

- [ ] **Step 3: コンポーネントを実装**

Create `components/ArticleCard.vue`:

```vue
<script setup lang="ts">
defineProps<{
  id: number
  title: string
  publishedAt: string
  imageUrl?: string | null
}>()
</script>

<template>
  <NuxtLink :to="`/articles/${id}`" class="article-card">
    <img v-if="imageUrl" :src="imageUrl" :alt="title">
    <h2>{{ title }}</h2>
    <time>{{ publishedAt }}</time>
  </NuxtLink>
</template>
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run components/ArticleCard.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add components/ArticleCard.vue components/ArticleCard.test.ts
git commit -m "feat: add ArticleCard component"
```

---

### Task 5: 記事一覧ページ（トップページ差し替え）

**Files:**
- Modify: `pages/index.vue`

**Interfaces:**
- Consumes: `GET /api/articles?page=`（Task 3）, `ArticleCard`（Task 4）

- [ ] **Step 1: `pages/index.vue`を実装**

`pages/index.vue`を以下に置き換える：

```vue
<script setup lang="ts">
import { computed } from 'vue'

const route = useRoute()
const page = computed(() => Number(route.query.page) || 1)

const { data } = await useFetch('/api/articles', {
  query: { page },
  watch: [page]
})

const totalPages = computed(() => {
  if (!data.value) return 1
  return Math.max(1, Math.ceil(data.value.total / data.value.pageSize))
})
</script>

<template>
  <div>
    <h1>ASAKUSA TODAY</h1>
    <div v-if="data && data.articles.length === 0">記事がありません</div>
    <ArticleCard
      v-for="article in data?.articles"
      :id="article.id"
      :key="article.id"
      :title="article.title"
      :image-url="article.image_url"
      :published-at="article.published_at ?? ''"
    />
    <div v-if="totalPages > 1" class="pagination">
      <NuxtLink v-if="page > 1" :to="{ path: '/', query: { page: page - 1 } }">前へ</NuxtLink>
      <span>{{ page }} / {{ totalPages }}</span>
      <NuxtLink v-if="page < totalPages" :to="{ path: '/', query: { page: page + 1 } }">次へ</NuxtLink>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 既存のスモークテストが通ることを確認**

`tests/smoke.test.ts`は`/`が"ASAKUSA TODAY"を含むことだけを確認しているため、そのまま通るはず。

Run: `npx vitest run tests/smoke.test.ts`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add pages/index.vue
git commit -m "feat: replace top page with published article list"
```

---

### Task 6: 記事詳細ページ

**Files:**
- Create: `pages/articles/[id].vue`

**Interfaces:**
- Consumes: `GET /api/articles/:id`（Task 3）

- [ ] **Step 1: ページを実装**

Create `pages/articles/[id].vue`:

```vue
<script setup lang="ts">
const route = useRoute()
const { data: article, error } = await useFetch(`/api/articles/${route.params.id}`)

if (error.value) {
  throw createError({ statusCode: error.value.statusCode || 404, statusMessage: '記事が見つかりません' })
}
</script>

<template>
  <div v-if="article">
    <h1>{{ article.title }}</h1>
    <img v-if="article.image_url" :src="article.image_url" :alt="article.title">
    <time>{{ article.published_at }}</time>
    <p>{{ article.body }}</p>
    <p class="source">
      出典:
      <a :href="article.source_url" target="_blank" rel="noopener">{{ article.source_name }}</a>
    </p>
  </div>
</template>
```

- [ ] **Step 2: 手動確認（開発サーバー）**

Run: `npm run dev` を起動し、シードデータなしの状態で`/articles/1`にアクセスして404ページが出ること、Ctrl+Cで停止する。（このタスクの時点ではまだデータ投入手段がないため、自動テストはTask 3のAPIテストでカバー済みとする。）

- [ ] **Step 3: コミット**

```bash
git add pages/articles
git commit -m "feat: add article detail page"
```

---

### Task 7: パイプライン用の依存関係と収集対象リスト

**Files:**
- Modify: `package.json`
- Create: `server/config/sources.ts`

**Interfaces:**
- Produces: `SOURCE_SITES: SourceSite[]`、`npm run collect` / `npm run generate` コマンドの土台

- [ ] **Step 1: 依存関係を追加**

Run:
```bash
npm install cheerio @anthropic-ai/sdk
npm install -D tsx
```

- [ ] **Step 2: package.jsonにスクリプトを追加**

`package.json`の`scripts`に以下を追加する：

```json
    "collect": "tsx scripts/collect.ts",
    "generate": "tsx scripts/generate.ts"
```

- [ ] **Step 3: 収集対象URLリストを作成**

Create `server/config/sources.ts`:

```ts
export interface SourceSite {
  url: string
  siteName: string
}

export const SOURCE_SITES: SourceSite[] = [
  { url: 'https://e-asakusa.jp/', siteName: 'e-asakusa.jp' }
]
```

- [ ] **Step 4: 既存テストが壊れていないことを確認**

Run: `npm test`
Expected: PASS（全テスト）

- [ ] **Step 5: コミット**

```bash
git add package.json package-lock.json server/config/sources.ts
git commit -m "chore: add cheerio, anthropic sdk, and tsx dependencies"
```

---

### Task 8: 収集ユーティリティ（server/utils/collector.ts）+ npm run collect

**Files:**
- Create: `server/utils/collector.ts`
- Create: `server/utils/collector.test.ts`
- Create: `scripts/collect.ts`

**Interfaces:**
- Consumes: `SourceSite` from `../config/sources`（Task 7）, `useDb()` from `./db`（Task 1）
- Produces: `extractArticleText(html): string`、`collectSource(db, site, fetchFn?): Promise<'inserted'|'skipped'|'error'>`、`collectAllSources(db, sites, fetchFn?): Promise<{inserted, skipped, error}>`

- [ ] **Step 1: 失敗するテストを書く**

Create `server/utils/collector.test.ts`:

```ts
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
    const site: SourceSite = { url: 'https://e-asakusa.jp/', siteName: 'e-asakusa.jp' }
    const fetchFn = fakeFetch({ 'https://e-asakusa.jp/': { ok: true, text: '<p>本文</p>' } })

    const result = await collectSource(db, site, fetchFn)

    expect(result).toBe('inserted')
    const row = db.prepare('SELECT * FROM sources').get() as any
    expect(row.url).toBe('https://e-asakusa.jp/')
    expect(row.raw_text).toContain('本文')
  })

  it('skips a url that was already collected', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db: Database.Database = useDb()
    const { collectSource } = await import('./collector')
    const site: SourceSite = { url: 'https://e-asakusa.jp/', siteName: 'e-asakusa.jp' }
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
    const site: SourceSite = { url: 'https://e-asakusa.jp/broken', siteName: 'e-asakusa.jp' }
    const fetchFn = fakeFetch({ 'https://e-asakusa.jp/broken': { ok: false, text: '' } })

    const result = await collectSource(db, site, fetchFn)
    expect(result).toBe('error')
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
      { url: 'https://a.example/', siteName: 'a' },
      { url: 'https://b.example/', siteName: 'b' }
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
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run server/utils/collector.test.ts`
Expected: FAIL（`./collector`が存在しない）

- [ ] **Step 3: `server/utils/collector.ts`を実装**

```ts
import * as cheerio from 'cheerio'
import type Database from 'better-sqlite3'
import type { SourceSite } from '../config/sources'

export function extractArticleText(html: string): string {
  const $ = cheerio.load(html)
  $('script, style, nav, header, footer').remove()
  return $('body').text().replace(/\s+/g, ' ').trim()
}

export async function collectSource(
  db: Database.Database,
  site: SourceSite,
  fetchFn: typeof fetch = fetch
): Promise<'inserted' | 'skipped' | 'error'> {
  try {
    const response = await fetchFn(site.url)
    if (!response.ok) return 'error'
    const html = await response.text()
    const rawText = extractArticleText(html)
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO sources (url, site_name, raw_text, fetched_at) VALUES (?, ?, ?, datetime('now'))`
      )
      .run(site.url, site.siteName, rawText)
    return result.changes > 0 ? 'inserted' : 'skipped'
  } catch {
    return 'error'
  }
}

export async function collectAllSources(
  db: Database.Database,
  sites: SourceSite[],
  fetchFn: typeof fetch = fetch
): Promise<{ inserted: number; skipped: number; error: number }> {
  const counts = { inserted: 0, skipped: 0, error: 0 }
  for (const site of sites) {
    const result = await collectSource(db, site, fetchFn)
    counts[result]++
  }
  return counts
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run server/utils/collector.test.ts`
Expected: PASS

- [ ] **Step 5: `npm run collect`エントリーポイントを作成**

Create `scripts/collect.ts`:

```ts
import { useDb } from '../server/utils/db'
import { collectAllSources } from '../server/utils/collector'
import { SOURCE_SITES } from '../server/config/sources'

async function main() {
  const db = useDb()
  const result = await collectAllSources(db, SOURCE_SITES)
  console.log(`収集完了: 新規${result.inserted}件, スキップ${result.skipped}件, エラー${result.error}件`)
}

main()
```

- [ ] **Step 6: コミット**

```bash
git add server/utils/collector.ts server/utils/collector.test.ts scripts/collect.ts
git commit -m "feat: add source collection utility and npm run collect script"
```

---

### Task 9: 記事生成ユーティリティ（server/utils/generator.ts）+ npm run generate

**Files:**
- Create: `server/utils/generator.ts`
- Create: `server/utils/generator.test.ts`
- Create: `scripts/generate.ts`

**Interfaces:**
- Consumes: `useDb()` from `./db`（Task 1）
- Produces: `MessageClient`型、`buildGenerationPrompt`、`parseGeneratedArticle`、`generateArticleFromSource`、`generateDraftsForUnprocessedSources(db, client): Promise<{generated, failed}>`

- [ ] **Step 1: 失敗するテストを書く**

Create `server/utils/generator.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { MessageClient } from './generator'

describe('buildGenerationPrompt', () => {
  it('includes the source text, site name, and source url', async () => {
    const { buildGenerationPrompt } = await import('./generator')
    const prompt = buildGenerationPrompt('元の本文', 'e-asakusa.jp', 'https://e-asakusa.jp/news/1')
    expect(prompt).toContain('元の本文')
    expect(prompt).toContain('e-asakusa.jp')
    expect(prompt).toContain('https://e-asakusa.jp/news/1')
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

describe('generateArticleFromSource', () => {
  it('returns the parsed article from the model response', async () => {
    const { generateArticleFromSource } = await import('./generator')
    const client = fakeClient('{"title": "生成タイトル", "body": "生成本文"}')
    const article = await generateArticleFromSource(client, '元テキスト', 'e-asakusa.jp', 'https://e-asakusa.jp/')
    expect(article).toEqual({ title: '生成タイトル', body: '生成本文' })
  })
})

describe('generateDraftsForUnprocessedSources', () => {
  it('inserts a draft article and marks the source processed', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO sources (url, site_name, raw_text, fetched_at) VALUES (?, ?, ?, datetime('now'))`
    ).run('https://e-asakusa.jp/news/1', 'e-asakusa.jp', '元の本文')

    const { generateDraftsForUnprocessedSources } = await import('./generator')
    const client = fakeClient('{"title": "生成タイトル", "body": "生成本文"}')
    const result = await generateDraftsForUnprocessedSources(db, client)

    expect(result).toEqual({ generated: 1, failed: 0 })
    const article = db.prepare(`SELECT * FROM articles WHERE status = 'draft'`).get() as any
    expect(article.title).toBe('生成タイトル')
    expect(article.source_url).toBe('https://e-asakusa.jp/news/1')
    const source = db.prepare('SELECT processed_at FROM sources').get() as any
    expect(source.processed_at).not.toBeNull()
  })

  it('skips a source and counts it as failed when generation throws', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO sources (url, site_name, raw_text, fetched_at) VALUES (?, ?, ?, datetime('now'))`
    ).run('https://e-asakusa.jp/news/2', 'e-asakusa.jp', '元の本文2')

    const { generateDraftsForUnprocessedSources } = await import('./generator')
    const client: MessageClient = {
      messages: {
        create: async () => {
          throw new Error('API error')
        }
      }
    }
    const result = await generateDraftsForUnprocessedSources(db, client)

    expect(result).toEqual({ generated: 0, failed: 1 })
    const source = db.prepare('SELECT processed_at FROM sources').get() as any
    expect(source.processed_at).toBeNull()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run server/utils/generator.test.ts`
Expected: FAIL（`./generator`が存在しない）

- [ ] **Step 3: `server/utils/generator.ts`を実装**

```ts
import type Database from 'better-sqlite3'

export interface GeneratedArticle {
  title: string
  body: string
}

export interface MessageClient {
  messages: {
    create(params: {
      model: string
      max_tokens: number
      messages: { role: 'user'; content: string }[]
    }): Promise<{ content: Array<{ type: string; text?: string }> }>
  }
}

export function buildGenerationPrompt(rawText: string, siteName: string, sourceUrl: string): string {
  return `あなたは浅草の地域ニュースサイト「ASAKUSA TODAY」の編集者です。
以下は ${siteName}（${sourceUrl}）から収集した本文です。

この内容をもとに、日本語のニュース記事を作成してください。
- 要約・リライトであること。元の文章の丸写しは絶対にしないこと。
- 事実を捏造しないこと。元の文章に書かれていない情報を追加しないこと。
- タイトルは記事の内容を端的に表す一文にすること。

出力は以下のJSON形式のみとし、他の文章は含めないこと：
{"title": "...", "body": "..."}

---
${rawText}
---`
}

export function parseGeneratedArticle(responseText: string): GeneratedArticle {
  const parsed = JSON.parse(responseText)
  if (typeof parsed.title !== 'string' || typeof parsed.body !== 'string') {
    throw new Error('Invalid generated article shape')
  }
  return { title: parsed.title, body: parsed.body }
}

export async function generateArticleFromSource(
  client: MessageClient,
  rawText: string,
  siteName: string,
  sourceUrl: string
): Promise<GeneratedArticle> {
  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: buildGenerationPrompt(rawText, siteName, sourceUrl) }]
  })
  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock?.text) throw new Error('No text content in response')
  return parseGeneratedArticle(textBlock.text)
}

interface UnprocessedSource {
  id: number
  url: string
  site_name: string
  raw_text: string
}

export async function generateDraftsForUnprocessedSources(
  db: Database.Database,
  client: MessageClient
): Promise<{ generated: number; failed: number }> {
  const sources = db
    .prepare(`SELECT id, url, site_name, raw_text FROM sources WHERE processed_at IS NULL`)
    .all() as UnprocessedSource[]

  let generated = 0
  let failed = 0

  for (const source of sources) {
    try {
      const article = await generateArticleFromSource(client, source.raw_text, source.site_name, source.url)
      db.prepare(
        `INSERT INTO articles (title, body, status, source_url, source_name, created_at)
         VALUES (?, ?, 'draft', ?, ?, datetime('now'))`
      ).run(article.title, article.body, source.url, source.site_name)
      db.prepare(`UPDATE sources SET processed_at = datetime('now') WHERE id = ?`).run(source.id)
      generated++
    } catch {
      failed++
    }
  }

  return { generated, failed }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run server/utils/generator.test.ts`
Expected: PASS

- [ ] **Step 5: `npm run generate`エントリーポイントを作成**

Create `scripts/generate.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { useDb } from '../server/utils/db'
import { generateDraftsForUnprocessedSources } from '../server/utils/generator'

async function main() {
  const db = useDb()
  const client = new Anthropic()
  const result = await generateDraftsForUnprocessedSources(db, client)
  console.log(`生成完了: 成功${result.generated}件, 失敗${result.failed}件`)
}

main()
```

- [ ] **Step 6: コミット**

```bash
git add server/utils/generator.ts server/utils/generator.test.ts scripts/generate.ts
git commit -m "feat: add AI draft generation utility and npm run generate script"
```

---

### Task 10: 管理者権限チェック（server/utils/admin.ts）

**Files:**
- Create: `server/utils/admin.ts`
- Create: `server/utils/admin.test.ts`

**Interfaces:**
- Consumes: `requireSessionUser` from `./session`（既存）, `UserRow`（Task 1でis_admin追加済み）
- Produces: `requireAdminUser(db, event): UserRow`（403 when not admin）

- [ ] **Step 1: 失敗するテストを書く**

Create `server/utils/admin.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createEvent } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'

function fakeEvent() {
  const req = new IncomingMessage(new Socket())
  const res = new ServerResponse(req)
  return createEvent(req, res)
}

describe('requireAdminUser', () => {
  it('throws 403 for a logged-in non-admin user', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO users (address, public_key, user_name, avatar_seed, is_admin, created_at)
       VALUES ('addr1', 'pub1', 'NonAdmin00000001', 'seed1', 0, datetime('now'))`
    ).run()
    const userId = (db.prepare('SELECT id FROM users').get() as { id: number }).id
    db.prepare(
      `INSERT INTO sessions (id, user_id, expires_at, created_at)
       VALUES ('session1', ?, ?, datetime('now'))`
    ).run(userId, new Date(Date.now() + 60000).toISOString())

    const event = fakeEvent()
    event.node.req.headers.cookie = 'session_id=session1'

    const { requireAdminUser } = await import('./admin')
    expect(() => requireAdminUser(db, event)).toThrow()
  })

  it('returns the user for a logged-in admin user', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO users (address, public_key, user_name, avatar_seed, is_admin, created_at)
       VALUES ('addr2', 'pub2', 'AdminUser0000001', 'seed2', 1, datetime('now'))`
    ).run()
    const userId = (db.prepare('SELECT id FROM users').get() as { id: number }).id
    db.prepare(
      `INSERT INTO sessions (id, user_id, expires_at, created_at)
       VALUES ('session2', ?, ?, datetime('now'))`
    ).run(userId, new Date(Date.now() + 60000).toISOString())

    const event = fakeEvent()
    event.node.req.headers.cookie = 'session_id=session2'

    const { requireAdminUser } = await import('./admin')
    const user = requireAdminUser(db, event)
    expect(user.user_name).toBe('AdminUser0000001')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run server/utils/admin.test.ts`
Expected: FAIL（`./admin`が存在しない）

- [ ] **Step 3: `server/utils/admin.ts`を実装**

```ts
import type Database from 'better-sqlite3'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { requireSessionUser, type UserRow } from './session'

export function requireAdminUser(db: Database.Database, event: H3Event): UserRow {
  const user = requireSessionUser(db, event)
  if (!user.is_admin) {
    throw createError({ statusCode: 403, message: '管理者権限が必要です' })
  }
  return user
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run server/utils/admin.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add server/utils/admin.ts server/utils/admin.test.ts
git commit -m "feat: add requireAdminUser helper"
```

---

### Task 11: 管理API（下書き一覧・承認・却下）

**Files:**
- Create: `server/api/admin/drafts/index.get.ts`
- Create: `server/api/admin/drafts/[id]/publish.post.ts`
- Create: `server/api/admin/drafts/[id]/reject.post.ts`
- Create: `tests/api/admin.test.ts`

**Interfaces:**
- Consumes: `requireAdminUser` from `../../utils/admin`（Task 10）
- Produces: `GET /api/admin/drafts`, `POST /api/admin/drafts/:id/publish`, `POST /api/admin/drafts/:id/reject`

- [ ] **Step 1: 失敗するテストを書く**

Create `tests/api/admin.test.ts`:

```ts
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
    `INSERT OR IGNORE INTO sources (url, site_name, raw_text, fetched_at) VALUES (?, 'e-asakusa.jp', '元テキスト', datetime('now'))`
  ).run(sourceUrl)
  db.prepare(
    `INSERT INTO articles (title, body, status, source_url, source_name, created_at)
     VALUES ('下書きタイトル', '下書き本文', 'draft', ?, 'e-asakusa.jp', datetime('now'))`
  ).run(sourceUrl)
  const row = db
    .prepare(`SELECT id FROM articles WHERE source_url = ? ORDER BY id DESC LIMIT 1`)
    .get(sourceUrl) as { id: number }
  return row.id
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
    expect(drafts.some((d: any) => d.source_url === 'https://e-asakusa.jp/list-test')).toBe(true)
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

    await $fetch(`/api/admin/drafts/${id}/reject`, { method: 'POST', headers: { cookie } })

    const { useDb } = await import('../../server/utils/db')
    const db = useDb()
    const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(id)
    expect(article).toBeUndefined()
    const source = db.prepare('SELECT processed_at FROM sources WHERE url = ?').get(sourceUrl) as any
    expect(source.processed_at).toBeNull()
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/api/admin.test.ts`
Expected: FAIL（`/api/admin/drafts`が存在しない）

- [ ] **Step 3: 管理APIを実装**

Create `server/api/admin/drafts/index.get.ts`:

```ts
import { useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/admin'

export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  return db.prepare(`SELECT * FROM articles WHERE status = 'draft' ORDER BY created_at DESC`).all()
})
```

Create `server/api/admin/drafts/[id]/publish.post.ts`:

```ts
import { useDb } from '../../../../utils/db'
import { requireAdminUser } from '../../../../utils/admin'

export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const id = Number(getRouterParam(event, 'id'))
  const article = db.prepare(`SELECT * FROM articles WHERE id = ? AND status = 'draft'`).get(id)
  if (!article) {
    throw createError({ statusCode: 404, message: 'Draft not found' })
  }
  db.prepare(`UPDATE articles SET status = 'published', published_at = datetime('now') WHERE id = ?`).run(id)
  return db.prepare(`SELECT * FROM articles WHERE id = ?`).get(id)
})
```

Create `server/api/admin/drafts/[id]/reject.post.ts`:

```ts
import { useDb } from '../../../../utils/db'
import { requireAdminUser } from '../../../../utils/admin'

export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const id = Number(getRouterParam(event, 'id'))
  const article = db.prepare(`SELECT * FROM articles WHERE id = ? AND status = 'draft'`).get(id) as
    | { source_url: string }
    | undefined
  if (!article) {
    throw createError({ statusCode: 404, message: 'Draft not found' })
  }
  db.prepare(`DELETE FROM articles WHERE id = ?`).run(id)
  db.prepare(`UPDATE sources SET processed_at = NULL WHERE url = ?`).run(article.source_url)
  return { ok: true }
})
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/api/admin.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add server/api/admin tests/api/admin.test.ts
git commit -m "feat: add admin drafts list/publish/reject API"
```

---

### Task 12: 管理画面ページ（/admin/drafts）

**Files:**
- Create: `pages/admin/drafts.vue`

**Interfaces:**
- Consumes: `GET /api/admin/drafts`, `POST /api/admin/drafts/:id/publish`, `POST /api/admin/drafts/:id/reject`（Task 11）

- [ ] **Step 1: ページを実装**

Create `pages/admin/drafts.vue`:

```vue
<script setup lang="ts">
const { data: drafts, error, refresh } = await useFetch('/api/admin/drafts')

async function publish(id: number) {
  await $fetch(`/api/admin/drafts/${id}/publish`, { method: 'POST' })
  await refresh()
}

async function reject(id: number) {
  await $fetch(`/api/admin/drafts/${id}/reject`, { method: 'POST' })
  await refresh()
}
</script>

<template>
  <div>
    <h1>下書き一覧</h1>
    <div v-if="error">アクセス権限がありません</div>
    <template v-else>
      <div v-if="drafts && drafts.length === 0">下書きはありません</div>
      <article v-for="draft in drafts" :key="draft.id">
        <h2>{{ draft.title }}</h2>
        <p>{{ draft.body }}</p>
        <p class="source">出典: {{ draft.source_name }}（{{ draft.source_url }}）</p>
        <button @click="publish(draft.id)">承認</button>
        <button @click="reject(draft.id)">却下</button>
      </article>
    </template>
  </div>
</template>
```

- [ ] **Step 2: 全体テストを実行**

Run: `npm test`
Expected: PASS（全テストスイート）

- [ ] **Step 3: 手動確認（開発サーバー）**

Run: `npm run dev`を起動し、`/admin/drafts`に未ログインでアクセスして401/エラー表示になること、`npm run collect` → `npm run generate`実行後に下書きが生成されていることを確認する（`ANTHROPIC_API_KEY`環境変数が必要）。確認後Ctrl+Cで停止。

- [ ] **Step 4: コミット**

```bash
git add pages/admin
git commit -m "feat: add admin drafts review page"
```
