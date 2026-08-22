# ASAKUSA TODAY — 記事一覧・詳細表示 設計

## 位置づけ

[[2026-08-13-symbol-auth-design.md]] で定義した「コア機能」サブプロジェクトのうち、
編集部が発信するニュース記事を読者に見せる部分（読む側）を最初に作る。
記事投稿・編集（書く側の管理画面）、観光ガイド・スポット情報、ユーザー投稿（CGM）は本ドキュメントのスコープ外で、別途設計する。

## スコープ

- 記事一覧ページ（トップページ）、記事詳細ページの表示
- 記事一覧・詳細を返すAPI

**スコープ外（将来拡張、または[[2026-08-14-article-pipeline-design.md]]で扱う）**

- 記事データの収集・AI生成・承認フロー（[[2026-08-14-article-pipeline-design.md]]参照）
- 画像アップロード機能（image_urlは外部URL文字列を保持するのみ）
- カテゴリ・タグ・検索・並び替え
- イベント固有の日時・場所情報

## 前提・方針

- 記事一覧・詳細ページは**ログイン不要**（誰でも閲覧可能）。既存の認証ミドルウェアは適用しない。
- 記事はニュース記事のみを対象とし、タイトル・本文・画像・公開日を持つシンプルな構造とする。
- データは [[2026-08-14-article-pipeline-design.md]] の記事自動生成パイプライン（収集→AI生成→人間承認）で投入する。一覧・詳細APIは`status='published'`の記事のみを返す。

## アーキテクチャ

- 既存のNuxt 3（Nitroサーバー）構成に相乗り。フロントエンドとAPIを同居させる。
- DB：既存のsqlite3（better-sqlite3）に`articles`テーブルを追加。

## コンポーネント

### 1. DBスキーマ（sqlite3）

```sql
articles(
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  image_url     TEXT NULL,             -- 外部画像URL、任意
  status        TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'published'（詳細は[[2026-08-14-article-pipeline-design.md]]）
  source_url    TEXT NOT NULL,
  source_name   TEXT NOT NULL,
  published_at  TEXT NULL,             -- 承認され公開された日時。draft中はNULL
  created_at    TEXT NOT NULL
)
```

このテーブルおよびデータ投入経路（収集・AI生成・承認フロー）の詳細は [[2026-08-14-article-pipeline-design.md]] を参照。本ドキュメントは読む側（一覧・詳細表示）のみを扱う。

### 2. サーバー側 API（Nitroルート）

| エンドポイント | 役割 |
|---|---|
| `GET /api/articles?page=1` | `status='published'`の記事一覧を`published_at`降順・1ページ10件で取得。`{ articles, total, page, pageSize }`を返す |
| `GET /api/articles/:id` | 記事1件の詳細を取得。`status='published'`でない、または存在しない場合は404 |

### 3. ページ

- `pages/index.vue`（既存を差し替え）：記事一覧。`GET /api/articles`を叩き、`ArticleCard`を並べる。ページ下部にページネーション（前へ／次へ＋ページ番号）。
- `pages/articles/[id].vue`（新規）：記事詳細。`GET /api/articles/:id`でタイトル・本文・画像・公開日を表示。該当なしは404表示。

### 4. コンポーネント

- `components/ArticleCard.vue`（新規）：一覧の1件分の見た目（タイトル・画像・公開日の抜粋）。一覧以外（将来の関連記事表示等）でも再利用できる単位として切り出す。

## データフロー（一覧表示）

1. ブラウザ：`pages/index.vue`が`GET /api/articles?page=N`を呼ぶ
2. サーバー：`articles`テーブルを`published_at`降順でpage分オフセットして最大10件取得、合計件数もあわせて返す
3. ブラウザ：`ArticleCard`を並べて表示。件数からページネーションのUIを算出

## データフロー（詳細表示）

1. ブラウザ：`pages/articles/[id].vue`が`GET /api/articles/:id`を呼ぶ
2. サーバー：該当行を取得。なければ404
3. ブラウザ：タイトル・本文・画像・公開日を表示

## エラーハンドリング

- `GET /api/articles/:id`で該当なし → `createError({ statusCode: 404, statusMessage: 'Article not found' })`
- `GET /api/articles?page=`が0以下・総ページ数超えなど範囲外 → エラーにはせず空配列（`articles: []`）を返す。一覧側は「記事がありません」を表示
- DB例外は既存パターン通りそのまま500として扱う（揉み消さない）

## テスト方針

- `server/utils/articles.test.ts`：記事取得ロジック（ページング計算含む）の単体テスト
- `tests/api/articles.test.ts`：`/api/articles`, `/api/articles/:id`のAPI結合テスト（既存`auth.test.ts`と同じ形）
- `components/ArticleCard.test.ts`：カード表示のコンポーネントテスト（既存`UserAvatar.test.ts`に倣う）
