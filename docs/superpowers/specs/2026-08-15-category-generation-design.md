# ASAKUSA TODAY — カテゴリ単位の記事生成＋トーン変更 設計

## 位置づけ

[[2026-08-14-article-pipeline-design.md]] で設計した記事生成パイプライン（1ソース = 1記事）を、
「1カテゴリ = 1記事」に変更する。あわせて生成される記事の文体を、硬いニュース調から地域ブログ風の
親しみやすいトーンに変更する。

`server/config/sources.ts` の `SourceSite` にはすでに `category`（英語スラッグ）が付与済み。本設計はこの
`category` を記事生成側でも使う形に、パイプラインとデータモデルを拡張するもの。

## スコープ

- `sources` を `category` でグループ化し、カテゴリごとに1本の記事を生成する
- 生成記事が複数の出典サイトを持てるようにデータモデルを変更する（`article_sources` 中間テーブル）
- `articles` に `category` 列を追加する
- 生成プロンプトのトーンを「地域ブログ風」に変更する
- 出典表示（記事詳細ページ・管理画面の下書き一覧）を複数リンク対応にする
- 却下（reject）時の再生成対象リセットを、複数ソース前提に対応させる

**スコープ外（将来拡張）**

- 一般公開ページでのカテゴリ絞り込みUI（`category` 列は追加するが、フィルタUIは別タスク）
- カテゴリごとの生成頻度・優先度制御
- 1カテゴリ内の記事本文の長さ上限・ソース数上限による分割

## 前提・方針

- 1回の `npm run generate` 実行で、`processed_at IS NULL` なソースを `category` ごとにグルーピングし、
  グループごとに1回のClaude API呼び出しで1記事を生成する。
- 複数ソースの本文はサイト名付きで連結してプロンプトに渡す。Claude Opus 5は長文コンテキストを扱えるため、
  本文の文字数カットは行わない。
- 記事とソースは多対多になるため中間テーブル `article_sources` を新設する。`articles.source_url` /
  `articles.source_name` は廃止する（本番データがまだ存在しない開発段階のため、互換維持は不要）。
- 生成トーンは「地元の人が親しみやすく書くレポート」を基準にする。です/ます調は維持しつつ、硬いニュース文体
  ではなく、少しくだけた言い回しを許容する。事実の捏造・誇張はしない。絵文字は使わない。

## アーキテクチャ

```
① npm run collect  （変更なし）
   sources.ts のURLリストを巡回 → HTML取得・cheerioでパース
   → sources テーブルに category 付きで生データ保存

② npm run generate  （変更）
   sources のうち processed_at IS NULL の行を category ごとにグループ化
   → グループごとに1回のClaude API呼び出しで1記事生成
   → articles テーブルに status='draft', category 付きで保存
   → article_sources に対象ソースを全て紐付け
   → 対象 sources 全ての processed_at を更新

③ /admin/drafts（is_admin限定、表示のみ変更）
   下書き一覧を見て「承認して公開」または「却下して削除」
   出典は複数リンクで一覧表示

④ 承認されたら status='published' となり、一般公開の一覧・詳細ページに反映される
   詳細ページの出典も複数リンクで一覧表示
```

## コンポーネント

### 1. DBスキーマ変更

`articles` テーブル：
```sql
-- 削除
source_url    TEXT NOT NULL,
source_name   TEXT NOT NULL,

-- 追加
category      TEXT NOT NULL
```

新設 `article_sources` テーブル：
```sql
CREATE TABLE IF NOT EXISTS article_sources (
  article_id  INTEGER NOT NULL REFERENCES articles(id),
  source_id   INTEGER NOT NULL REFERENCES sources(id),
  PRIMARY KEY (article_id, source_id)
);
```

`sources` テーブルは変更なし（`category` は導入済み）。

既存の開発DBはまだ本番データを持たないため、`ALTER TABLE ... DROP COLUMN` 等の移行処理は書かず、
ローカルの `data/app.sqlite3` を削除して `SCHEMA` から作り直す運用でよい。`db.ts` の `SCHEMA` を
新しい定義に書き換え、`migrate()` に残す既存ロジックは `sources.category` 追加分のみとする
（`articles.source_url`/`source_name` 用の移行ロジックは不要）。

### 2. 生成（`server/utils/generator.ts`）

- `sources` から `processed_at IS NULL` の行を取得し、`category` でグループ化する
- カテゴリごとに、グループ内の全ソースの `raw_text` を `site_name` ラベル付きで連結し、1回のClaude API
  呼び出しでタイトル・本文を生成する
- プロンプトの指示文を「ニュース記者」から「地域ブログを書く地元ライター」トーンに変更：
  - です/ます調は維持
  - 硬いニュース見出し・文体を避け、親しみやすい言い回しを使う
  - 複数の出典を自然な1本のレポートにまとめる（出典ごとの箇条書き列挙にしない）
  - 事実の捏造・誇張はしない、絵文字は使わない（既存ルールを維持・踏襲）
- `articles` に `status='draft'`, `category` 付きでINSERT
- INSERTした `article_id` と、グループ内の全 `source_id` を `article_sources` にINSERT
- 生成成功後、対象ソース全ての `processed_at` を更新
- Claude API呼び出し失敗はそのカテゴリのグループをスキップ（`processed_at`は更新しない＝次回再試行）

### 3. 管理画面・公開ページ（表示のみ変更）

**API**

| エンドポイント | 変更内容 |
|---|---|
| `GET /api/admin/drafts` | 記事ごとに `article_sources` をJOINして `sources: {url, siteName}[]` を含める |
| `POST /api/admin/drafts/:id/reject` | `article_id` に紐づく全ソースの `processed_at` をNULLに戻してから記事を削除（`article_sources` 行も削除） |
| `GET /api/articles` | `listPublishedArticles` が各記事の `sources` と `category` を含める |
| `GET /api/articles/:id` | `getPublishedArticleById` が `sources` と `category` を含める |

**ページ**

- `pages/admin/drafts.vue`：出典表示を単一リンクから複数リンクの一覧に変更
- `pages/articles/[id].vue`：出典表示を単一リンクから複数リンクの一覧に変更
- `pages/index.vue` / `components/ArticleCard.vue`：変更なし（`category`は今回表示しない）

## データフロー

**収集→生成**
1. 開発者：`npm run collect`実行 → 各URLをfetch・パース → `sources`へ`category`付きで保存
2. 開発者：`npm run generate`実行 → 未処理`sources`を`category`でグルーピング → カテゴリごとにClaude APIへ
   まとめて渡し1記事生成 → `articles`へ`draft`保存 → `article_sources`へ紐付け保存

**承認・却下**（変更なし、対象が複数ソースになる点のみ異なる）
1. 管理者：`/admin/drafts`で下書きを読み、「承認」→ `status='published'`
2. 管理者：問題があれば「却下」→ 紐づく全ソースの`processed_at`をNULLに戻し、記事を削除

## エラーハンドリング

- 生成：Claude API失敗はそのカテゴリグループをスキップし、対象ソース全ての`processed_at`を更新しない
- カテゴリ内に1件もソースがなければ、そのカテゴリはスキップ（グループ化の時点で自然に除外される）
- その他（収集のエラー処理、管理API・一般公開APIの権限/404処理）は[[2026-08-14-article-pipeline-design.md]]から変更なし

## テスト方針

- `server/utils/generator.test.ts`：
  - 複数ソースを1グループとしてまとめ、1回のAPI呼び出しで1記事を生成すること
  - 生成後、グループ内全ソースの`processed_at`が更新されること
  - `article_sources`にグループ内全ソースが紐付くこと
  - カテゴリが異なれば別グループ・別記事になること
  - 1グループの生成失敗が他グループの処理に影響しないこと
  - プロンプトに親しみやすいトーンの指示が含まれること（`buildGenerationPrompt`の出力アサーション）
- `server/utils/db.test.ts`：`article_sources`テーブルが作成されること、`articles.category`列が存在すること
- `tests/api/admin.test.ts`：下書き一覧APIが複数出典を返すこと、却下APIが複数ソースの`processed_at`を
  正しくNULLに戻すこと
- `tests/api/articles.test.ts`：一覧・詳細APIが`sources`配列と`category`を返すこと
