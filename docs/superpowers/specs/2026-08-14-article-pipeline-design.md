# ASAKUSA TODAY — 記事自動生成パイプライン 設計

## 位置づけ

[[2026-08-14-articles-design.md]] で設計した記事一覧・詳細表示（読む側）に対して、記事データをどう作るか（書く側）を扱う。
確認済みの外部サイトから情報を収集し、AIが記事を自動生成、人間が承認してから公開する一連のパイプライン。

記事の手動投稿・編集機能、観光ガイド・スポット情報、ユーザー投稿（CGM）は本ドキュメントのスコープ外。

## スコープ

- 確認済みURLリストからのHTML収集・本文抽出
- 収集した情報からAI（Claude API）による記事の自動生成
- 生成記事を下書きとして保存し、管理者がレビューして承認/却下する簡易管理画面
- 承認された記事のみ一般公開（[[2026-08-14-articles-design.md]]の一覧・詳細APIに反映）

**スコープ外（将来拡張）**

- 収集・生成の自動定期実行（今回は`npm run`コマンドによる手動実行）
- 確認済みURLリストの管理画面（今回は静的ファイルで管理）
- 管理者の招待・権限管理機能（is_adminは手動SQLで設定）
- 複数AIプロバイダーの切り替え
- 画像の自動収集・生成

## 前提・方針

- 対象サイトは複数を想定し、`server/config/sources.ts`に静的なURLリスト（URL＋サイト名）として持つ。
- 各サイトはHTMLを取得してスクレイピング・パースする（RSS優先ではなく、汎用的にHTML本文抽出を基本方式とする）。
- 収集・生成は`npm run collect` / `npm run generate`による手動実行。
- AI生成記事は必ず**人間のレビュー・承認**を経てから公開する（事実誤認・著作権トラブル防止）。
- 生成記事には元サイトへの出典リンク（URL・サイト名）を必ず表示する。要約・リライトであり元文の丸写しをしないようAIに指示する。
- 承認操作は`is_admin`フラグを持つユーザーのみ行える。

## アーキテクチャ

```
① npm run collect
   sources.ts のURLリストを巡回 → HTML取得・cheerioでパース
   → sources テーブルに生データ保存（url一意制約で重複スキップ）

② npm run generate
   sources のうち processed_at IS NULL の行を対象に Claude API で記事生成
   → articles テーブルに status='draft' で保存（出典URL・サイト名も保存）
   → 対象 sources の processed_at を更新

③ /admin/drafts（is_admin限定）
   下書き一覧を見て「承認して公開」または「却下して削除」

④ 承認されたら status='published' となり、一般公開の一覧・詳細ページに反映される
```

## コンポーネント

### 1. DBスキーマ（sqlite3への追加分）

```sql
CREATE TABLE IF NOT EXISTS sources (
  id            INTEGER PRIMARY KEY,
  url           TEXT UNIQUE NOT NULL,
  site_name     TEXT NOT NULL,
  raw_text      TEXT NOT NULL,        -- パース後の本文テキスト
  fetched_at    TEXT NOT NULL,
  processed_at  TEXT NULL             -- 記事生成済みならタイムスタンプ、未処理はNULL
);
```

`articles`テーブルへの追加カラム（定義自体は[[2026-08-14-articles-design.md]]側）：
```sql
status        TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'published'
source_url    TEXT NOT NULL,
source_name   TEXT NOT NULL,
published_at  TEXT NULL                        -- 承認時にセット
```

`users`テーブルへの追加カラム：
```sql
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
```
最初の管理者は手動SQLで`is_admin=1`にする（招待機能は作らない）。

### 2. 収集（`server/utils/collector.ts` + `npm run collect`）

- `server/config/sources.ts`のURLリストを順に`fetch`
- `cheerio`（新規依存として追加）でHTMLをパースし、本文らしき部分を抽出
- `sources`に`INSERT OR IGNORE`（`url`のUNIQUE制約で重複を自然にスキップ）
- 個別URLのfetch失敗・パース失敗はそのURLだけスキップしログ出力、他URLの処理は継続する

### 3. 生成（`server/utils/generator.ts` + `npm run generate`）

- `sources`から`processed_at IS NULL`の行を取得
- Claude API（環境変数`ANTHROPIC_API_KEY`）に本文を渡し、タイトル・記事本文を生成
  - プロンプトに「要約・リライトであり元文の丸写し厳禁」「事実を捏造しない」を明記
- `articles`に`status='draft'`、`source_url`/`source_name`付きでINSERT
- 生成成功後、対象`sources`行の`processed_at`を更新
- Claude API呼び出し失敗はそのsourceをスキップ（`processed_at`は更新しない＝次回`npm run generate`で再試行される）

### 4. 管理画面（`/admin/drafts`、`is_admin`限定）

**API**

| エンドポイント | 役割 |
|---|---|
| `GET /api/admin/drafts` | `status='draft'`の記事一覧取得。`is_admin`必須、それ以外は403 |
| `POST /api/admin/drafts/:id/publish` | `status='published'`にし`published_at`をセット |
| `POST /api/admin/drafts/:id/reject` | 記事を削除し、元の`sources.processed_at`をNULLに戻す（再生成可能にする） |

**ページ**

- `pages/admin/drafts.vue`：下書きをタイトル・本文プレビュー・出典付きで一覧表示。「承認」「却下」ボタンを設置
- `is_admin=false`のユーザーがアクセスした場合は403相当の表示

## データフロー

**収集→生成**
1. 開発者：`npm run collect`実行 → 各URLをfetch・パース → `sources`へ保存
2. 開発者：`npm run generate`実行 → 未処理`sources`をClaude APIに渡し記事生成 → `articles`へ`draft`保存

**承認**
1. 管理者：`/admin/drafts`にログインしてアクセス
2. 管理者：下書きを読み、「承認」→ `POST /api/admin/drafts/:id/publish` → `status='published'`
3. 管理者：問題があれば「却下」→ `POST /api/admin/drafts/:id/reject` → 記事削除、再生成可能な状態に戻す

## エラーハンドリング

- 収集：個別URL失敗はスキップしログのみ、全体は継続
- 生成：Claude API失敗はそのsourceをスキップし、`processed_at`を更新しない
- 管理API：`is_admin=false`は403、対象idなしは404
- 一般公開API：`status != 'published'`の記事は詳細APIでも404扱い（[[2026-08-14-articles-design.md]]側で対応）

## テスト方針

- `server/utils/collector.test.ts`：HTMLパース部分の単体テスト（fetchはモック）
- `server/utils/generator.test.ts`：プロンプト構築・レスポンスパースの単体テスト（Claude API呼び出しはモック）
- `tests/api/admin.test.ts`：承認/却下API、`is_admin`権限チェックの結合テスト
- 既存`tests/api/articles.test.ts`に「`status='draft'`は一覧・詳細に出ない」ケースを追加
