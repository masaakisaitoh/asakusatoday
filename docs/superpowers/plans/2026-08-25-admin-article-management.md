# 管理画面: 記事一覧・公開記事削除 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理者が全ステータスの記事を一覧・ページネーションで確認でき、公開済みの記事を確認ダイアログ付きで削除できる`/admin/articles`画面を追加する。

**Architecture:** 既存の`/admin/drafts`(下書き承認画面)と同じレイヤー構成を踏襲する。`server/utils/articles.ts`に一覧取得関数`listAllArticles`とカスケード削除関数`deleteArticleRows`を追加し、`reject.post.ts`の既存の削除処理もこの共通関数を使うようリファクタリングする。その上に`GET /api/admin/articles`・`DELETE /api/admin/articles/:id`のAPIと、`pages/admin/articles.vue`のUIを重ねる。

**Tech Stack:** Nuxt 3 / Vue 3 / better-sqlite3 / Nuxt UI v3 (`UCard`, `UButton`, `UBadge`, `UModal`, `UPagination`) / Vitest / `@nuxt/test-utils`

## Global Constraints

- 管理画面のAPIレスポンスは常に`locale = 'ja'`固定(`/admin/drafts`と同じ、localeクエリは受け付けない)
- 一覧は常に`created_at DESC`、ページサイズは既存の`PAGE_SIZE = 5`(`server/utils/articles.ts`内のプライベート定数、変更しない)
- 削除ボタンは`status = 'published'`の記事にのみ表示・許可する。draft等は404で拒否する
- 公開済み記事を削除しても、関連`sources`テーブルの`processed_at`はリセットしない(下書き却下時の挙動とは異なる、意図的な設計)
- `/admin/articles`へのナビゲーションリンクは追加しない(URL直打ち運用)
- git操作(add/commit等)は人間が行う。各タスクの最後のコミット手順は**実行者が`git`コマンドを直接叩かず、変更内容をまとめて報告し、人間にコミットしてもらう**こと

---

### Task 1: `listAllArticles`を追加する

**Files:**
- Modify: `server/utils/articles.ts`
- Test: `server/utils/articles.test.ts`

**Interfaces:**
- Consumes: 既存の`ArticleColumns`型、`ARTICLE_COLUMNS_SQL`定数、`attachArticleTranslations`、`attachArticleSources`、`ArticleListResult`型、`TranslationLocale`型(すべて同ファイル内で既に定義済み)
- Produces: `listAllArticles(db: Database.Database, page: number, locale: TranslationLocale): ArticleListResult` — 後続タスク(Task 3)が`server/api/admin/articles/index.get.ts`から呼び出す

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/articles.test.ts`の`describe('listDraftArticles', ...)`ブロックの直後(243行目の`})`の後、`describe('getPublishedArticleById', ...)`の直前)に追加:

```ts
describe('listAllArticles', () => {
  it('returns articles of every status ordered by created_at desc', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const draft = insertArticle(db, { title: 'Draft One', status: 'draft', publishedAt: null })
    const published = insertArticle(db, { title: 'Published One', status: 'published' })
    db.prepare(`UPDATE articles SET created_at = '2026-01-01T00:00:00Z' WHERE id = ?`).run(draft)
    db.prepare(`UPDATE articles SET created_at = '2026-02-01T00:00:00Z' WHERE id = ?`).run(published)

    const { listAllArticles } = await import('./articles')
    const result = listAllArticles(db, 1, 'ja')

    expect(result.total).toBe(2)
    expect(result.articles.map((a) => a.title)).toEqual(['Published One', 'Draft One'])
    expect(result.articles.map((a) => a.status)).toEqual(['published', 'draft'])
  })

  it('paginates results at 5 per page', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    for (let i = 0; i < 12; i++) {
      const id = insertArticle(db, { title: `Article ${i}`, status: i % 2 === 0 ? 'draft' : 'published' })
      db.prepare(`UPDATE articles SET created_at = ? WHERE id = ?`).run(
        `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        id
      )
    }

    const { listAllArticles } = await import('./articles')
    const page1 = listAllArticles(db, 1, 'ja')
    const page2 = listAllArticles(db, 2, 'ja')
    const page3 = listAllArticles(db, 3, 'ja')

    expect(page1.articles).toHaveLength(5)
    expect(page2.articles).toHaveLength(5)
    expect(page3.articles).toHaveLength(2)
    expect(page1.total).toBe(12)
    expect(page1.pageSize).toBe(5)
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/articles.test.ts -t listAllArticles`
Expected: FAIL(`listAllArticles`が存在しない、`Property 'listAllArticles' ... does not exist` またはimportエラー)

- [ ] **Step 3: `listAllArticles`を実装する**

`server/utils/articles.ts`の`listDraftArticles`関数(135〜155行目)の直後に追加:

```ts
export function listAllArticles(
  db: Database.Database,
  page: number,
  locale: TranslationLocale
): ArticleListResult {
  const safePage = page < 1 ? 1 : page
  const offset = (safePage - 1) * PAGE_SIZE

  const total = (db.prepare(`SELECT COUNT(*) as count FROM articles`).get() as { count: number }).count

  const articleColumns = db
    .prepare(`SELECT ${ARTICLE_COLUMNS_SQL} FROM articles ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(PAGE_SIZE, offset) as ArticleColumns[]

  const withTranslations = attachArticleTranslations(db, articleColumns, locale)
  return { articles: attachArticleSources(db, withTranslations), total, page: safePage, pageSize: PAGE_SIZE }
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run server/utils/articles.test.ts -t listAllArticles`
Expected: PASS(2 tests)

- [ ] **Step 5: 変更内容を報告する(人間がコミット)**

変更ファイル: `server/utils/articles.ts`, `server/utils/articles.test.ts`。コミットメッセージ案: `feat: add listAllArticles for admin article management`

---

### Task 2: `deleteArticleRows`を追加し、`reject.post.ts`をリファクタリングする

**Files:**
- Modify: `server/utils/articles.ts`
- Modify: `server/api/admin/drafts/[id]/reject.post.ts`
- Test: `server/utils/articles.test.ts`

**Interfaces:**
- Consumes: なし(新規関数)
- Produces: `deleteArticleRows(db: Database.Database, id: number): void` — 後続タスク(Task 4)が`server/api/admin/articles/[id].delete.ts`から呼び出す。`article_sources` → `article_translations` → `favorites` → `articles`の順で削除し、`sources.processed_at`には一切触れない

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/articles.test.ts`末尾(`describe('publishedArticleExists', ...)`ブロックの後)に追加:

```ts
describe('deleteArticleRows', () => {
  it('deletes the article and its translations, sources, and favorites', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const id = insertArticle(db, { title: 'ToDelete' })
    linkSource(db, id, 'https://example.com/a', 'Example A')
    db.prepare(
      `INSERT INTO users (address, public_key, user_name, avatar_seed, created_at)
       VALUES ('addr1', 'pub1', 'user1', 'seed1', datetime('now'))`
    ).run()
    const user = db.prepare(`SELECT id FROM users WHERE address = 'addr1'`).get() as { id: number }
    db.prepare(`INSERT INTO favorites (user_id, article_id, created_at) VALUES (?, ?, datetime('now'))`).run(
      user.id,
      id
    )

    const { deleteArticleRows } = await import('./articles')
    deleteArticleRows(db, id)

    expect(db.prepare('SELECT * FROM articles WHERE id = ?').get(id)).toBeUndefined()
    expect(db.prepare('SELECT * FROM article_translations WHERE article_id = ?').all(id)).toHaveLength(0)
    expect(db.prepare('SELECT * FROM article_sources WHERE article_id = ?').all(id)).toHaveLength(0)
    expect(db.prepare('SELECT * FROM favorites WHERE article_id = ?').all(id)).toHaveLength(0)
  })

  it('does not reset processed_at on linked sources', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const id = insertArticle(db, { title: 'ToDelete' })
    linkSource(db, id, 'https://example.com/a', 'Example A')
    db.prepare(`UPDATE sources SET processed_at = '2026-01-01T00:00:00Z' WHERE url = 'https://example.com/a'`).run()

    const { deleteArticleRows } = await import('./articles')
    deleteArticleRows(db, id)

    const source = db.prepare(`SELECT processed_at FROM sources WHERE url = 'https://example.com/a'`).get() as {
      processed_at: string | null
    }
    expect(source.processed_at).toBe('2026-01-01T00:00:00Z')
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/articles.test.ts -t deleteArticleRows`
Expected: FAIL(`deleteArticleRows`が存在しない)

- [ ] **Step 3: `deleteArticleRows`を実装する**

`server/utils/articles.ts`の`publishedArticleExists`関数の直後(ファイル末尾)に追加:

```ts
export function deleteArticleRows(db: Database.Database, id: number): void {
  db.prepare(`DELETE FROM article_sources WHERE article_id = ?`).run(id)
  db.prepare(`DELETE FROM article_translations WHERE article_id = ?`).run(id)
  db.prepare(`DELETE FROM favorites WHERE article_id = ?`).run(id)
  db.prepare(`DELETE FROM articles WHERE id = ?`).run(id)
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run server/utils/articles.test.ts -t deleteArticleRows`
Expected: PASS(2 tests)

- [ ] **Step 5: `reject.post.ts`を`deleteArticleRows`を使うようリファクタリングする**

`server/api/admin/drafts/[id]/reject.post.ts`の全文を以下に置き換える:

```ts
import { useDb } from '../../../../utils/db'
import { requireAdminUser } from '../../../../utils/admin'
import { deleteArticleRows } from '../../../../utils/articles'

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

  deleteArticleRows(db, id)
  return { ok: true }
})
```

- [ ] **Step 6: 既存の`reject`関連APIテストが通ることを確認する**

Run: `npx vitest run tests/api/admin.test.ts -t reject`
Expected: PASS(`rejects a draft and resets its source for reprocessing`が既存のまま通ること。これは`server/utils/db.ts`の`useDb`をファイル内`process.env.DATABASE_PATH`経由で使う結合テストなので、実サーバー起動を伴う。数十秒かかる場合がある)

- [ ] **Step 7: 変更内容を報告する(人間がコミット)**

変更ファイル: `server/utils/articles.ts`, `server/utils/articles.test.ts`, `server/api/admin/drafts/[id]/reject.post.ts`。コミットメッセージ案: `refactor: extract deleteArticleRows shared by draft reject and article delete`

---

### Task 3: `GET /api/admin/articles`エンドポイントを追加する

**Files:**
- Create: `server/api/admin/articles/index.get.ts`
- Test: `tests/api/admin.test.ts`

**Interfaces:**
- Consumes: `useDb`(`server/utils/db.ts`)、`requireAdminUser`(`server/utils/admin.ts`)、`listAllArticles`・`parsePage`(`server/utils/articles.ts`、Task 1で追加済み)
- Produces: `GET /api/admin/articles?page=N` → `ArticleListResult`をJSONで返す。非管理者は403

- [ ] **Step 1: 失敗するテストを書く**

`tests/api/admin.test.ts`の`insertDraft`関数の直後に、公開記事も作れるヘルパーを追加してからテストを書く。`insertDraft`関数(38〜59行目)の直後に追加:

```ts
async function insertPublished(sourceUrl: string): Promise<number> {
  const { useDb } = await import('../../server/utils/db')
  const db = useDb()
  db.prepare(
    `INSERT OR IGNORE INTO sources (url, site_name, category, raw_text, fetched_at)
     VALUES (?, 'e-asakusa.jp', 'asakusa-area', '元テキスト', datetime('now'))`
  ).run(sourceUrl)
  const source = db.prepare(`SELECT id FROM sources WHERE url = ?`).get(sourceUrl) as { id: number }
  const articleResult = db
    .prepare(
      `INSERT INTO articles (status, category, published_at, created_at)
       VALUES ('published', 'asakusa-area', datetime('now'), datetime('now'))`
    )
    .run()
  const articleId = articleResult.lastInsertRowid as number
  db.prepare(
    `INSERT INTO article_translations (article_id, locale, title, body)
     VALUES (?, 'ja', '公開タイトル', '公開本文')`
  ).run(articleId)
  db.prepare(`INSERT INTO article_sources (article_id, source_id) VALUES (?, ?)`).run(articleId, source.id)
  return articleId
}
```

このプロジェクトの`tests/api/*.test.ts`は1ファイルにつき`setup()`呼び出しが1回という規約(全ファイル共通)。`admin.test.ts`はすでに`describe('admin drafts API', ...)`内で`setup()`を呼んでいるので、新しい`describe`ブロックを作らず、既存の`describe('admin drafts API', ...)`ブロックの中、末尾の`it('rejects a draft and resets its source for reprocessing', ...)`の直後(closingの`})`の直前)に新しい`it`を追加する:

```ts
  it('lists articles of every status for an admin user (admin articles endpoint)', async () => {
    const { cookie, address } = await loginAndGetCookie()
    await makeAdmin(address)
    await insertDraft('https://e-asakusa.jp/all-list-draft')
    await insertPublished('https://e-asakusa.jp/all-list-published')

    const result: any = await $fetch('/api/admin/articles', { headers: { cookie } })
    const statuses = result.articles.map((a: any) => a.status)
    expect(statuses).toContain('draft')
    expect(statuses).toContain('published')
  })

  it('rejects non-admin users from the admin articles endpoint with 403', async () => {
    const { cookie } = await loginAndGetCookie()
    await expect($fetch('/api/admin/articles', { headers: { cookie } })).rejects.toMatchObject({
      statusCode: 403
    })
  })
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/api/admin.test.ts -t "admin articles endpoint"`
Expected: FAIL(`/api/admin/articles`が404を返す)

- [ ] **Step 3: エンドポイントを実装する**

`server/api/admin/articles/index.get.ts`を新規作成:

```ts
import { useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/admin'
import { listAllArticles, parsePage } from '../../../utils/articles'

export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const query = getQuery(event)
  const page = parsePage(query.page)
  return listAllArticles(db, page, 'ja')
})
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/api/admin.test.ts -t "admin articles endpoint"`
Expected: PASS(2 tests)

- [ ] **Step 5: 変更内容を報告する(人間がコミット)**

変更ファイル: `server/api/admin/articles/index.get.ts`(新規), `tests/api/admin.test.ts`。コミットメッセージ案: `feat: add GET /api/admin/articles endpoint`

---

### Task 4: `DELETE /api/admin/articles/:id`エンドポイントを追加する

**Files:**
- Create: `server/api/admin/articles/[id].delete.ts`
- Test: `tests/api/admin.test.ts`

**Interfaces:**
- Consumes: `useDb`、`requireAdminUser`、`deleteArticleRows`(Task 2で追加済み)、Task 3の`insertPublished`ヘルパー・`insertDraft`ヘルパー
- Produces: `DELETE /api/admin/articles/:id` → 成功時`{ ok: true }`。`status = 'published'`でない記事のidを渡すと404。非管理者は403

- [ ] **Step 1: 失敗するテストを書く**

Task 3で`admin.test.ts`の`describe('admin drafts API', ...)`ブロック内に追加した2つの`it`のさらに直後(同じブロック内、末尾)に追加:

```ts
  it('deletes a published article without resetting its source processed_at', async () => {
    const { cookie, address } = await loginAndGetCookie()
    await makeAdmin(address)
    const sourceUrl = 'https://e-asakusa.jp/delete-published-test'
    const id = await insertPublished(sourceUrl)
    const { useDb: useDbBefore } = await import('../../server/utils/db')
    useDbBefore()
      .prepare(`UPDATE sources SET processed_at = '2026-01-01T00:00:00Z' WHERE url = ?`)
      .run(sourceUrl)

    await $fetch(`/api/admin/articles/${id}`, { method: 'DELETE', headers: { cookie } })

    const { useDb } = await import('../../server/utils/db')
    const db = useDb()
    expect(db.prepare('SELECT * FROM articles WHERE id = ?').get(id)).toBeUndefined()
    const source = db.prepare('SELECT processed_at FROM sources WHERE url = ?').get(sourceUrl) as any
    expect(source.processed_at).toBe('2026-01-01T00:00:00Z')
  })

  it('refuses to delete a draft article with 404', async () => {
    const { cookie, address } = await loginAndGetCookie()
    await makeAdmin(address)
    const id = await insertDraft('https://e-asakusa.jp/delete-draft-test')

    await expect(
      $fetch(`/api/admin/articles/${id}`, { method: 'DELETE', headers: { cookie } })
    ).rejects.toMatchObject({ statusCode: 404 })

    const { useDb } = await import('../../server/utils/db')
    const db = useDb()
    expect(db.prepare('SELECT * FROM articles WHERE id = ?').get(id)).toBeDefined()
  })

  it('rejects non-admin users from the delete endpoint with 403', async () => {
    const { address } = await loginAndGetCookie()
    await makeAdmin(address)
    const id = await insertPublished('https://e-asakusa.jp/delete-non-admin-test')
    const { cookie: userCookie } = await loginAndGetCookie()

    await expect(
      $fetch(`/api/admin/articles/${id}`, { method: 'DELETE', headers: { cookie: userCookie } })
    ).rejects.toMatchObject({ statusCode: 403 })
  })
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/api/admin.test.ts -t "delete"`
Expected: FAIL(3つの新規テストが404/存在しないエンドポイントで失敗)

- [ ] **Step 3: エンドポイントを実装する**

`server/api/admin/articles/[id].delete.ts`を新規作成:

```ts
import { useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/admin'
import { deleteArticleRows } from '../../../utils/articles'

export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const id = Number(getRouterParam(event, 'id'))
  const article = db.prepare(`SELECT id FROM articles WHERE id = ? AND status = 'published'`).get(id)
  if (!article) {
    throw createError({ statusCode: 404, message: 'Published article not found' })
  }
  deleteArticleRows(db, id)
  return { ok: true }
})
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/api/admin.test.ts`
Expected: PASS(全テスト。`admin drafts API`ブロック内の既存4件 + Task 3で追加した2件 + このタスクの3件 = 9件)

- [ ] **Step 5: 変更内容を報告する(人間がコミット)**

変更ファイル: `server/api/admin/articles/[id].delete.ts`(新規), `tests/api/admin.test.ts`。コミットメッセージ案: `feat: add DELETE /api/admin/articles/:id endpoint`

---

### Task 5: `/admin/articles`ページを追加する

**Files:**
- Create: `pages/admin/articles.vue`

**Interfaces:**
- Consumes: `GET /api/admin/articles?page=N`(Task 3)が返す`ArticleListResult`形状(`{ articles: { id, title, status, category, published_at, created_at, sources }[], total, page, pageSize }`)、`DELETE /api/admin/articles/:id`(Task 4)
- Produces: なし(末端のUIページ、他タスクはこれに依存しない)

このページはNuxt UIのトップレベル`await useFetch`を使うテスト困難なコンポーネントであり、`pages/admin/drafts.vue`と同じ理由でユニットテストは作らない(`docs/superpowers/specs/2026-08-22-profile-page-design.md`のSuspense制約を参照)。代わりに実装後に開発サーバーで手動確認する(Step 3)。

- [ ] **Step 1: ページを実装する**

`pages/admin/articles.vue`を新規作成:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'

useSeoMeta({ title: 'Article Management', robots: 'noindex, nofollow' })
const route = useRoute()
const router = useRouter()

const page = computed({
  get: () => Number(route.query.page) || 1,
  set: (value: number) => {
    router.push({ path: '/admin/articles', query: { ...route.query, page: value } })
  }
})

const { data, error, refresh } = await useFetch('/api/admin/articles', {
  query: { page },
  watch: [page]
})

const pendingDeleteId = ref<number | null>(null)
const deleteModalOpen = computed({
  get: () => pendingDeleteId.value !== null,
  set: (value: boolean) => {
    if (!value) pendingDeleteId.value = null
  }
})

function requestDelete(id: number) {
  pendingDeleteId.value = id
}

async function confirmDelete() {
  if (pendingDeleteId.value === null) return
  await $fetch(`/api/admin/articles/${pendingDeleteId.value}`, { method: 'DELETE' })
  pendingDeleteId.value = null
  await refresh()
}
</script>

<template>
  <div class="h-full overflow-y-auto max-w-3xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold text-primary mb-6">Article Management</h1>
    <p v-if="error" class="text-muted">You do not have access to this page.</p>
    <template v-else>
      <p v-if="data && data.articles.length === 0" class="text-muted">No articles yet.</p>
      <UCard v-for="article in data?.articles" :key="article.id" class="mb-4">
        <div class="flex items-center gap-2 mb-2">
          <UBadge :color="article.status === 'published' ? 'success' : 'neutral'" variant="subtle">
            {{ article.status }}
          </UBadge>
          <span class="text-sm text-muted">{{ article.category }}</span>
        </div>
        <h2 class="text-lg font-bold text-highlighted mb-2">{{ article.title }}</h2>
        <p class="text-sm text-muted mb-4">
          Created: {{ article.created_at }}<span v-if="article.published_at"> · Published: {{ article.published_at }}</span>
        </p>
        <UButton v-if="article.status === 'published'" color="error" variant="outline" @click="requestDelete(article.id)">
          Delete
        </UButton>
      </UCard>
      <div v-if="data && data.total > data.pageSize" class="flex justify-center mt-8">
        <UPagination v-model:page="page" :total="data.total" :items-per-page="data.pageSize" />
      </div>
    </template>

    <UModal v-model:open="deleteModalOpen" title="Delete article?" description="This cannot be undone.">
      <template #footer="{ close }">
        <UButton color="neutral" variant="outline" @click="close">Cancel</UButton>
        <UButton color="error" @click="confirmDelete">Delete</UButton>
      </template>
    </UModal>
  </div>
</template>
```

- [ ] **Step 2: 型チェックを実行する**

Run: `npx nuxi typecheck`
Expected: エラーなし(既存の型エラーが元々ある場合は、`pages/admin/articles.vue`に起因する新規エラーがないことを確認する)

- [ ] **Step 3: 開発サーバーで手動確認する**

Run: `npm run dev`

1. 管理者アカウントでログインした状態のブラウザで`http://localhost:3000/admin/articles`を開く
2. draft/publishedの記事が混在した状態で一覧に両方表示され、ステータスバッジが正しく出ることを確認
3. published行にのみ「Delete」ボタンが出ることを確認
4. 「Delete」を押すとモーダルが開き、「Cancel」で閉じても記事が消えないことを確認
5. 再度「Delete」→モーダルの「Delete」を押すと記事が一覧から消えることを確認
6. 6件以上published記事がある状態でページネーションが機能することを確認
7. 管理者でないアカウントでアクセスすると"You do not have access to this page."が表示されることを確認

手動確認後、`npm run dev`のプロセスを停止する。

- [ ] **Step 4: 変更内容を報告する(人間がコミット)**

変更ファイル: `pages/admin/articles.vue`(新規)。コミットメッセージ案: `feat: add admin article management page`

---

## Self-Review Notes

- **Spec coverage:** Goals(一覧・ページネーション・ステータス表示・published限定削除・確認ダイアログ・関連テーブルのカスケード削除)は全てTask 1〜5でカバー。Non-Goals(フィルタなし・draft削除不可・編集機能なし・ナビ導線なし)も実装コードに反映済み。
- **Placeholder scan:** なし。全ステップに実コードあり。
- **Type consistency:** `listAllArticles`は`ArticleListResult`を返し、Task 3のAPIがそのままJSONで返却、Task 5の`data`型と一致。`deleteArticleRows(db, id: number): void`のシグネチャはTask 2〜4で一貫。
