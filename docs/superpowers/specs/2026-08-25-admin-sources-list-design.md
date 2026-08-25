# 管理画面: 記事ソースURL一覧 Design

## Context

現在、管理者は記事の元になった収集ソース(`sources`テーブル)の内容を画面から確認する手段がない。このdesignは、管理者が収集済みの全ソースURLとその付帯情報を一覧できる、閲覧専用の新しい管理画面`/admin/sources`の範囲を定める。`/admin/articles`(2026-08-25-admin-article-management-design.md)と同じ方針(URL直打ちアクセス、`UPagination`によるページング)を踏襲する。

## Goals

- 管理者が`/admin/sources`で`sources`テーブルの全行を`fetched_at`降順・1ページ20件のページネーション付きで一覧できる
- 各行に`url`・`site_name`・`category`・`fetched_at`・`processed_at`(未処理なら「未処理」表示)を表示する
- `url`は`<a>`タグで囲み、新しいタブでソース元ページに遷移できる

## Non-Goals

- 編集・削除機能(閲覧専用。APIもGETのみ)
- `processed_at`の有無などによる絞り込みフィルタ(常に全件を`fetched_at`降順で表示するのみ)
- `/admin/sources`への導線(ナビゲーションリンク)の追加。`/admin/articles`・`/admin/drafts`と同様、URL直打ちでアクセスする運用を踏襲する

## Architecture

### 新規: `server/utils/sources.ts`

`server/utils/articles.ts`の`listAllArticles`と同じ構造で、`sources`テーブルをページネーション取得する。

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

`page`の妥当性検証には既存の`parsePage`(`server/utils/articles.ts`からimport)を再利用する。

### 新規API: `server/api/admin/sources/index.get.ts`

```ts
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

GETのみ実装し、更新・削除系のエンドポイントは作らない。

### 新規ページ: `pages/admin/sources.vue`

`pages/admin/articles.vue`の構成を踏襲するが、削除ボタン・モーダルは持たない閲覧専用画面にする。

```ts
useSeoMeta({ title: 'Source Management', robots: 'noindex, nofollow' })
const route = useRoute()
const router = useRouter()

const page = computed({
  get: () => Number(route.query.page) || 1,
  set: (value: number) => {
    router.push({ path: '/admin/sources', query: { ...route.query, page: value } })
  }
})

const { data, error } = await useFetch('/api/admin/sources', { query: { page }, watch: [page] })
```

テンプレートは`UCard`で1ソースずつ表示する:

- `site_name`と`category`をバッジ/テキストで表示
- `fetched_at`を表示。`processed_at`があればその日時、なければ「未処理」バッジを表示
- `url`本体は`<a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.url }}</a>`でリンク化し、クリックで元ページに遷移できるようにする
- 編集・削除ボタンは一切置かない
- `data.total > data.pageSize`のとき`UPagination`を表示(`articles.vue`と同じ条件)

## Testing

### `server/utils/sources.test.ts`(新規)

- `listSources`: 複数件のsourcesが存在する状態でページネーションと`fetched_at DESC`順が正しいこと
- `processed_at`が`NULL`の行も含めて全件が対象になること(フィルタしない)

### `tests/api/admin.test.ts`への追加分(既存ファイルに追記)

- 非管理者が`GET /api/admin/sources`を叩くと403
- 管理者が`GET /api/admin/sources`を叩くと`sources`テーブルの内容が`fetched_at`降順で返ること

`pages/admin/sources.vue`自体のユニットテストは`articles.vue`・`drafts.vue`と同様に作らない(トップレベル`await useFetch`によるSuspense制約、既存designの方針を踏襲)。

## Open Questions

なし(brainstormingセッション内で解消済み)
