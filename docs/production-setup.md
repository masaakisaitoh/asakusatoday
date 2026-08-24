# 本番環境セットアップ手順（VPS / Ubuntu想定）

対象: Nuxt 3 アプリ（Nitro `node-server`プリセット）+ better-sqlite3 + cronで動く収集/生成スクリプト。

## 0. 前提

- OS: Ubuntu 22.04/24.04 LTS 相当
- Node.js: 22.x（開発環境と同じメジャーバージョン。ずれるとbetter-sqlite3のネイティブバイナリと合わずクラッシュする）
- root/sudo権限を持つ非rootの運用ユーザー（例: `app`）

## 1. サーバー基本セットアップ

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential python3 git curl nginx ufw

# Node.js 22系（NodeSource経由）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v22.x であること
```

`build-essential` / `python3` は `better-sqlite3` のネイティブモジュールをビルドするのに必要（node-gyp依存）。

## 2. 運用ユーザーとディレクトリ

```bash
sudo useradd -m -s /bin/bash app
sudo mkdir -p /var/www/asakusatoday
sudo mkdir -p /var/lib/asakusatoday       # DB永続化先（アプリ外に置く）
sudo chown -R app:app /var/www/asakusatoday /var/lib/asakusatoday
```

## 3. コードの配置

以下は運用ユーザー `app` で実行（`sudo -iu app` で切り替え）。

```bash
cd /var/www/asakusatoday
git clone <このリポジトリのURL> .
```

## 4. 依存関係インストール & ビルド

ビルドには devDependencies（nuxt本体, tsx等）が必要なので `npm ci` はフルインストールする。cronスクリプト（`scripts/collect.ts` / `scripts/generate.ts`）も `tsx` に依存するため、本番でも devDependencies は削らないこと。

```bash
npm ci
npm run build
```

ビルドは**VPS上で直接実行**すること。ローカルでビルドした `.output` を転送すると、`better-sqlite3` のネイティブバイナリがOS/Nodeバージョン不一致で動かない可能性がある。

## 5. 環境変数

`/var/www/asakusatoday/.env` を作成（gitには含めない、`.gitignore`済み）:

```bash
NODE_ENV=production
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DATABASE_PATH=/var/lib/asakusatoday/app.sqlite3
```

- `ANTHROPIC_API_KEY`: `scripts/generate.ts`（記事生成）で使用。ローカルの `.env` に入っているキーをそのまま使うなら**必ずローテーション**してから使うこと（今まで開発機に平文で置かれていたキーを本番でも使い回すのはリスク）。
- `DATABASE_PATH`: 未設定だと `./data/app.sqlite3`（アプリディレクトリ内）に作られる。デプロイの度に消えたり権限問題が起きやすいので、アプリ外の `/var/lib/asakusatoday/` を指定する。
- DBスキーマは初回アクセス時に自動作成される（マイグレーションコマンド不要）。

パーミッション:

```bash
chmod 600 /var/www/asakusatoday/.env
```

## 6. systemdサービス化

`/etc/systemd/system/asakusatoday.service` を作成（sudo必要）:

```ini
[Unit]
Description=Asakusa Today (Nuxt/Nitro)
After=network.target

[Service]
Type=simple
User=app
WorkingDirectory=/var/www/asakusatoday
EnvironmentFile=/var/www/asakusatoday/.env
Environment=PORT=3000
Environment=HOST=127.0.0.1
ExecStart=/usr/bin/node /var/www/asakusatoday/.output/server/index.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now asakusatoday
sudo systemctl status asakusatoday
```

ログは `journalctl -u asakusatoday -f` で確認。

## 7. Nginxリバースプロキシ + TLS

`/etc/nginx/sites-available/asakusatoday`:

```nginx
server {
    listen 80;
    server_name your-domain.example;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/asakusatoday /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# TLS証明書（Let's Encrypt）
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

セッションCookieは `secure: NODE_ENV === 'production'` で発行されるため、**HTTPS必須**（HTTP配信だとログインセッションが機能しない）。

## 8. ファイアウォール

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

アプリのポート3000は `127.0.0.1` バインドなので外部から直接叩けない（Nginx経由のみ）。

## 9. 収集・生成バッチのcron化

`scripts/collect.ts`（記事ソース収集）と `scripts/generate.ts`（Anthropic APIで記事生成）を定期実行する。運用ユーザー `app` の crontabに登録:

```bash
crontab -e
```

```cron
# 毎時0分にソース収集
0 * * * * cd /var/www/asakusatoday && /usr/bin/npx tsx --env-file-if-exists=.env scripts/collect.ts >> /var/log/asakusatoday/collect.log 2>&1

# 収集の30分後に記事生成（ANTHROPIC_API_KEYが必要）
30 * * * * cd /var/www/asakusatoday && /usr/bin/npx tsx --env-file-if-exists=.env scripts/generate.ts >> /var/log/asakusatoday/generate.log 2>&1
```

ログディレクトリを先に作る:

```bash
sudo mkdir -p /var/log/asakusatoday
sudo chown app:app /var/log/asakusatoday
```

cron環境には `.env` が自動で読み込まれないシェルもあるので、`cd` してから `--env-file-if-exists=.env` を使うか、cron内で `DATABASE_PATH` / `ANTHROPIC_API_KEY` を明示的にexportする。実行頻度はサイトの更新方針に合わせて調整すること（上記は一例）。

## 10. 初回管理者ユーザーの設定

管理者フラグ（`is_admin`）はDB上のカラムのみで、環境変数や設定ファイルでは管理していない。まずSymbolウォレットでログインしてユーザーを作成し、その後DBを直接更新する:

```bash
sudo systemctl stop asakusatoday   # 書き込み中の競合を避けるため一旦停止（任意）
sqlite3 /var/lib/asakusatoday/app.sqlite3 \
  "UPDATE users SET is_admin = 1 WHERE address = 'ログインしたユーザーのSymbolアドレス';"
sudo systemctl start asakusatoday
```

## 11. Symbolネットワーク設定

`utils/symbolCrypto.ts` の `NETWORK` は `NODE_ENV` で自動切替される（`NODE_ENV=production` なら `Network.MAINNET`、それ以外は `Network.TESTNET`）。本手順の systemd ユニット（6章）で `Environment=NODE_ENV=production` を設定しているため、本番では自動的に MAINNET で動く。TESTNET時代に作成されたアカウントは MAINNET アドレスと非互換になるので、既存ユーザーがいる状態で切り替える場合は互換性が失われる点に注意。

## 12. バックアップ

WALモードのSQLiteはファイルを単純コピーすると壊れる可能性があるため、オンラインバックアップコマンドを使う:

```bash
# 例: 毎日3時にバックアップ（app crontabに追加）
0 3 * * * sqlite3 /var/lib/asakusatoday/app.sqlite3 ".backup /var/backups/asakusatoday/app-$(date +\%Y\%m\%d).sqlite3"
```

`/var/backups/asakusatoday` を事前に作成し `app` ユーザーに書き込み権限を与えること。世代管理（古いバックアップの削除）も別途cronか`find -mtime`で追加する。

## 13. デプロイ更新手順（2回目以降）

```bash
sudo -iu app
cd /var/www/asakusatoday
git pull
npm ci
npm run build
exit
sudo systemctl restart asakusatoday
```

## チェックリスト

- [ ] Node.jsバージョンをVPSと開発機で揃えた
- [ ] `.env` に本番用 `ANTHROPIC_API_KEY`（ローテーション済み）を設定した
- [ ] `DATABASE_PATH` をアプリ外の永続ディレクトリに向けた
- [ ] systemdサービスが起動・自動再起動する
- [ ] Nginx + HTTPS 経由でアクセスでき、ログインセッションが維持される
- [ ] collect/generateのcronが動いている（ログ確認）
- [ ] 管理者ユーザーを1人設定した
- [ ] SymbolのTESTNET/MAINNET方針を確認した
- [ ] DBの自動バックアップを設定した
