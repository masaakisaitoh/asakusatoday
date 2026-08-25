# 管理画面: 記事ソースURL一覧 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理者が`sources`テーブルの全行(記事の元になった収集URL)を`fetched_at`降順・ページネーション付きで一覧できる、閲覧専用の`/admin/sources`画面を追加する。

**Architecture:** 既存の`/admin/articles`と同じレイヤー構成を踏襲する。`server/utils/sources.ts`(新規)に一覧取得関数`listSources`を追加し、その上に`GET /api/admin/sources`のAPIと、`pages/admin/sources.vue`のUIを重ねる。編集・削除は一切実装しない。

**Tech Stack:** Nuxt 3 / Vue 3 / better-sqlite3 / Nuxt UI v3 (`UCard`, `UBadge`, `UPagination`) / Vitest / `@nuxt/test-utils`

## Global Constraints

- 一覧は常に`fetched_at DESC`、ページサイズは`PAGE_SIZE = 20`(`server/utils/sources.ts`内のプライベート定数)
- APIは`GET /api/admin/sources`のみ実装する。更新・削除エンドポイントは作らない
- 絞り込みフィルタ(`processed_at`の有無など)は実装しない。常に全件を返す
- `/admin/sources`へのナビゲーションリンクは追加しない(URL直打ち運用)
- `url`は画面上で`<a>`タグ(`target="_blank" rel="noopener noreferrer"`)にして遷移可能にする。編集用フォーム要素は一切置かない
- git操作(add/commit等)は人間が行う。各タスクの最後のコミット手順は**実行者が`git`コマンドを直接叩かず、変更内容をまとめて報告し、人間にコミットしてもらう**こと

---

### Task 1: `listSources`を追加する

**Files:**
- Create: `server/utils/sources.ts`
- Test: `server/utils/sources.test.ts`

**Interfaces:**
- Consumes: なし(新規ファイル、`better-sqlite3`の`Database`型のみ利用)
- Produces: `SourceRow`型、`SourceListResult`型、`listSources(db: Database.Database, page: number): SourceListResult` — 後続タスク(Task 2)が`server/api/admin/sources/index.get.ts`から呼び出す

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/sources.test.ts`を新規作成:

```ts
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
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/sources.test.ts`
Expected: FAIL(`./sources`モジュールが存在しない)

- [ ] **Step 3: `listSources`を実装する**

`server/utils/sources.ts`を新規作成:

```ts
import type Database from 'better-sqlite3'

export interface SourceRow {
  id: number
  url: string
  site_name: string
  category: string
  fetched_at: string
  processed_at: string | null
}

export interface SourceListResult {
  sources: SourceRow[]
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 20

export function listSources(db: Database.Database, page: number): SourceListResult {
  const safePage = page < 1 ? 1 : page
  const offset = (safePage - 1) * PAGE_SIZE

  const total = (db.prepare(`SELECT COUNT(*) as count FROM sources`).get() as { count: number }).count

  const sources = db
    .prepare(
      `SELECT id, url, site_name, category, fetched_at, processed_at FROM sources ORDER BY fetched_at DESC LIMIT ? OFFSET ?`
    )
    .all(PAGE_SIZE, offset) as SourceRow[]

  return { sources, total, page: safePage, pageSize: PAGE_SIZE }
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run server/utils/sources.test.ts`
Expected: PASS(2 tests)

- [ ] **Step 5: 変更内容を報告する(人間がコミット)**

変更ファイル: `server/utils/sources.ts`(新規), `server/utils/sources.test.ts`(新規)。コミットメッセージ案: `feat: add listSources for admin source list`

---

### Task 2: `GET /api/admin/sources`エンドポイントを追加する

**Files:**
- Create: `server/api/admin/sources/index.get.ts`
- Test: `tests/api/admin.test.ts`

**Interfaces:**
- Consumes: `useDb`(`server/utils/db.ts`)、`requireAdminUser`(`server/utils/admin.ts`)、`parsePage`(`server/utils/articles.ts`)、`listSources`(`server/utils/sources.ts`、Task 1で追加済み)
- Produces: `GET /api/admin/sources?page=N` → `SourceListResult`をJSONで返す。非管理者は403

- [ ] **Step 1: 失敗するテストを書く**

`tests/api/admin.test.ts`の`insertPublished`関数(61〜82行目)の直後に、`sources`単体を挿入するヘルパーを追加:

```ts
async function insertSource(url: string): Promise<number> {
  const { useDb } = await import('../../server/utils/db')
  const db = useDb()
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO sources (url, site_name, category, raw_text, fetched_at)
       VALUES (?, 'e-asakusa.jp', 'asakusa-area', '元テキスト', datetime('now'))`
    )
    .run(url)
  if (result.changes > 0) return result.lastInsertRowid as number
  const existing = db.prepare(`SELECT id FROM sources WHERE url = ?`).get(url) as { id: number }
  return existing.id
}
```

続けて、既存の`describe('admin drafts API', ...)`ブロックの末尾(`it('rejects non-admin users from the delete endpoint with 403', ...)`の直後、closingの`})`の直前)に2つのテストを追加:

```ts
  it('lists sources for an admin user (admin sources endpoint)', async () => {
    const { cookie, address } = await loginAndGetCookie()
    await makeAdmin(address)
    await insertSource('https://e-asakusa.jp/sources-list-test')

    const result: any = await $fetch('/api/admin/sources', { headers: { cookie } })
    expect(result.sources.some((s: any) => s.url === 'https://e-asakusa.jp/sources-list-test')).toBe(true)
  })

  it('rejects non-admin users from the admin sources endpoint with 403', async () => {
    const { cookie } = await loginAndGetCookie()
    await expect($fetch('/api/admin/sources', { headers: { cookie } })).rejects.toMatchObject({
      statusCode: 403
    })
  })
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/api/admin.test.ts -t "admin sources endpoint"`
Expected: FAIL(`/api/admin/sources`が404を返す)

- [ ] **Step 3: エンドポイントを実装する**

`server/api/admin/sources/index.get.ts`を新規作成:

```ts
import { useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/admin'
import { parsePage } from '../../../utils/articles'
import { listSources } from '../../../utils/sources'

export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const query = getQuery(event)
  const page = parsePage(query.page)
  return listSources(db, page)
})
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/api/admin.test.ts -t "admin sources endpoint"`
Expected: PASS(2 tests)

- [ ] **Step 5: 全体のAPIテストが壊れていないことを確認する**

Run: `npx vitest run tests/api/admin.test.ts`
Expected: PASS(既存9件 + このタスクの2件 = 11件)

- [ ] **Step 6: 変更内容を報告する(人間がコミット)**

変更ファイル: `server/api/admin/sources/index.get.ts`(新規), `tests/api/admin.test.ts`。コミットメッセージ案: `feat: add GET /api/admin/sources endpoint`

---

### Task 3: `/admin/sources`ページを追加する

**Files:**
- Create: `pages/admin/sources.vue`

**Interfaces:**
- Consumes: `GET /api/admin/sources?page=N`(Task 2)が返す`SourceListResult`形状(`{ sources: { id, url, site_name, category, fetched_at, processed_at }[], total, page, pageSize }`)
- Produces: なし(末端のUIページ、他タスクはこれに依存しない)

このページはNuxt UIのトップレベル`await useFetch`を使うテスト困難なコンポーネントであり、`pages/admin/articles.vue`と同じ理由でユニットテストは作らない。代わりに実装後に開発サーバーで手動確認する(Step 2)。

- [ ] **Step 1: ページを実装する**

`pages/admin/sources.vue`を新規作成:

```vue
<script setup lang="ts">
import { computed } from 'vue'

useSeoMeta({ title: 'Source Management', robots: 'noindex, nofollow' })
const route = useRoute()
const router = useRouter()

const page = computed({
  get: () => Number(route.query.page) || 1,
  set: (value: number) => {
    router.push({ path: '/admin/sources', query: { ...route.query, page: value } })
  }
})

const { data, error } = await useFetch('/api/admin/sources', {
  query: { page },
  watch: [page]
})
</script>

<template>
  <div class="h-full overflow-y-auto max-w-3xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold text-primary mb-6">Source Management</h1>
    <p v-if="error" class="text-muted">You do not have access to this page.</p>
    <template v-else>
      <p v-if="data && data.sources.length === 0" class="text-muted">No sources yet.</p>
      <UCard v-for="source in data?.sources" :key="source.id" class="mb-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-sm text-muted">{{ source.site_name }}</span>
          <span class="text-sm text-muted">·</span>
          <span class="text-sm text-muted">{{ source.category }}</span>
          <UBadge :color="source.processed_at ? 'success' : 'neutral'" variant="subtle">
            {{ source.processed_at ? `Processed: ${source.processed_at}` : 'Unprocessed' }}
          </UBadge>
        </div>
        <a
          :href="source.url"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary break-all underline"
        >{{ source.url }}</a>
        <p class="text-sm text-muted mt-2">Fetched: {{ source.fetched_at }}</p>
      </UCard>
      <div v-if="data && data.total > data.pageSize" class="flex justify-center mt-8">
        <UPagination v-model:page="page" :total="data.total" :items-per-page="data.pageSize" />
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 2: 型チェックを実行する**

Run: `npx nuxi typecheck`
Expected: エラーなし(既存の型エラーが元々ある場合は、`pages/admin/sources.vue`に起因する新規エラーがないことを確認する)

- [ ] **Step 3: 開発サーバーで手動確認する**

Run: `npm run dev`

1. 管理者アカウントでログインした状態のブラウザで`http://localhost:3000/admin/sources`を開く
2. `sources`テーブルの行が`fetched_at`降順で一覧表示されることを確認
3. 各行に`site_name`・`category`・`Processed`/`Unprocessed`バッジ・`fetched_at`が表示されることを確認
4. URLがリンクになっており、クリックすると新しいタブで元ページが開くことを確認
5. 編集・削除ボタンが一切存在しないことを確認
6. 21件以上sourcesがある状態でページネーションが機能することを確認
7. 管理者でないアカウントでアクセスすると"You do not have access to this page."が表示されることを確認

手動確認後、`npm run dev`のプロセスを停止する。

- [ ] **Step 4: 変更内容を報告する(人間がコミット)**

変更ファイル: `pages/admin/sources.vue`(新規)。コミットメッセージ案: `feat: add admin source list page`

---

## Self-Review Notes

- **Spec coverage:** Goals(全件一覧・ページネーション・url/site_name/category/fetched_at/processed_at表示・urlのaタグ化)は全てTask 1〜3でカバー。Non-Goals(編集・削除なし・フィルタなし・ナビ導線なし)も実装コードに反映済み(APIはGETのみ、UIにボタン要素なし)。
- **Placeholder scan:** なし。全ステップに実コードあり。
- **Type consistency:** `listSources(db, page: number): SourceListResult`のシグネチャはTask 1〜3で一貫。`SourceListResult`の`sources`フィールドはTask 2のAPIがそのままJSON化し、Task 3の`data.sources`と一致。
