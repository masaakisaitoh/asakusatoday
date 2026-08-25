# 管理画面: 記事一覧・公開記事削除 Design

## Context

現在、管理者向けの画面は下書き承認用の`/admin/drafts`のみで、公開後の記事を一覧で確認したり削除したりする手段がない。このdesignは、管理者が全ステータスの記事を一覧・ページネーションで確認でき、公開済みの記事を削除できる新しい管理画面`/admin/articles`の範囲を定める。

## Goals

- 管理者が`/admin/articles`で全ステータス(draft/published等)の記事を作成日降順・ページネーション付きで一覧できる
- 各記事にステータスを表示する
- `status = 'published'`の記事にのみ削除ボタンを表示し、確認ダイアログの後に削除できる
- 削除された記事は`article_translations` / `article_sources` / `favorites`からも関連行が消え、参照整合性が壊れない

## Non-Goals

- ステータスによる絞り込みフィルタ(常に全件を作成日順で表示するのみ)
- draft/rejected状態の記事をこの画面から削除する機能(下書きの却下は既存の`/admin/drafts`のRejectに任せる)
- 記事の編集機能(削除のみ)
- `/admin/articles`への導線(ナビゲーションリンク)の追加。`/admin/drafts`と同様、URL直打ちでアクセスする運用を踏襲する

## Architecture

### `server/utils/articles.ts`の変更

**`listAllArticles`を追加。** `listDraftArticles`とほぼ同じ構造で、`WHERE status = 'draft'`を外し全件を対象にする。

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

**`deleteArticleRows`を追加。** `reject.post.ts`に書かれているカスケード削除(`article_sources` → `article_translations` → `favorites` → `articles`)をここに切り出す。

```ts
export function deleteArticleRows(db: Database.Database, id: number): void {
  db.prepare(`DELETE FROM article_sources WHERE article_id = ?`).run(id)
  db.prepare(`DELETE FROM article_translations WHERE article_id = ?`).run(id)
  db.prepare(`DELETE FROM favorites WHERE article_id = ?`).run(id)
  db.prepare(`DELETE FROM articles WHERE id = ?`).run(id)
}
```

重要: `reject.post.ts`が行っている「関連`sources`の`processed_at`をNULLに戻す(再収集対象に戻す)」処理は`deleteArticleRows`に含めない。下書きの却下は「別の記事として作り直してほしい」という意図なので再処理対象に戻すべきだが、公開済み記事の削除は管理者が内容を精査した上で「もう不要」と判断した結果であり、同じソースから同じ記事が自動的に再生成されてしまうのは意図に反する。そのため`reject.post.ts`はソースのリセット処理を自分で行ってから`deleteArticleRows`を呼ぶ形にリファクタリングし、新しい削除APIはソースのリセットを一切行わない。

```ts
// reject.post.ts (変更後)
const links = db.prepare(`SELECT source_id FROM article_sources WHERE article_id = ?`).all(id) as { source_id: number }[]
const resetSource = db.prepare(`UPDATE sources SET processed_at = NULL WHERE id = ?`)
for (const { source_id } of links) resetSource.run(source_id)
deleteArticleRows(db, id)
```

### 新規API: `server/api/admin/articles/index.get.ts`

```ts
export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const query = getQuery(event)
  const page = parsePage(query.page)
  return listAllArticles(db, page, 'ja')
})
```

`/admin/drafts`と同様、管理画面は日本語固定(localeクエリなし)。

### 新規API: `server/api/admin/articles/[id].delete.ts`

```ts
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

`status = 'published'`でない記事(draft/rejected等)のidを指定した場合は404を返し、削除しない。これによりAPIレベルでも「公開済みのみ削除可能」という制約を強制する。

### 新規ページ: `pages/admin/articles.vue`

`pages/admin/drafts.vue`の構成を踏襲する。

```ts
useSeoMeta({ title: 'Article Management', robots: 'noindex, nofollow' })
const route = useRoute()
const router = useRouter()

const page = computed({
  get: () => Number(route.query.page) || 1,
  set: (value: number) => router.push({ path: '/admin/articles', query: { ...route.query, page: value } })
})

const { data, error, refresh } = await useFetch('/api/admin/articles', { query: { page }, watch: [page] })

const pendingDeleteId = ref<number | null>(null)

async function confirmDelete() {
  if (pendingDeleteId.value === null) return
  await $fetch(`/api/admin/articles/${pendingDeleteId.value}`, { method: 'DELETE' })
  pendingDeleteId.value = null
  await refresh()
}
```

テンプレートは`UCard`で1記事ずつ表示し、タイトル・ステータスバッジ・作成日/公開日を出す。`status === 'published'`の記事だけ「Delete」ボタンを表示し、押すと`pendingDeleteId`をセットして`UModal`(`v-model:open="pendingDeleteId !== null"`相当の`computed`)を開く。モーダル内に「本当に削除しますか?」の確認文言とConfirm/Cancelボタンを置き、Confirmで`confirmDelete()`を呼ぶ。ページネーションは`drafts.vue`と同じ`UPagination`。

## Testing

### `server/utils/articles.test.ts`の追加分

- `listAllArticles`: draft/published混在の状態でページネーションと`created_at DESC`順が正しいこと、ステータスに関わらず全件が対象になること
- `deleteArticleRows`: 呼び出し後に`articles` / `article_translations` / `article_sources` / `favorites`の関連行が消えること、`sources.processed_at`には触れないこと

### `tests/api/admin.test.ts`への追加分(既存ファイルに追記)

- 非管理者が`GET /api/admin/articles`・`DELETE /api/admin/articles/:id`を叩くと403
- 管理者が`GET /api/admin/articles`を叩くとdraft/published混在で全件返る
- 管理者が公開済み記事に対して`DELETE /api/admin/articles/:id`を叩くと削除され、`sources.processed_at`が変化しないこと(reject.test既存ケースとの対比)
- 管理者がdraft状態の記事に対して`DELETE /api/admin/articles/:id`を叩くと404になり、削除されないこと

`pages/admin/articles.vue`自体のユニットテストは`drafts.vue`と同様に作らない(トップレベル`await useFetch`によるSuspense制約、既存designの方針を踏襲)。

## Open Questions

なし(brainstormingセッション内で解消済み)
