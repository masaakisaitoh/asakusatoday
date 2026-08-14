# ASAKUSA TODAY — Symbol認証基盤 設計

## 位置づけ

ASAKUSA TODAY は英語圏向けのウェブアプリで、以下を組み合わせたサイトになる。

- 編集部による浅草関連のニュース・コラム記事
- 観光ガイド・スポット情報（店舗・イベント等）
- ユーザーによるコンテンツ投稿（CGM）

技術スタックは Nuxt.js（フロントエンド／Nitroサーバー）＋ sqlite3。
ユーザーアカウントは Symbol(XYM) ブロックチェーンの秘密鍵ベースで管理する。

プロジェクト規模が大きいため、以下の2つの独立したサブプロジェクトに分割して設計する。

1. **Symbol認証基盤**（本ドキュメントの対象）
2. コア機能（Nuxt.js + sqlite3、記事・観光情報・ユーザー投稿のコンテンツ管理） — 別途設計予定

本ドキュメントは (1) Symbol認証基盤の設計を扱う。

## スコープ

- Symbolアカウントの新規作成、および既存アカウント（秘密鍵）のインポート
- 秘密鍵による本人確認（署名ベースのログイン）
- ログイン後のセッション管理
- ユーザープロフィール（ユーザー名・性別・生年・国籍）の管理
- ランダム生成のドット絵アバター表示、および作り直し機能

**スコープ外（将来拡張の可能性はあるが、今回は作らない）**

- XYM/トークンの送金・報酬機能
- 外部ウォレット拡張機能・WalletConnect的な連携
- Symbolノードへの問い合わせを要する処理（オンチェーンの残高照会・アカウント存在確認等）

## 前提・方針

- **秘密鍵はサーバーに一切保存しない。** 鍵の生成・保管・署名はすべてブラウザ側で完結し、秘密鍵はネットワークを一度も流れない。サーバーが受け取るのは公開鍵・アドレス・署名のみ。
- ログインの署名検証は **オフライン**（Symbolノードへの問い合わせ不要）。公開鍵と署名の数学的検証のみで完結する。
- 使用ネットワークは **Symbol Testnet**。将来的にMainnetへ切り替え可能な設計とする。
- ログインで使うアカウントは、本アプリ内で新規作成したものに加え、既存のSymbolアカウント（秘密鍵）のインポートにも対応する。

## アーキテクチャ

- Nuxt 3（Nitroサーバー）の単一アプリ構成。フロントエンドとAPIを同居させる。
- クライアント側：symbol-sdk（JS実装）を用いてブラウザ内で鍵ペア生成・秘密鍵によるnonce署名を行う。
- サーバー側：Nitro APIルートで「nonce発行」「署名検証」「セッション発行」のみを担当。
- DB：sqlite3（better-sqlite3による同期アクセス）。
- アバター：DiceBear（`@dicebear/core` + `@dicebear/collection`、`pixel-art`スタイル）。シード文字列からドット絵の顔をその場で生成する（SVG）。

## コンポーネント

### 1. クライアント側 AccountService

- **新規作成**：keypair生成 → 秘密鍵を一度表示＋コピー機能＋「保存しました」確認チェックボックス → ログインへ進行
- **インポート**：既存の秘密鍵を貼り付け → アドレス導出 → ログイン
- **署名**：ログイン時にサーバー発行のnonceを秘密鍵で署名

### 2. サーバー側 API（Nitroルート）

| エンドポイント | 役割 |
|---|---|
| `POST /api/auth/nonce` | 対象アドレス宛の使い捨てnonceを発行（TTL短め、sqliteに保存） |
| `POST /api/auth/verify` | address / publicKey / signature / nonce を受け取り、symbol-sdkでオフライン署名検証 → ユーザー行をfind or create → セッション発行 → httpOnly Cookieにセッションidを格納 |
| `POST /api/auth/logout` | セッション破棄 |
| `PATCH /api/user/profile` | ユーザー名・性別・生年・国籍の更新（user_nameは一意性チェック必須） |
| `POST /api/user/avatar/regenerate` | avatar_seedを新規ランダム生成し即時保存。押すたびに反映される |

### 3. DBスキーマ（sqlite3）

```sql
users(
  id            INTEGER PRIMARY KEY,
  address       TEXT UNIQUE NOT NULL,   -- Symbolアドレス
  public_key    TEXT NOT NULL,
  user_name     TEXT UNIQUE NOT NULL,   -- 初期値: ランダム16文字英数字、変更可
  gender        TEXT NULL,              -- 'male' | 'female' | 'other' | 'unspecified' | NULL(未入力)
  birth_year    INTEGER NULL,           -- 任意、西暦
  nationality   TEXT NULL,              -- 任意、ISO 3166-1 alpha-2（例: JP, US）
  avatar_seed   TEXT NOT NULL,          -- DiceBear pixel-art用シード。新規作成時にランダム生成、作り直しで再生成
  created_at    TEXT NOT NULL
)

nonces(
  nonce         TEXT PRIMARY KEY,
  address       TEXT NOT NULL,
  expires_at    TEXT NOT NULL
)

sessions(
  id            TEXT PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL
)
```

**user_name 生成・管理ロジック**

- アカウント新規作成時、16文字のランダム英数字を自動生成して初期値とする。
- `UNIQUE`制約に衝突した場合は再生成してリトライする（16文字英数字であれば衝突確率は極めて低いが、念のため保険をかける）。
- ユーザーはプロフィール画面から変更可能。変更時も一意性チェック必須。

**avatar_seed 生成・管理ロジック**

- アカウント新規作成時、ランダムなシード文字列を生成し初期アバターとする（一意性は不要、DiceBearの表示さえ変われば良い）。
- プロフィール画面の「作り直す」ボタンを押すたびに新しいシードを生成し、即時DBへ保存・表示に反映する。

## データフロー（ログイン）

1. ブラウザ：秘密鍵入力 → アドレス／公開鍵を導出
2. ブラウザ → サーバー：`POST /api/auth/nonce`（address指定）
3. サーバー：nonce生成・sqliteに保存 → 返却
4. ブラウザ：受け取ったnonceを秘密鍵で署名
5. ブラウザ → サーバー：`POST /api/auth/verify`（address, publicKey, signature, nonce）
6. サーバー：
   - nonceの有効性（存在・未使用・期限内）を確認
   - 公開鍵で署名をオフライン検証（Symbolノード不要）
   - 検証成功時、addressに紐づくユーザー行をfind or create（新規時はuser_name・avatar_seedを自動生成）
   - セッション行を作成し、セッションidをhttpOnly Cookieに格納して返却
   - 使用済みnonceを削除（リプレイ攻撃防止）

## エラーハンドリング

- nonceが存在しない／期限切れ／不一致 → `401`、再度nonce取得を促す
- 署名検証失敗 → `401`「署名が無効です」
- nonceは検証の成否に関わらず検証後は削除し、再利用不可とする（リプレイ攻撃対策）
- 秘密鍵の形式不正はクライアント側フォームバリデーションでブロックする
- user_name変更時に一意性違反 → `409`、別の値を促す

## テスト方針

- **サーバー**：nonce発行・検証ロジックの単体テスト（正常系／不正な署名／期限切れ／nonce再利用＝リプレイ攻撃）
- **クライアント**：鍵生成・インポート・署名処理のユニットテスト
- **E2E**：新規アカウント作成 → ログイン → プロフィール編集（user_name変更・アバター作り直し含む） → ログアウトの一連フロー
