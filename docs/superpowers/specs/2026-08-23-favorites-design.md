# お気に入り機能 Design

## Context

現在、ログイン中のユーザーが記事に対して行えるアクションは記事一覧・詳細の閲覧のみで、後から読み返したい記事を保存する手段がない。このdesignは、ログインユーザーが記事詳細ページから記事をお気に入り登録でき、専用の一覧ページで確認できる機能の範囲を定める。

サイトの想定読者は英語圏の旅行者だが、`utils/i18n/uiStrings.ts`はすでにja/en/ko/zh-Hant/zh-Hans/ptの6言語を完全に翻訳したUI文字列辞書として運用されている(project memory `project_target_audience`にある「UI文言は英語のみ」という記述は現状のコードと食い違っており古い)。本designで追加するUI文字列もこの既存の6言語パターンに従う。

## Goals

- ログイン中のユーザーが記事詳細ページ(`pages/articles/[id].vue`)からハート型ボタンで記事をお気に入り登録・解除できる
- ヘッダーのユーザーメニューから「Favorites」一覧ページ(`pages/favorites.vue`)に遷移し、お気に入り登録した記事を一覧・ページネーションで確認できる
- 未ログインユーザーが記事詳細ページを見た場合もボタンは表示され、押すと`/login`に遷移する

## Non-Goals

- 記事一覧ページ(`pages/index.vue`)やカード(`components/ArticleCard.vue`)へのお気に入りボタン追加(詳細ページのみ)
- お気に入り件数の表示(プロフィールページ等への集計表示)
- お気に入りの並び替えオプション(常に登録日時の新しい順固定)
- 楽観的UI更新(トグルAPIのレスポンスを待ってから見た目を変える)

## Architecture

### 新規テーブル: `favorites`

`server/utils/db.ts`の`SCHEMA`に追加する。`CREATE TABLE IF NOT EXISTS`なので既存DBにも次回`useDb()`実行時に自動作成され、`migrate()`側の変更は不要。

```sql
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id),
  article_id INTEGER NOT NULL REFERENCES articles(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, article_id)
);
```

### 新規ファイル: `server/utils/favorites.ts`

```ts
export function isFavorited(db: Database.Database, userId: number, articleId: number): boolean

// あれば削除、なければ追加。戻り値はトグル後の状態。
export function toggleFavorite(db: Database.Database, userId: number, articleId: number): boolean

// listPublishedArticles と同じ ArticleListResult 形状で返す。
// favorites テーブルを articles に JOIN し、favorites.created_at DESC で並べる。
// status = 'published' でない記事(登録後に非公開化された記事)は結果から除外する。
export function listFavoriteArticles(
  db: Database.Database,
  userId: number,
  page: number,
  locale: TranslationLocale
): ArticleListResult
```

`listFavoriteArticles`は`server/utils/articles.ts`の`attachArticleTranslations` / `attachArticleSources`をそのまま再利用する。

### 新規API: `server/api/articles/[id]/favorite.post.ts`

```ts
export default defineEventHandler((event) => {
  const db = useDb()
  const user = requireSessionUser(db, event) // 未ログインなら401
  const id = Number(getRouterParam(event, 'id'))
  if (!articleExists(db, id)) throw createError({ statusCode: 404, message: 'Article not found' })
  const favorited = toggleFavorite(db, user.id, id)
  return { favorited }
})
```

`getPublishedArticleById`はlocaleを要求し翻訳・ソースまで取得してしまうため存在チェック用途には過剰。`server/utils/articles.ts`に軽量な`articleExists(db, id): boolean`(`SELECT 1 FROM articles WHERE id = ? AND status = 'published'`)を追加してそちらを使う。

### 新規API: `server/api/favorites/index.get.ts`

```ts
export default defineEventHandler((event) => {
  const db = useDb()
  const user = requireSessionUser(db, event) // 未ログインなら401
  const query = getQuery(event)
  const page = Number(query.page) || 1
  const locale = normalizeLocale(query.lang)
  return listFavoriteArticles(db, user.id, page, locale)
})
```

### 既存API変更: `server/api/articles/[id].get.ts`

レスポンスに`is_favorited`を追加する。ログインしていれば`isFavorited(db, user.id, id)`、していなければ`false`固定。

```ts
const user = getSessionUser(db, event) // requireではなくgetSessionUser(未ログインでも404にしない)
const article = getPublishedArticleById(db, id, locale)
if (!article) throw createError({ statusCode: 404, message: 'Article not found' })
return { ...article, is_favorited: user ? isFavorited(db, user.id, id) : false }
```

### `pages/articles/[id].vue`の変更

- カテゴリバッジの近くにハート型トグルボタン(`UButton`、`icon`のみの円形、`variant`をfavorited状態で切り替え)を配置
- `useFetch`で取得した`article.is_favorited`をローカルの`ref`に持ち、ボタンクリックで以下を実行:
  - 未ログイン(`user`が`null`、`useFetch('/api/user/me', { key: 'current-user' })`を参照)なら`navigateTo('/login')`のみ実行してAPIは叩かない
  - ログイン中なら`POST /api/articles/:id/favorite`を叩き、レスポンスの`favorited`でローカル状態を更新(処理中はボタンを`disabled`にして連打防止)
  - 通信エラー時はローカル状態を変更しない(そもそも成功レスポンスでしか状態を変えないため、失敗時のロールバック処理は不要)

### `layouts/default.vue`の変更

`userMenuItems`の1つ目のグループに追加:

```ts
{ label: t('nav.favorites'), to: '/favorites' }
```

Profile/Mapと同じ並び。

### 新規ページ: `pages/favorites.vue`

`pages/index.vue`の構造(ページネーション付きグリッド)を踏襲する。カテゴリフィルタ・天気カード・スワイプは無し。

```ts
const { locale } = useArticleLocale()
const { t } = useUiText()
const route = useRoute()
const router = useRouter()

const page = computed({
  get: () => Number(route.query.page) || 1,
  set: (value: number) => router.push({ path: '/favorites', query: { ...route.query, page: value } })
})

const { data, error } = await useFetch('/api/favorites', {
  query: { page, lang: locale },
  watch: [page, locale]
})

if (error.value?.statusCode === 401) {
  await navigateTo('/login')
}
```

テンプレートは`pages/index.vue`の`ArticleCard`グリッド+`UPagination`部分のみを流用。ページ上部に`<h1>{{ t('favorites.title') }}</h1>`(`index.newsTitle`の見出しと同じスタイル)を表示し、`data.articles.length === 0`のとき`t('favorites.empty')`を表示。

### 新規UI文字列(`utils/i18n/uiStrings.ts`)

`UiStringKey`に追加:
- `nav.favorites`
- `favorites.title`(見出し、例: 英語`Favorites`)
- `favorites.empty`(0件時、例: 英語`No favorites yet.`)

既存パターンに従い6言語(ja/en/ko/zh-Hant/zh-Hans/pt)すべてに翻訳を追加する。

## Testing

### `server/utils/favorites.test.ts`(新規、ユニット)

- `toggleFavorite`: 未登録→登録→解除の状態遷移、戻り値が正しいこと
- `isFavorited`: 登録前後の真偽値
- `listFavoriteArticles`: ページネーション、`favorites.created_at DESC`順、非公開化された記事が結果に含まれないこと

### `tests/api/favorites.test.ts`(新規、`tests/api/`の既存パターン踏襲)

- 未ログインで`POST /api/articles/:id/favorite`・`GET /api/favorites`を叩くと401
- ログイン後にトグルAPIを叩くと`favorited`がtrue/falseで切り替わる
- `GET /api/articles/:id`のレスポンスに`is_favorited`が正しく含まれる(未ログイン時false、登録後true)
- `GET /api/favorites`がページネーションされた自分のお気に入りのみ返す(他ユーザーのお気に入りが混ざらないこと)

### `pages/favorites.vue`のユニットテストは作らない

`pages/profile.vue`と同様、トップレベルで`await useFetch(...)`を使うため、`@vue/test-utils`の素の`mount()`では`Suspense`が無く描画されない(既存designで実機検証済みの制約、`docs/superpowers/specs/2026-08-22-profile-page-design.md`参照)。このコードベースの既存方針を踏襲し、e2eテストで代替する。

### `tests/e2e/favorites-flow.test.ts`(新規)

- アカウント作成→記事詳細ページでハートボタンをクリック→塗りハートに変化
- ヘッダーメニューから「Favorites」に遷移→登録した記事がグリッドに表示される
- 記事詳細ページでハートボタンを再度クリック→解除→Favoritesページをリロードすると一覧から消える
- 未ログイン状態で記事詳細ページのハートボタンをクリック→`/login`に遷移する
- 未ログイン状態で`/favorites`に直接アクセス→`/login`にリダイレクトされる

## Open Questions

なし(brainstormingセッション内で解消済み)
