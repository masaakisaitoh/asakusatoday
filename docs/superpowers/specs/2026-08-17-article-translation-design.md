# ASAKUSA TODAY — 記事の多言語翻訳・保存 設計

## 位置づけ

[[2026-08-14-article-pipeline-design.md]] で設計した記事自動生成パイプライン（収集→AI生成→人間承認→公開）に、翻訳ステップを追加する。
これまで記事は日本語のみで生成・保存していたが、本ドキュメントでは生成直後に英語・韓国語・繁体字中国語・簡体字中国語への翻訳も行い、5言語ぶんをDBに保存する。あわせて、[[2026-08-14-articles-design.md]] で設計した一覧・詳細表示（読む側）とフロントエンドの言語切り替えUIも本ドキュメントのスコープに含める。

対象読者は英語圏が中心という既定方針（サイト全体のUI文言は英語）がある。記事本文の翻訳は、これまで「将来検討」としてブラウザの自動翻訳任せにしていた部分を、本設計で正式に実装する。

## スコープ

- 記事生成パイプライン（`npm run generate`）に翻訳ステップを追加し、日本語記事から英語・韓国語・繁体字・簡体字を生成してDBに保存する
- 一覧・詳細APIの言語（`lang`）対応
- フロントエンドの言語選択UI（ドロップダウン）と、選択言語に応じた記事表示
- 既存の日本語のみのデータ（`articles.title`/`body`）を`article_translations`テーブルへ移行するマイグレーション

**スコープ外（将来拡張）**

- 翻訳結果の人間レビュー・承認フロー（AIの翻訳をそのまま信頼する。日本語記事のみ引き続き人間がレビューする）
- URLへの言語情報の付与（`/en/articles/1`のようなパス構成やSEO対応）
- 5言語以外の言語追加時の拡張性設計（今回は決め打ちの5言語）
- 翻訳の再生成・個別上書き編集機能（管理画面での翻訳修正）

## 前提・方針

- 翻訳は記事生成（`npm run generate`）のタイミングで、日本語記事の生成に続けて自動的に行う。承認フローは記事単位のまま変更しない（承認すれば5言語まとめて公開される）。
- 対応言語は次の5つに固定する：`ja`（日本語）、`en`（英語）、`ko`（韓国語）、`zh-Hant`（繁体字中国語）、`zh-Hans`（簡体字中国語）。
- 翻訳はClaude APIへの1回の呼び出しで英語・韓国語・繁体字・簡体字の4言語ぶんをまとめて取得する（日本語記事の生成と合わせて、1記事あたり生成1回＋翻訳1回の計2回のAPI呼び出し）。
- 日本語記事の生成・翻訳のどちらかが失敗した場合、その記事は丸ごと失敗扱いとする（部分的な保存はしない）。次回の`npm run generate`実行時に、対象sourceが未処理のまま残っているので最初からやり直しになる。
- 管理画面（`/admin/drafts`）でのレビュー対象は日本語のみ。翻訳された4言語は人間レビューを経ずにそのまま公開対象になる。
- 既存の公開済み記事（日本語のみ）は、リクエストされた言語の翻訳が存在しない場合、日本語（`ja`）にフォールバックして表示する。

## アーキテクチャ

```
① npm run generate
   sources のうち processed_at IS NULL の行を対象に：
   1. generateArticleFromSources() → 日本語記事 { title, body }
   2. translateArticle() → { en, ko, zh-Hant, zh-Hans } をJSON一括取得
   3. 両方成功したら articles + article_translations(5言語) + article_sources を保存、
      source.processed_at を更新
   4. どちらか失敗したら丸ごとスキップ（processed_at は更新しない）

② /admin/drafts（変更なし、日本語のみ表示してレビュー）

③ 承認されたら status='published'。一般公開の一覧・詳細APIは
   lang クエリで指定された言語の article_translations を返す（なければja）

④ フロントエンド：ヘッダーの言語ドロップダウンで選択した言語を
   localStorageに保存し、一覧・詳細ページのAPI呼び出しに lang として渡す
```

## コンポーネント

### 1. DBスキーマ（sqlite3）

```sql
-- articles: title/body を削除、メタ情報のみ保持
CREATE TABLE articles (
  id            INTEGER PRIMARY KEY,
  image_url     TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  category      TEXT NOT NULL,
  published_at  TEXT,
  created_at    TEXT NOT NULL
);

-- 新規：言語別のタイトル・本文
CREATE TABLE article_translations (
  article_id  INTEGER NOT NULL REFERENCES articles(id),
  locale      TEXT NOT NULL,  -- 'ja' | 'en' | 'ko' | 'zh-Hant' | 'zh-Hans'
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  PRIMARY KEY (article_id, locale)
);
```

**マイグレーション**（`server/utils/db.ts`の`migrate()`に追加）：
1. `article_translations`テーブルを作成
2. 既存の`articles`テーブルに`title`/`body`カラムが存在する場合、各行を`locale='ja'`として`article_translations`にコピー
3. `articles`から`title`/`body`カラムを削除（sqlite3の`ALTER TABLE ... DROP COLUMN`を使用。better-sqlite3のバージョンで非対応なら、新テーブル作成→コピー→リネームの手順を取る）

### 2. 生成・翻訳（`server/utils/generator.ts`）

**既存**: `generateArticleFromSources(client, sources): Promise<GeneratedArticle>` — 日本語記事を生成（変更なし）

**新規**: `translateArticle(client, article: GeneratedArticle): Promise<Record<TranslationLocale, GeneratedArticle>>`
- 日本語記事の`title`/`body`を渡し、英語・韓国語・繁体字・簡体字への翻訳をClaude APIに1回で依頼する
- プロンプト方針：元記事のトーン（地域ブログ風の親しみやすさ）を保つ／事実の追加・削除をしない／出力は`{"en": {"title":"...","body":"..."}, "ko": {...}, "zh-Hant": {...}, "zh-Hans": {...}}`のJSON形式のみ

**変更**: `generateDraftsForUnprocessedSources(db, client)`
- source単位のループ内で、①`generateArticleFromSources` → ②`translateArticle` の順に呼び出す
- 両方成功した場合のみ、`articles`（title/bodyなし）→ `article_translations`に5言語ぶん（ja + 4言語）→ `article_sources` の順にINSERTし、`source.processed_at`を更新
- どちらかで例外が発生した場合は`failed++`のみ行い、DBへの書き込みは一切行わない（`processed_at`も更新しない）

### 3. 記事取得（`server/utils/articles.ts`）

- `ArticleColumns`から`title`/`body`を削除
- `listPublishedArticles(db, page, locale)` / `getPublishedArticleById(db, id, locale)` に`locale`引数を追加
- `article_translations`を`article_id`でJOINし、指定`locale`の行があればそれを、なければ`locale='ja'`の行の`title`/`body`を採用する

### 4. API（Nitroルート）

| エンドポイント | 変更内容 |
|---|---|
| `GET /api/articles?page=1&lang=en` | `lang`クエリを追加。未指定・不正値（5言語以外）は`en`扱い |
| `GET /api/articles/:id?lang=en` | 同上 |

### 5. フロントエンド

- 共通ヘッダー（`app.vue`または`layouts/`）に言語選択ドロップダウンを追加：日本語 / English / 한국어 / 繁體中文 / 简体中文
- 選択中の言語は`localStorage`（キー例：`locale`）に保存。未選択時のデフォルトは`en`
- `pages/index.vue`・`pages/articles/[id].vue`は、選択中の言語を`lang`クエリパラメータとしてAPI呼び出しに含める。切り替え時はページ遷移なしで再フェッチする
- `ArticleCard.vue`は表示専用のまま変更なし（受け取った`title`/`body`をそのまま表示）

## データフロー

**生成〜翻訳**
1. `npm run generate`実行 → 未処理sourceごとに日本語記事生成 → 翻訳（4言語一括） → 両方成功したら`articles`+`article_translations`(5行)+`article_sources`を保存

**一覧・詳細表示**
1. ブラウザ：選択中言語を`localStorage`から読み、`GET /api/articles?lang=xx`または`GET /api/articles/:id?lang=xx`を呼ぶ
2. サーバー：`article_translations`から該当localeの行を取得、なければ`ja`にフォールバック
3. ブラウザ：取得したtitle/bodyを表示

**言語切り替え**
1. ユーザー：ヘッダーのドロップダウンで言語を選択
2. ブラウザ：`localStorage`を更新し、現在のページのAPIを新しい`lang`で再フェッチ

## エラーハンドリング

- 生成失敗（日本語記事生成 or 翻訳のどちらか）：該当sourceを丸ごとスキップ、`processed_at`は更新しない（次回`npm run generate`で最初からやり直し）
- 翻訳APIのレスポンスが不正なJSON、または5言語のいずれかが欠けている：`translateArticle`で例外を投げ、上記の「丸ごとスキップ」として扱う
- APIの`lang`クエリが5言語以外の不正値：`en`扱いにする（400エラーにはしない）
- 既存記事（移行済みja翻訳のみ）へのja以外のlangリクエスト：jaにフォールバック
- `GET /api/articles/:id`で記事自体が存在しない、または`status != 'published'`：従来通り404

## テスト方針

- `server/utils/generator.test.ts`：`translateArticle`のプロンプト構築・レスポンスパース（正常系・不正JSON/欠落言語での例外）の単体テスト追加。既存の生成失敗時スキップの挙動に、翻訳失敗時も同様にスキップされるケースを追加
- `server/utils/articles.test.ts`：`locale`指定時の翻訳取得、対象localeが存在しない場合のjaフォールバックの単体テスト追加
- `tests/api/articles.test.ts`：`lang`クエリの結合テスト（正常値・未指定・不正値）を追加
- `components/ArticleCard.test.ts`：変更なし（表示専用のため影響なし）
