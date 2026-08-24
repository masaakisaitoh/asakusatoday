# お気に入り機能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ログイン中のユーザーが記事詳細ページからハート型ボタンで記事をお気に入り登録・解除でき、ヘッダーのユーザーメニューから遷移する専用の一覧ページ(`/favorites`)で確認できるようにする。

**Architecture:** 新規`favorites`テーブル(`user_id`, `article_id`の複合主キー)を追加し、`server/utils/favorites.ts`にトグル・存在確認・一覧取得ロジックを実装する。新規APIエンドポイント`POST /api/articles/[id]/favorite`(トグル)と`GET /api/favorites`(一覧、既存`listPublishedArticles`と同じ`ArticleListResult`形状)を追加し、既存の`GET /api/articles/[id]`には`is_favorited`フィールドを追加する。フロントは`pages/articles/[id].vue`にハートボタン、`layouts/default.vue`にナビリンク、新規`pages/favorites.vue`に一覧ページを実装する。

**Tech Stack:** Vue 3(`<script setup>`), Nuxt 3, @nuxt/ui v3(`UCard`/`UBadge`/`UPagination`)、better-sqlite3、Vitest、`@nuxt/test-utils/e2e`(Playwright)

## Global Constraints

- CLAUDE.mdの方針により、gitコマンド(`git add`/`git commit`等)は実行しない。各タスク末尾の「コミット」ステップは、実行者(人間)が内容を確認してから手動で行う
- お気に入りボタンは記事詳細ページ(`pages/articles/[id].vue`)のみに設置する。記事一覧のカード(`components/ArticleCard.vue`)には追加しない
- 未ログイン状態でもボタンは表示する。押すと`/login`に遷移するのみで、APIは呼ばない
- トグルAPIのレスポンスを受け取ってから見た目を変える(楽観的更新はしない)
- `pages/articles/[id].vue`・`pages/favorites.vue`はいずれもトップレベルで`await useFetch(...)`を使う。`@vue/test-utils`の素の`mount()`は`Suspense`を提供しないため単体テストでは描画されない(既存designで実機検証済みの制約)。このコードベースに既存の`pages/*.test.ts`が一つも無いのはこれが理由であり、この方針を踏襲してこの2ページの単体テストは作らず、`tests/e2e/favorites-flow.test.ts`で検証する
- お気に入り登録後に記事が非公開化された場合、`/favorites`一覧には表示しない(`status = 'published'`の記事のみ対象)
- 新規UI文字列(`nav.favorites`, `favorites.title`, `favorites.empty`, `article.addFavorite`, `article.removeFavorite`)は既存パターンに従い6言語(ja/en/ko/zh-Hant/zh-Hans/pt)すべてに翻訳を追加する

---

### Task 1: DBスキーマ — `favorites`テーブル追加

**Files:**
- Modify: `server/utils/db.ts`
- Test: `server/utils/db.test.ts`

**Interfaces:**
- Produces: `favorites`テーブル(`user_id INTEGER`, `article_id INTEGER`, `created_at TEXT`, `PRIMARY KEY (user_id, article_id)`)。Task 2の`server/utils/favorites.ts`が使用する

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/db.test.ts`の`describe('useDb', ...)`ブロック内、最後の`it(...)`(`'migrates an existing articles table with title/body...'`)の直後に以下を追加する:

```ts
  it('creates a favorites table with a composite primary key on user_id and article_id', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row: any) => row.name)
    expect(tables).toContain('favorites')

    db.prepare(
      `INSERT INTO users (address, public_key, user_name, avatar_seed, created_at)
       VALUES ('addr-fav', 'pub-fav', 'FavUser000000001', 'seed-fav', datetime('now'))`
    ).run()
    const user = db.prepare('SELECT id FROM users WHERE address = ?').get('addr-fav') as { id: number }
    const article = db
      .prepare(
        `INSERT INTO articles (status, category, created_at) VALUES ('published', 'traffic', datetime('now'))`
      )
      .run()
    const articleId = article.lastInsertRowid as number

    db.prepare(`INSERT INTO favorites (user_id, article_id, created_at) VALUES (?, ?, datetime('now'))`).run(
      user.id,
      articleId
    )
    expect(() =>
      db
        .prepare(`INSERT INTO favorites (user_id, article_id, created_at) VALUES (?, ?, datetime('now'))`)
        .run(user.id, articleId)
    ).toThrow()
  })
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/db.test.ts`
Expected: FAIL(`SQLITE_ERROR: no such table: favorites`)

- [ ] **Step 3: `server/utils/db.ts`の`SCHEMA`に`favorites`テーブルを追加する**

`SCHEMA`定数内、`article_sources`テーブル定義の直後(閉じの`` ` ``の直前)に以下を追加する。変更前:

```ts
CREATE TABLE IF NOT EXISTS article_sources (
  article_id INTEGER NOT NULL REFERENCES articles(id),
  source_id INTEGER NOT NULL REFERENCES sources(id),
  PRIMARY KEY (article_id, source_id)
);
`
```

変更後:

```ts
CREATE TABLE IF NOT EXISTS article_sources (
  article_id INTEGER NOT NULL REFERENCES articles(id),
  source_id INTEGER NOT NULL REFERENCES sources(id),
  PRIMARY KEY (article_id, source_id)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id),
  article_id INTEGER NOT NULL REFERENCES articles(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, article_id)
);
`
```

`CREATE TABLE IF NOT EXISTS`なので`migrate()`関数の変更は不要(既存DBにも次回`useDb()`実行時に自動作成される)。

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run server/utils/db.test.ts`
Expected: PASS(全件)

- [ ] **Step 5: コミット**

```bash
git add server/utils/db.ts server/utils/db.test.ts
git commit -m "favoritesテーブルを追加"
```

---

### Task 2: `server/utils/articles.ts`に`articleExists`、新規`server/utils/favorites.ts`

**Files:**
- Modify: `server/utils/articles.ts`
- Modify: `server/utils/articles.test.ts`
- Create: `server/utils/favorites.ts`
- Create: `server/utils/favorites.test.ts`

**Interfaces:**
- Consumes: `favorites`テーブル(Task 1)、`ArticleColumns`/`ArticleListResult`/`TranslationLocale`/`attachArticleTranslations`/`attachArticleSources`(`server/utils/articles.ts`、既存)
- Produces:
  - `articleExists(db: Database.Database, id: number): boolean`(Task 4が使用)
  - `isFavorited(db: Database.Database, userId: number, articleId: number): boolean`(Task 6が使用)
  - `toggleFavorite(db: Database.Database, userId: number, articleId: number): boolean`(Task 4が使用。戻り値はトグル後の状態)
  - `listFavoriteArticles(db: Database.Database, userId: number, page: number, locale: TranslationLocale): ArticleListResult`(Task 5が使用)

- [ ] **Step 1: `articleExists`の失敗するテストを書く**

`server/utils/articles.test.ts`の末尾(`describe('getPublishedArticleById', ...)`ブロックの後)に以下を追加する:

```ts

describe('articleExists', () => {
  it('returns true for a published article', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const id = insertArticle(db)

    const { articleExists } = await import('./articles')
    expect(articleExists(db, id)).toBe(true)
  })

  it('returns false for a draft article', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const id = insertArticle(db, { status: 'draft' })

    const { articleExists } = await import('./articles')
    expect(articleExists(db, id)).toBe(false)
  })

  it('returns false for a nonexistent id', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()

    const { articleExists } = await import('./articles')
    expect(articleExists(db, 999999)).toBe(false)
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/articles.test.ts`
Expected: FAIL(`articleExists`が存在せず`undefined is not a function`)

- [ ] **Step 3: `server/utils/articles.ts`に`articleExists`を実装する**

`getPublishedArticleById`関数の直後に以下を追加する:

```ts

export function articleExists(db: Database.Database, id: number): boolean {
  const row = db.prepare(`SELECT 1 FROM articles WHERE id = ? AND status = 'published'`).get(id)
  return row !== undefined
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run server/utils/articles.test.ts`
Expected: PASS(全件)

- [ ] **Step 5: `server/utils/favorites.ts`の失敗するテストを書く**

`server/utils/favorites.test.ts`を新規作成する:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'

beforeEach(() => {
  process.env.DATABASE_PATH = ':memory:'
})

function insertUser(db: Database.Database, address: string): number {
  db.prepare(
    `INSERT INTO users (address, public_key, user_name, avatar_seed, created_at)
     VALUES (?, 'pub', ?, 'seed', datetime('now'))`
  ).run(address, `User_${address}`)
  return (db.prepare('SELECT id FROM users WHERE address = ?').get(address) as { id: number }).id
}

function insertArticle(db: Database.Database, overrides: { title?: string; status?: string } = {}): number {
  const result = db
    .prepare(
      `INSERT INTO articles (status, category, published_at, created_at)
       VALUES (?, 'asakusa-area', '2026-01-01T00:00:00Z', datetime('now'))`
    )
    .run(overrides.status ?? 'published')
  const articleId = result.lastInsertRowid as number
  db.prepare(
    `INSERT INTO article_translations (article_id, locale, title, body) VALUES (?, 'ja', ?, 'Body')`
  ).run(articleId, overrides.title ?? 'Title')
  return articleId
}

describe('isFavorited', () => {
  it('returns false when not favorited', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const userId = insertUser(db, 'addr1')
    const articleId = insertArticle(db)

    const { isFavorited } = await import('./favorites')
    expect(isFavorited(db, userId, articleId)).toBe(false)
  })

  it('returns true after favoriting', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const userId = insertUser(db, 'addr1')
    const articleId = insertArticle(db)

    const { toggleFavorite, isFavorited } = await import('./favorites')
    toggleFavorite(db, userId, articleId)
    expect(isFavorited(db, userId, articleId)).toBe(true)
  })
})

describe('toggleFavorite', () => {
  it('adds a favorite and returns true when not previously favorited', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const userId = insertUser(db, 'addr1')
    const articleId = insertArticle(db)

    const { toggleFavorite } = await import('./favorites')
    expect(toggleFavorite(db, userId, articleId)).toBe(true)
  })

  it('removes a favorite and returns false when already favorited', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const userId = insertUser(db, 'addr1')
    const articleId = insertArticle(db)

    const { toggleFavorite } = await import('./favorites')
    toggleFavorite(db, userId, articleId)
    expect(toggleFavorite(db, userId, articleId)).toBe(false)
  })
})

describe('listFavoriteArticles', () => {
  it("returns only the given user's favorited published articles, newest favorite first", async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const userA = insertUser(db, 'addrA')
    const userB = insertUser(db, 'addrB')
    const articleOld = insertArticle(db, { title: 'Old' })
    const articleNew = insertArticle(db, { title: 'New' })
    const articleOthers = insertArticle(db, { title: 'Others' })

    db.prepare(
      `INSERT INTO favorites (user_id, article_id, created_at) VALUES (?, ?, '2026-01-01T00:00:00Z')`
    ).run(userA, articleOld)
    db.prepare(
      `INSERT INTO favorites (user_id, article_id, created_at) VALUES (?, ?, '2026-02-01T00:00:00Z')`
    ).run(userA, articleNew)
    db.prepare(
      `INSERT INTO favorites (user_id, article_id, created_at) VALUES (?, ?, '2026-01-15T00:00:00Z')`
    ).run(userB, articleOthers)

    const { listFavoriteArticles } = await import('./favorites')
    const result = listFavoriteArticles(db, userA, 1, 'ja')
    expect(result.total).toBe(2)
    expect(result.articles.map((a) => a.title)).toEqual(['New', 'Old'])
  })

  it('excludes favorites whose article was unpublished after favoriting', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const userId = insertUser(db, 'addr1')
    const articleId = insertArticle(db)

    const { toggleFavorite, listFavoriteArticles } = await import('./favorites')
    toggleFavorite(db, userId, articleId)
    db.prepare(`UPDATE articles SET status = 'draft' WHERE id = ?`).run(articleId)

    const result = listFavoriteArticles(db, userId, 1, 'ja')
    expect(result.total).toBe(0)
    expect(result.articles).toEqual([])
  })

  it('paginates results at 5 per page', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const userId = insertUser(db, 'addr1')

    const { toggleFavorite, listFavoriteArticles } = await import('./favorites')
    for (let i = 0; i < 7; i++) {
      const articleId = insertArticle(db, { title: `Article ${i}` })
      toggleFavorite(db, userId, articleId)
    }

    const page1 = listFavoriteArticles(db, userId, 1, 'ja')
    const page2 = listFavoriteArticles(db, userId, 2, 'ja')
    expect(page1.articles).toHaveLength(5)
    expect(page2.articles).toHaveLength(2)
    expect(page1.total).toBe(7)
  })
})
```

- [ ] **Step 6: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/favorites.test.ts`
Expected: FAIL(`./favorites`モジュールが存在せずエラーになる)

- [ ] **Step 7: `server/utils/favorites.ts`を実装する**

新規作成する:

```ts
import type Database from 'better-sqlite3'
import type { ArticleColumns, ArticleListResult, TranslationLocale } from './articles'
import { attachArticleTranslations, attachArticleSources } from './articles'

const PAGE_SIZE = 5

const ARTICLE_COLUMNS_SQL =
  'articles.id, articles.image_url, articles.status, articles.category, articles.published_at, articles.created_at'

export function isFavorited(db: Database.Database, userId: number, articleId: number): boolean {
  const row = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND article_id = ?').get(userId, articleId)
  return row !== undefined
}

export function toggleFavorite(db: Database.Database, userId: number, articleId: number): boolean {
  if (isFavorited(db, userId, articleId)) {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND article_id = ?').run(userId, articleId)
    return false
  }
  db.prepare(`INSERT INTO favorites (user_id, article_id, created_at) VALUES (?, ?, datetime('now'))`).run(
    userId,
    articleId
  )
  return true
}

export function listFavoriteArticles(
  db: Database.Database,
  userId: number,
  page: number,
  locale: TranslationLocale
): ArticleListResult {
  const safePage = page < 1 ? 1 : page
  const offset = (safePage - 1) * PAGE_SIZE

  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM favorites
         JOIN articles ON articles.id = favorites.article_id
         WHERE favorites.user_id = ? AND articles.status = 'published'`
      )
      .get(userId) as { count: number }
  ).count

  const articleColumns = db
    .prepare(
      `SELECT ${ARTICLE_COLUMNS_SQL} FROM favorites
       JOIN articles ON articles.id = favorites.article_id
       WHERE favorites.user_id = ? AND articles.status = 'published'
       ORDER BY favorites.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, PAGE_SIZE, offset) as ArticleColumns[]

  const withTranslations = attachArticleTranslations(db, articleColumns, locale)
  return { articles: attachArticleSources(db, withTranslations), total, page: safePage, pageSize: PAGE_SIZE }
}
```

- [ ] **Step 8: テストを実行して成功を確認する**

Run: `npx vitest run server/utils/favorites.test.ts`
Expected: PASS(全件)

- [ ] **Step 9: コミット**

```bash
git add server/utils/articles.ts server/utils/articles.test.ts server/utils/favorites.ts server/utils/favorites.test.ts
git commit -m "お気に入りのドメインロジック(server/utils/favorites.ts)とarticleExistsを追加"
```

---

### Task 3: UI文字列の追加

**Files:**
- Modify: `utils/i18n/uiStrings.ts`
- Modify: `composables/useUiText.test.ts`

**Interfaces:**
- Produces: `UiStringKey`に`'nav.favorites'`, `'favorites.title'`, `'favorites.empty'`, `'article.addFavorite'`, `'article.removeFavorite'`を追加(Task 7・8・9が使用)

- [ ] **Step 1: 失敗するテストを書く**

`composables/useUiText.test.ts`の末尾、最後の`it(...)`ブロックの直後(`describe`の閉じ`})`の直前)に以下を追加する:

```ts

  it('returns favorites strings for en and ja', async () => {
    const { useArticleLocale } = await import('./useArticleLocale')
    vi.stubGlobal('useArticleLocale', useArticleLocale)
    const { useUiText } = await import('./useUiText')

    const { locale, setLocale } = useArticleLocale()
    const { t } = useUiText()
    expect(t('nav.favorites')).toBe('Favorites')
    expect(t('favorites.title')).toBe('Favorites')
    expect(t('favorites.empty')).toBe('No favorites yet.')
    expect(t('article.addFavorite')).toBe('Add to favorites')
    expect(t('article.removeFavorite')).toBe('Remove from favorites')

    setLocale('ja')
    expect(locale.value).toBe('ja')
    expect(t('nav.favorites')).toBe('お気に入り')
    expect(t('favorites.empty')).toBe('まだお気に入りがありません。')
  })
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run composables/useUiText.test.ts`
Expected: FAIL(未定義キーのため`t(...)`が`undefined`を返しアサーションに一致しない)

- [ ] **Step 3: `utils/i18n/uiStrings.ts`の`UiStringKey`型に新規キーを追加する**

変更前:

```ts
  | 'nav.map'
  | 'login.title'
```

変更後:

```ts
  | 'nav.map'
  | 'nav.favorites'
  | 'login.title'
```

変更前:

```ts
  | 'index.clearFilter'
  | 'article.notFound'
  | 'article.source'
  | 'article.sources'
  | 'weather.summary'
```

変更後:

```ts
  | 'index.clearFilter'
  | 'favorites.title'
  | 'favorites.empty'
  | 'article.notFound'
  | 'article.source'
  | 'article.sources'
  | 'article.addFavorite'
  | 'article.removeFavorite'
  | 'weather.summary'
```

- [ ] **Step 4: `en`ロケールに翻訳を追加する**

変更前:

```ts
    'nav.map': 'Map',
    'login.title': 'Log in',
```

変更後:

```ts
    'nav.map': 'Map',
    'nav.favorites': 'Favorites',
    'login.title': 'Log in',
```

変更前:

```ts
    'index.clearFilter': 'Show all articles',
    'article.notFound': 'Article not found',
    'article.source': 'Source:',
    'article.sources': 'Sources:',
```

変更後:

```ts
    'index.clearFilter': 'Show all articles',
    'favorites.title': 'Favorites',
    'favorites.empty': 'No favorites yet.',
    'article.notFound': 'Article not found',
    'article.source': 'Source:',
    'article.sources': 'Sources:',
    'article.addFavorite': 'Add to favorites',
    'article.removeFavorite': 'Remove from favorites',
```

- [ ] **Step 5: `ja`ロケールに翻訳を追加する**

変更前:

```ts
    'nav.map': 'マップ',
    'login.title': 'ログイン',
```

変更後:

```ts
    'nav.map': 'マップ',
    'nav.favorites': 'お気に入り',
    'login.title': 'ログイン',
```

変更前:

```ts
    'index.clearFilter': 'すべての記事を表示',
    'article.notFound': '記事が見つかりません',
    'article.source': '出典:',
    'article.sources': '出典:',
```

変更後:

```ts
    'index.clearFilter': 'すべての記事を表示',
    'favorites.title': 'お気に入り',
    'favorites.empty': 'まだお気に入りがありません。',
    'article.notFound': '記事が見つかりません',
    'article.source': '出典:',
    'article.sources': '出典:',
    'article.addFavorite': 'お気に入りに追加',
    'article.removeFavorite': 'お気に入りから削除',
```

- [ ] **Step 6: `ko`ロケールに翻訳を追加する**

変更前:

```ts
    'nav.map': '지도',
    'login.title': '로그인',
```

変更後:

```ts
    'nav.map': '지도',
    'nav.favorites': '즐겨찾기',
    'login.title': '로그인',
```

変更前:

```ts
    'index.clearFilter': '모든 기사 보기',
    'article.notFound': '기사를 찾을 수 없습니다',
    'article.source': '출처:',
    'article.sources': '출처:',
```

変更後:

```ts
    'index.clearFilter': '모든 기사 보기',
    'favorites.title': '즐겨찾기',
    'favorites.empty': '아직 즐겨찾기가 없습니다.',
    'article.notFound': '기사를 찾을 수 없습니다',
    'article.source': '출처:',
    'article.sources': '출처:',
    'article.addFavorite': '즐겨찾기에 추가',
    'article.removeFavorite': '즐겨찾기에서 삭제',
```

- [ ] **Step 7: `zh-Hant`ロケールに翻訳を追加する**

変更前:

```ts
    'nav.map': '地圖',
    'login.title': '登入',
```

変更後:

```ts
    'nav.map': '地圖',
    'nav.favorites': '收藏',
    'login.title': '登入',
```

変更前:

```ts
    'index.clearFilter': '顯示所有文章',
    'article.notFound': '找不到文章',
    'article.source': '來源：',
    'article.sources': '來源：',
```

変更後:

```ts
    'index.clearFilter': '顯示所有文章',
    'favorites.title': '收藏',
    'favorites.empty': '尚無收藏文章。',
    'article.notFound': '找不到文章',
    'article.source': '來源：',
    'article.sources': '來源：',
    'article.addFavorite': '加入收藏',
    'article.removeFavorite': '取消收藏',
```

- [ ] **Step 8: `zh-Hans`ロケールに翻訳を追加する**

変更前:

```ts
    'nav.map': '地图',
    'login.title': '登录',
```

変更後:

```ts
    'nav.map': '地图',
    'nav.favorites': '收藏',
    'login.title': '登录',
```

変更前:

```ts
    'index.clearFilter': '显示所有文章',
    'article.notFound': '未找到文章',
    'article.source': '来源：',
    'article.sources': '来源：',
```

変更後:

```ts
    'index.clearFilter': '显示所有文章',
    'favorites.title': '收藏',
    'favorites.empty': '暂无收藏文章。',
    'article.notFound': '未找到文章',
    'article.source': '来源：',
    'article.sources': '来源：',
    'article.addFavorite': '加入收藏',
    'article.removeFavorite': '取消收藏',
```

- [ ] **Step 9: `pt`ロケールに翻訳を追加する**

変更前:

```ts
    'nav.map': 'Mapa',
    'login.title': 'Entrar',
```

変更後:

```ts
    'nav.map': 'Mapa',
    'nav.favorites': 'Favoritos',
    'login.title': 'Entrar',
```

変更前:

```ts
    'index.clearFilter': 'Ver todos os artigos',
    'article.notFound': 'Artigo não encontrado',
    'article.source': 'Fonte:',
    'article.sources': 'Fontes:',
```

変更後:

```ts
    'index.clearFilter': 'Ver todos os artigos',
    'favorites.title': 'Favoritos',
    'favorites.empty': 'Ainda não há favoritos.',
    'article.notFound': 'Artigo não encontrado',
    'article.source': 'Fonte:',
    'article.sources': 'Fontes:',
    'article.addFavorite': 'Adicionar aos favoritos',
    'article.removeFavorite': 'Remover dos favoritos',
```

- [ ] **Step 10: テストを実行して成功を確認する**

Run: `npx vitest run composables/useUiText.test.ts`
Expected: PASS(全件)

- [ ] **Step 11: コミット**

```bash
git add utils/i18n/uiStrings.ts composables/useUiText.test.ts
git commit -m "お気に入り関連のUI文字列を6言語分追加"
```

---

### Task 4: API — `POST /api/articles/[id]/favorite`(トグル)

**Files:**
- Create: `server/api/articles/[id]/favorite.post.ts`
- Create: `tests/api/favorites.test.ts`

**Interfaces:**
- Consumes: `requireSessionUser(db, event): UserRow`(`server/utils/session.ts`、既存)、`articleExists`・`toggleFavorite`(Task 2)
- Produces: `POST /api/articles/:id/favorite` → `{ favorited: boolean }`。未ログインは401、記事が存在しない/未公開なら404。Task 5のテストファイルとTask 7のUIが利用する

- [ ] **Step 1: 失敗するテストを書く**

`tests/api/favorites.test.ts`を新規作成する:

```ts
// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest'
import { setup, $fetch, fetch as rawFetch } from '@nuxt/test-utils/e2e'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateAccount, signMessage } from '../../utils/symbolCrypto'

const dbDir = mkdtempSync(join(tmpdir(), 'asakusa-favorites-'))
const dbPath = join(dbDir, 'test.sqlite3')
process.env.DATABASE_PATH = dbPath

async function loginAndGetCookie(): Promise<string> {
  const account = generateAccount()
  const { nonce } = await $fetch('/api/auth/nonce', { method: 'POST', body: { address: account.address } })
  const signature = signMessage(account.privateKey, nonce)
  const response = await rawFetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: account.address, publicKey: account.publicKey, signature, nonce })
  })
  return (response.headers.get('set-cookie') ?? '').split(';')[0]
}

async function insertPublishedArticle(title: string): Promise<number> {
  const { useDb } = await import('../../server/utils/db')
  const db = useDb()
  const result = db
    .prepare(
      `INSERT INTO articles (status, category, published_at, created_at)
       VALUES ('published', 'traffic', '2026-01-01T00:00:00Z', datetime('now'))`
    )
    .run()
  const articleId = result.lastInsertRowid as number
  db.prepare(
    `INSERT INTO article_translations (article_id, locale, title, body) VALUES (?, 'ja', ?, 'Body')`
  ).run(articleId, title)
  return articleId
}

describe('favorites API', async () => {
  await setup({ server: true, env: { DATABASE_PATH: dbPath } })

  afterAll(() => {
    rmSync(dbDir, { recursive: true, force: true })
  })

  it('rejects a toggle request without a session', async () => {
    const articleId = await insertPublishedArticle('No Session')
    await expect($fetch(`/api/articles/${articleId}/favorite`, { method: 'POST' })).rejects.toMatchObject({
      statusCode: 401
    })
  })

  it('404s when toggling a nonexistent article', async () => {
    const cookie = await loginAndGetCookie()
    await expect(
      $fetch('/api/articles/999999/favorite', { method: 'POST', headers: { cookie } })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('adds a favorite on first toggle and removes it on second toggle', async () => {
    const cookie = await loginAndGetCookie()
    const articleId = await insertPublishedArticle('Toggle Me')

    const first: any = await $fetch(`/api/articles/${articleId}/favorite`, {
      method: 'POST',
      headers: { cookie }
    })
    expect(first.favorited).toBe(true)

    const second: any = await $fetch(`/api/articles/${articleId}/favorite`, {
      method: 'POST',
      headers: { cookie }
    })
    expect(second.favorited).toBe(false)
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/api/favorites.test.ts`
Expected: FAIL(ルートが存在せず全件404になり、期待するstatusCode/レスポンス形と一致しない)

- [ ] **Step 3: `server/api/articles/[id]/favorite.post.ts`を実装する**

新規作成する:

```ts
import { useDb } from '../../../utils/db'
import { requireSessionUser } from '../../../utils/session'
import { articleExists } from '../../../utils/articles'
import { toggleFavorite } from '../../../utils/favorites'

export default defineEventHandler((event) => {
  const db = useDb()
  const user = requireSessionUser(db, event)
  const id = Number(getRouterParam(event, 'id'))
  if (!articleExists(db, id)) {
    throw createError({ statusCode: 404, message: 'Article not found' })
  }
  const favorited = toggleFavorite(db, user.id, id)
  return { favorited }
})
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/api/favorites.test.ts`
Expected: PASS(全件)

- [ ] **Step 5: コミット**

```bash
git add server/api/articles/\[id\]/favorite.post.ts tests/api/favorites.test.ts
git commit -m "お気に入りトグルAPI(POST /api/articles/:id/favorite)を追加"
```

---

### Task 5: API — `GET /api/favorites`(一覧)

**Files:**
- Create: `server/api/favorites/index.get.ts`
- Modify: `tests/api/favorites.test.ts`

**Interfaces:**
- Consumes: `requireSessionUser`(既存)、`normalizeLocale`(`server/utils/articles.ts`、既存)、`listFavoriteArticles`(Task 2)
- Produces: `GET /api/favorites?page&lang` → `ArticleListResult`(`{ articles, total, page, pageSize }`)。未ログインは401。Task 9のUIが利用する

- [ ] **Step 1: 失敗するテストを追加する**

`tests/api/favorites.test.ts`の`describe('favorites API', ...)`ブロック末尾(最後の`it(...)`の後、閉じ`})`の直前)に以下を追加する:

```ts

  it('rejects a list request without a session', async () => {
    await expect($fetch('/api/favorites')).rejects.toMatchObject({ statusCode: 401 })
  })

  it("lists only the current user's favorited articles", async () => {
    const cookieA = await loginAndGetCookie()
    const cookieB = await loginAndGetCookie()
    const articleA = await insertPublishedArticle('Mine')
    const articleB = await insertPublishedArticle('Not Mine')

    await $fetch(`/api/articles/${articleA}/favorite`, { method: 'POST', headers: { cookie: cookieA } })
    await $fetch(`/api/articles/${articleB}/favorite`, { method: 'POST', headers: { cookie: cookieB } })

    const result: any = await $fetch('/api/favorites', { headers: { cookie: cookieA } })
    expect(result.total).toBe(1)
    expect(result.articles[0].title).toBe('Mine')
  })

  it('paginates favorites at 5 per page', async () => {
    const cookie = await loginAndGetCookie()
    for (let i = 0; i < 7; i++) {
      const articleId = await insertPublishedArticle(`Page Article ${i}`)
      await $fetch(`/api/articles/${articleId}/favorite`, { method: 'POST', headers: { cookie } })
    }

    const page1: any = await $fetch('/api/favorites?page=1', { headers: { cookie } })
    const page2: any = await $fetch('/api/favorites?page=2', { headers: { cookie } })
    expect(page1.articles).toHaveLength(5)
    expect(page2.articles).toHaveLength(2)
  })
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/api/favorites.test.ts`
Expected: FAIL(`/api/favorites`ルートが存在せず404になる)

- [ ] **Step 3: `server/api/favorites/index.get.ts`を実装する**

新規作成する:

```ts
import { useDb } from '../../utils/db'
import { requireSessionUser } from '../../utils/session'
import { normalizeLocale } from '../../utils/articles'
import { listFavoriteArticles } from '../../utils/favorites'

export default defineEventHandler((event) => {
  const db = useDb()
  const user = requireSessionUser(db, event)
  const query = getQuery(event)
  const page = Number(query.page) || 1
  const locale = normalizeLocale(query.lang)
  return listFavoriteArticles(db, user.id, page, locale)
})
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/api/favorites.test.ts`
Expected: PASS(全件)

- [ ] **Step 5: コミット**

```bash
git add server/api/favorites/index.get.ts tests/api/favorites.test.ts
git commit -m "お気に入り一覧API(GET /api/favorites)を追加"
```

---

### Task 6: API — `GET /api/articles/[id]`に`is_favorited`を追加

**Files:**
- Modify: `server/api/articles/[id].get.ts`
- Modify: `tests/api/articles.test.ts`

**Interfaces:**
- Consumes: `getSessionUser(db, event): UserRow | null`(`server/utils/session.ts`、既存)、`isFavorited`(Task 2)
- Produces: `GET /api/articles/:id`のレスポンスに`is_favorited: boolean`を追加(未ログイン時は`false`固定)。Task 7のUIが利用する

- [ ] **Step 1: 失敗するテストを追加する**

`tests/api/articles.test.ts`冒頭のimportを書き換える。変更前:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
```

変更後:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setup, $fetch, fetch as rawFetch } from '@nuxt/test-utils/e2e'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateAccount, signMessage } from '../../utils/symbolCrypto'
```

続けて、`describe('articles API', ...)`の直前にヘルパー関数を追加する。変更前:

```ts
const dbDir = mkdtempSync(join(tmpdir(), 'asakusa-articles-'))
const dbPath = join(dbDir, 'test.sqlite3')

describe('articles API', async () => {
```

変更後:

```ts
const dbDir = mkdtempSync(join(tmpdir(), 'asakusa-articles-'))
const dbPath = join(dbDir, 'test.sqlite3')

async function loginAndGetCookie(): Promise<string> {
  const account = generateAccount()
  const { nonce } = await $fetch('/api/auth/nonce', { method: 'POST', body: { address: account.address } })
  const signature = signMessage(account.privateKey, nonce)
  const response = await rawFetch('/api/auth/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: account.address, publicKey: account.publicKey, signature, nonce })
  })
  return (response.headers.get('set-cookie') ?? '').split(';')[0]
}

describe('articles API', async () => {
```

最後に、ファイル末尾(最後の`it(...)`の後、`describe`の閉じ`})`の直前)に以下を追加する:

```ts

  it('includes is_favorited: false for a logged-out request', async () => {
    const list: any = await $fetch('/api/articles')
    const id = list.articles[0].id
    const article: any = await $fetch(`/api/articles/${id}`)
    expect(article.is_favorited).toBe(false)
  })

  it('includes is_favorited: true after the article is favorited', async () => {
    const cookie = await loginAndGetCookie()
    const list: any = await $fetch('/api/articles')
    const id = list.articles[0].id
    await $fetch(`/api/articles/${id}/favorite`, { method: 'POST', headers: { cookie } })

    const article: any = await $fetch(`/api/articles/${id}`, { headers: { cookie } })
    expect(article.is_favorited).toBe(true)
  })
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/api/articles.test.ts`
Expected: FAIL(新規2件が`is_favorited`未定義で失敗。既存テストは引き続きPASS)

- [ ] **Step 3: `server/api/articles/[id].get.ts`を修正する**

変更前:

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

変更後:

```ts
import { useDb } from '../../utils/db'
import { getPublishedArticleById, normalizeLocale } from '../../utils/articles'
import { getSessionUser } from '../../utils/session'
import { isFavorited } from '../../utils/favorites'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  const query = getQuery(event)
  const locale = normalizeLocale(query.lang)
  const db = useDb()
  const article = getPublishedArticleById(db, id, locale)
  if (!article) {
    throw createError({ statusCode: 404, message: 'Article not found' })
  }
  const user = getSessionUser(db, event)
  return { ...article, is_favorited: user ? isFavorited(db, user.id, id) : false }
})
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/api/articles.test.ts`
Expected: PASS(全件)

- [ ] **Step 5: コミット**

```bash
git add server/api/articles/\[id\].get.ts tests/api/articles.test.ts
git commit -m "記事詳細APIにis_favoritedフィールドを追加"
```

---

### Task 7: `pages/articles/[id].vue` — ハートボタン

**Files:**
- Modify: `pages/articles/[id].vue`

**Interfaces:**
- Consumes: `GET /api/articles/:id`の`is_favorited`(Task 6)、`POST /api/articles/:id/favorite`(Task 4)、`t('article.addFavorite')`・`t('article.removeFavorite')`(Task 3)
- Produces: 記事詳細ページのハートボタン(Task 10のe2eテストが`[aria-label="Add to favorites"]`/`[aria-label="Remove from favorites"]`で操作する)

このページはトップレベルで`await useFetch(...)`を使うため単体テストは作らない(Global Constraints参照)。動作確認はTask 10のe2eテストで行う。

- [ ] **Step 1: `pages/articles/[id].vue`を書き換える**

全体を以下に置き換える:

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'

const route = useRoute()
const { locale } = useArticleLocale()
const { t, categoryLabel } = useUiText()
const { data: article, error } = await useFetch(`/api/articles/${route.params.id}`, {
  query: { lang: locale },
  watch: [locale]
})

if (error.value) {
  throw createError({ statusCode: error.value.statusCode || 404, statusMessage: t('article.notFound') })
}

const { data: user } = useFetch('/api/user/me', { key: 'current-user' })

const favorited = ref(article.value?.is_favorited ?? false)
watch(article, (value) => {
  if (value) favorited.value = value.is_favorited
})

const togglingFavorite = ref(false)

async function toggleFavorite(): Promise<void> {
  if (!user.value) {
    await navigateTo('/login')
    return
  }
  togglingFavorite.value = true
  try {
    const result = await $fetch(`/api/articles/${route.params.id}/favorite`, { method: 'POST' })
    favorited.value = result.favorited
  } finally {
    togglingFavorite.value = false
  }
}
</script>

<template>
  <div v-if="article" class="h-full overflow-y-auto max-w-2xl mx-auto px-4 py-6">
    <UCard :ui="{ body: 'p-4 sm:p-6', header: 'p-0' }">
      <template v-if="article.image_url" #header>
        <img :src="article.image_url" :alt="article.title" class="w-full aspect-video object-cover">
      </template>
      <div class="flex items-center justify-between mb-2">
        <UBadge
          color="secondary"
          variant="subtle"
          size="sm"
          class="cursor-pointer hover:brightness-95"
          @click="navigateTo({ path: '/', query: { category: article.category } })"
        >
          {{ categoryLabel(article.category) }}
        </UBadge>
        <button
          type="button"
          class="text-2xl leading-none disabled:opacity-50"
          :class="favorited ? 'text-primary' : 'text-muted'"
          :aria-label="favorited ? t('article.removeFavorite') : t('article.addFavorite')"
          :disabled="togglingFavorite"
          @click="toggleFavorite"
        >
          {{ favorited ? '♥' : '♡' }}
        </button>
      </div>
      <h1 class="text-3xl font-bold text-highlighted mb-2">{{ article.title }}</h1>
      <time class="text-sm text-muted">{{ article.published_at }}</time>
      <p class="mt-6 leading-relaxed whitespace-pre-wrap">{{ article.body }}</p>
      <p class="mt-8 pt-4 border-t border-default text-sm text-muted">
        <template v-if="article.sources.length > 1">{{ t('article.sources') + ' ' }}</template>
        <template v-else>{{ t('article.source') + ' ' }}</template>
        <template v-for="(source, index) in article.sources" :key="source.url">
          <a :href="source.url" target="_blank" rel="noopener" class="text-primary underline">{{ source.siteName }}</a><span v-if="index < article.sources.length - 1">, </span>
        </template>
      </p>
    </UCard>
  </div>
</template>
```

- [ ] **Step 2: 型チェックを実行する**

Run: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: `pages/articles/[id].vue`に起因する新規エラーが無いこと

- [ ] **Step 3: コミット**

```bash
git add pages/articles/\[id\].vue
git commit -m "記事詳細ページにお気に入りハートボタンを追加"
```

---

### Task 8: `layouts/default.vue` — ヘッダーメニューにFavoritesリンクを追加

**Files:**
- Modify: `layouts/default.vue`
- Modify: `layouts/default.test.ts`

**Interfaces:**
- Consumes: `t('nav.favorites')`(Task 3)
- Produces: ヘッダーのユーザーメニューに`/favorites`へのリンク(Task 10のe2eテストが`text=Favorites`で操作する)

- [ ] **Step 1: 失敗するテストを書く**

`layouts/default.test.ts`の`it('shows the user avatar in a dropdown with profile and logout options when logged in', ...)`の直後に以下を追加する:

```ts

  it('shows a favorites link in the dropdown when logged in', () => {
    stubUseState({ avatar_seed: 'seed-1', user_name: 'tester' })
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    expect(wrapper.text()).toContain('Favorites')
  })
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run layouts/default.test.ts`
Expected: FAIL(メニューに"Favorites"がまだ無い)

- [ ] **Step 3: `layouts/default.vue`の`userMenuItems`を修正する**

変更前:

```ts
const userMenuItems = computed(() => [
  [
    { label: t('nav.profile'), to: '/profile' },
    { label: t('nav.map'), to: '/map' }
  ],
  [{ label: t('nav.logOut'), onSelect: logout }]
])
```

変更後:

```ts
const userMenuItems = computed(() => [
  [
    { label: t('nav.profile'), to: '/profile' },
    { label: t('nav.favorites'), to: '/favorites' },
    { label: t('nav.map'), to: '/map' }
  ],
  [{ label: t('nav.logOut'), onSelect: logout }]
])
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run layouts/default.test.ts`
Expected: PASS(全件)

- [ ] **Step 5: コミット**

```bash
git add layouts/default.vue layouts/default.test.ts
git commit -m "ヘッダーのユーザーメニューにFavoritesリンクを追加"
```

---

### Task 9: 新規`pages/favorites.vue`

**Files:**
- Create: `pages/favorites.vue`

**Interfaces:**
- Consumes: `GET /api/favorites`(Task 5)、`t('favorites.title')`・`t('favorites.empty')`(Task 3)、`components/ArticleCard.vue`(既存)
- Produces: `/favorites`ページ(Task 10のe2eテストが遷移・表示内容を検証する)

このページもトップレベルで`await useFetch(...)`を使うため単体テストは作らない(Global Constraints参照)。動作確認はTask 10のe2eテストで行う。

- [ ] **Step 1: `pages/favorites.vue`を新規作成する**

```vue
<script setup lang="ts">
import { computed } from 'vue'

const route = useRoute()
const router = useRouter()
const { locale } = useArticleLocale()
const { t } = useUiText()

const page = computed({
  get: () => Number(route.query.page) || 1,
  set: (value: number) => {
    router.push({ path: '/favorites', query: { ...route.query, page: value } })
  }
})

const { data, error } = await useFetch('/api/favorites', {
  query: { page, lang: locale },
  watch: [page, locale]
})

if (error.value) {
  await navigateTo('/login')
}
</script>

<template>
  <div class="h-full overflow-y-auto max-w-5xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold text-primary mb-6">{{ t('favorites.title') }}</h1>
    <p v-if="data && data.articles.length === 0" class="text-muted">
      {{ t('favorites.empty') }}
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <ArticleCard
        v-for="article in data?.articles"
        :id="article.id"
        :key="article.id"
        :title="article.title"
        :image-url="article.image_url"
        :published-at="article.published_at ?? ''"
        :category="article.category"
      />
    </div>
    <div v-if="data && data.total > data.pageSize" class="flex justify-center mt-8">
      <UPagination v-model:page="page" :total="data.total" :items-per-page="data.pageSize" />
    </div>
  </div>
</template>
```

- [ ] **Step 2: 型チェックを実行する**

Run: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: `pages/favorites.vue`に起因する新規エラーが無いこと

- [ ] **Step 3: コミット**

```bash
git add pages/favorites.vue
git commit -m "お気に入り一覧ページ(/favorites)を追加"
```

---

### Task 10: e2eテスト — `tests/e2e/favorites-flow.test.ts`

**Files:**
- Create: `tests/e2e/favorites-flow.test.ts`

**Interfaces:**
- Consumes: Task 1〜9で実装した全機能(DBスキーマ、API、UI)

- [ ] **Step 1: `tests/e2e/favorites-flow.test.ts`を新規作成する**

`:memory:`ではプロセス間でDBを共有できないため(サーバーはサブプロセスで動く)、`tests/api/admin.test.ts`と同じくファイルベースの一時DBを使い、テストプロセス側から直接`useDb()`で公開記事を1件仕込む:

```ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setup, createPage } from '@nuxt/test-utils/e2e'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dbDir = mkdtempSync(join(tmpdir(), 'asakusa-favorites-e2e-'))
const dbPath = join(dbDir, 'test.sqlite3')
process.env.DATABASE_PATH = dbPath

async function createAndLoginAccount(page: Awaited<ReturnType<typeof createPage>>): Promise<void> {
  await page.check('input[type=checkbox]')
  await page.click('text=Create account')
  await page.check('input[type=checkbox]')
  await page.click('text=Continue')
  await page.waitForURL(/\/profile/)
}

describe('favorites flow', async () => {
  await setup({ server: true, env: { DATABASE_PATH: dbPath } })

  beforeAll(async () => {
    const { useDb, resetDbForTests } = await import('../../server/utils/db')
    resetDbForTests()
    const db = useDb()
    const result = db
      .prepare(
        `INSERT INTO articles (status, category, published_at, created_at)
         VALUES ('published', 'traffic', '2026-01-01T00:00:00Z', datetime('now'))`
      )
      .run()
    const articleId = result.lastInsertRowid as number
    db.prepare(
      `INSERT INTO article_translations (article_id, locale, title, body)
       VALUES (?, 'en', 'Favorite Test Article', 'Body text')`
    ).run(articleId)
  })

  afterAll(() => {
    rmSync(dbDir, { recursive: true, force: true })
  })

  it('redirects to login when visiting /favorites while logged out', async () => {
    const page = await createPage('/favorites')
    await page.waitForURL(/\/login/)
    await page.close()
  }, 30000)

  it('shows the heart button but redirects to login on click when logged out', async () => {
    const page = await createPage('/')
    await page.waitForSelector('a[href^="/articles/"]')
    await page.click('a[href^="/articles/"]')
    await page.waitForURL(/\/articles\//)
    await page.click('[aria-label="Add to favorites"]')
    await page.waitForURL(/\/login/)
    await page.close()
  }, 30000)

  it('favorites an article, sees it in the Favorites list, then unfavorites it', async () => {
    const page = await createPage('/account/create')
    await createAndLoginAccount(page)

    await page.goto(new URL('/', page.url()).toString())
    await page.waitForSelector('a[href^="/articles/"]')
    await page.click('a[href^="/articles/"]')
    await page.waitForURL(/\/articles\//)

    await page.click('[aria-label="Add to favorites"]')
    await page.waitForSelector('[aria-label="Remove from favorites"]')

    await page.click('[aria-label="User menu"]')
    await page.click('text=Favorites')
    await page.waitForURL(/\/favorites/)
    await expect(page.locator('a[href^="/articles/"]')).toHaveCount(1)

    await page.goBack()
    await page.waitForURL(/\/articles\//)
    await page.click('[aria-label="Remove from favorites"]')
    await page.waitForSelector('[aria-label="Add to favorites"]')

    await page.click('[aria-label="User menu"]')
    await page.click('text=Favorites')
    await page.waitForURL(/\/favorites/)
    await expect(page.locator('text=No favorites yet.')).toBeVisible()

    await page.close()
  }, 30000)
})
```

- [ ] **Step 2: テストを実行して通ることを確認する**

Run: `npx vitest run tests/e2e/favorites-flow.test.ts`
Expected: 3件ともPASS。失敗する場合はセレクタ(`[aria-label="Add to favorites"]`等が実際に描画されているか、`UDropdownMenu`のメニュー項目が`text=Favorites`でクリック可能か)を実ブラウザで確認して調整する

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/favorites-flow.test.ts
git commit -m "お気に入り機能のe2eテストを追加"
```

---

### Task 11: 最終検証

**Files:** なし(検証のみ)

**Interfaces:**
- Consumes: Task 1〜10で実装した全機能

- [ ] **Step 1: 型チェックを実行する**

Run: `npx vue-tsc --noEmit -p tsconfig.json`
Expected: 今回変更・追加したファイルに起因する新規エラーが無いこと(既存の無関係な既知の型エラーは無視してよい)

- [ ] **Step 2: プロジェクト全体のテストスイートを実行する**

Run: `npx vitest run`
Expected: 全テストPASS

- [ ] **Step 3: devサーバーで実際に画面を確認する**

Run: `npm run dev`(バックグラウンド起動)

- `/account/create`からアカウントを作成し、記事一覧から任意の記事詳細ページに遷移する
- ハートボタン(♡)が表示されていること。クリックすると塗りハート(♥)に変わること
- ヘッダーのユーザーメニューから「Favorites」をクリックし`/favorites`に遷移すること。先ほどお気に入りにした記事がグリッドに表示されること
- 記事詳細ページに戻りハートボタンを再度クリックして解除し、`/favorites`をリロードすると一覧から消え「No favorites yet.」と表示されること
- ログアウトした状態で記事詳細ページのハートボタンを押すと`/login`に遷移すること
- 確認後、devサーバーを停止する

- [ ] **Step 4: 完了報告**

このタスクはコード変更を含まないため、コミットは不要。Task 1〜10のコミットが完了していることを確認して完了とする。
