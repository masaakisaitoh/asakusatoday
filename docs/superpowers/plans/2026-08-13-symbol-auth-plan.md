# Symbol認証基盤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ASAKUSA TODAYのユーザーが、Symbol(XYM)ブロックチェーンの鍵ペアを使って本人確認（アカウント作成・インポート・秘密鍵によるログイン）できる認証基盤を実装する。

**Architecture:** Nuxt 3（Nitroサーバー）の単一アプリ。鍵の生成・保管・署名はすべてブラウザ側（symbol-sdk）で完結し、秘密鍵はネットワークを一度も流れない。サーバーはnonce発行・オフライン署名検証・httpOnly Cookieセッション発行のみを担当し、sqlite3（better-sqlite3）にユーザー・nonce・セッションを保存する。

**Tech Stack:** Nuxt 3 / TypeScript / better-sqlite3 / symbol-sdk / zod / @dicebear/core + @dicebear/collection（pixel-artスタイル） / vitest + @nuxt/test-utils + @vue/test-utils + playwright

参照仕様: `docs/superpowers/specs/2026-08-13-symbol-auth-design.md`

## Global Constraints

- 秘密鍵はサーバーに一切保存しない。生成・保管・署名はすべてクライアント側で完結する。
- ログイン時の署名検証はオフラインのみ。Symbolノードへの問い合わせは行わない。
- 使用ネットワークはSymbol Testnet（`NetworkType.TEST_NET`）。
- DBはsqlite3（better-sqlite3、同期API）。
- セッションはhttpOnly Cookie + サーバー側セッションレコードで管理する。
- `user_name`：初期値は16文字のランダム英数字、`UNIQUE`制約必須、ユーザーが変更可能。
- `gender`：`'male' | 'female' | 'other' | 'unspecified' | null`、任意項目。
- `birth_year`：整数、任意項目。
- `nationality`：ISO 3166-1 alpha-2の2文字コード、任意項目。
- `avatar_seed`：DiceBear `pixel-art`スタイル用のシード文字列のみDBに保存する。「作り直す」操作は押すたびに即時DB保存する。
- **gitコマンド（`git add` / `git commit` 等）はこのプロジェクトでは絶対に実行しない。コミットは必ず人間が行う。** 各タスクの最終ステップは「コミット」ではなく「人間へレビュー・コミットを依頼する」に置き換える。

---

### Task 1: プロジェクトscaffold

**Files:**
- Create: `package.json`
- Create: `nuxt.config.ts`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `app/app.vue`
- Create: `app/pages/index.vue`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: 動作するNuxt3プロジェクトの土台。以降の全タスクはこの上に構築する。

- [ ] **Step 1: 依存関係を定義する**

```json
// package.json
{
  "name": "asakusa-today",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "symbol-sdk": "^3.2.1",
    "@dicebear/core": "^9.2.0",
    "@dicebear/collection": "^9.2.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "nuxt": "^3.14.0",
    "vue": "^3.5.0",
    "vitest": "^2.1.0",
    "@nuxt/test-utils": "^3.14.0",
    "@vue/test-utils": "^2.4.0",
    "happy-dom": "^15.0.0",
    "playwright": "^1.48.0",
    "@types/better-sqlite3": "^7.6.11"
  }
}
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  compatibilityDate: '2026-08-13',
  devtools: { enabled: true }
})
```

```json
// tsconfig.json
{
  "extends": "./.nuxt/tsconfig.json"
}
```

```ts
// vitest.config.ts
import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'happy-dom'
  }
})
```

```
# .gitignore
node_modules
.nuxt
.output
data/*.sqlite3
data/*.sqlite3-*
```

```vue
<!-- app/app.vue -->
<template>
  <NuxtPage />
</template>
```

```vue
<!-- app/pages/index.vue -->
<template>
  <div>ASAKUSA TODAY</div>
</template>
```

- [ ] **Step 2: 依存関係をインストールし、Playwrightのブラウザを取得する**

Run: `npm install && npx playwright install chromium`
Expected: `node_modules` が生成され、エラーなく終了する

- [ ] **Step 3: 起動スモークテストを書く（失敗する状態で）**

```ts
// tests/smoke.test.ts
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('app boots', async () => {
  await setup({ server: true })

  it('serves the root page', async () => {
    const html = await $fetch('/')
    expect(html).toContain('ASAKUSA TODAY')
  })
})
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npx vitest run tests/smoke.test.ts`
Expected: PASS（この時点でscaffold自体は既に揃っているため、Step1〜3を先に終えていれば最初からPASSする）

- [ ] **Step 5: 人間へレビュー・コミットを依頼する**

gitコマンドはこのプロジェクトでは実行しない。ここまでの変更一式をレビューし、コミットするかどうかを人間に判断してもらう。

---

### Task 2: DBスキーマ・マイグレーション

**Files:**
- Create: `server/utils/db.ts`
- Test: `server/utils/db.test.ts`

**Interfaces:**
- Produces: `useDb(): Database.Database`（`users` / `nonces` / `sessions` テーブルを持つsqlite3接続のシングルトン）、`resetDbForTests(): void`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// server/utils/db.test.ts
import { describe, it, expect, beforeEach } from 'vitest'

beforeEach(() => {
  process.env.DATABASE_PATH = ':memory:'
})

describe('useDb', () => {
  it('creates users, nonces, sessions tables', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row: any) => row.name)
    expect(tables).toEqual(expect.arrayContaining(['users', 'nonces', 'sessions']))
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/db.test.ts`
Expected: FAIL（`./db` が存在しない）

- [ ] **Step 3: 実装する**

```ts
// server/utils/db.ts
import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

let db: Database.Database | null = null

function dbPath(): string {
  return process.env.DATABASE_PATH || './data/app.sqlite3'
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  address TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  user_name TEXT UNIQUE NOT NULL,
  gender TEXT,
  birth_year INTEGER,
  nationality TEXT,
  avatar_seed TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`

export function useDb(): Database.Database {
  if (db) return db
  const path = dbPath()
  if (path !== ':memory:') {
    const dir = dirname(path)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  }
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  return db
}

export function resetDbForTests(): void {
  db = null
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npx vitest run server/utils/db.test.ts`
Expected: PASS

- [ ] **Step 5: 人間へレビュー・コミットを依頼する**

---

### Task 3: ユーザー名生成ユーティリティ

**Files:**
- Create: `server/utils/username.ts`
- Test: `server/utils/username.test.ts`

**Interfaces:**
- Consumes: `useDb()`, `resetDbForTests()`（Task 2）
- Produces: `randomUserName(length?: number): string`、`generateUniqueUserName(db, generator?: () => string): string`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// server/utils/username.test.ts
import { describe, it, expect } from 'vitest'

describe('randomUserName', () => {
  it('returns a 16-character alphanumeric string', async () => {
    const { randomUserName } = await import('./username')
    expect(randomUserName()).toMatch(/^[A-Za-z0-9]{16}$/)
  })
})

describe('generateUniqueUserName', () => {
  it('retries when the candidate collides with an existing user_name', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    process.env.DATABASE_PATH = ':memory:'
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO users (address, public_key, user_name, avatar_seed, created_at)
       VALUES ('addrA', 'pubA', 'TAKEN0000000000', 'seedA', datetime('now'))`
    ).run()

    const { generateUniqueUserName } = await import('./username')
    let calls = 0
    const generator = () => {
      calls++
      return calls === 1 ? 'TAKEN0000000000' : 'FRESH0000000000'
    }

    expect(generateUniqueUserName(db, generator)).toBe('FRESH0000000000')
    expect(calls).toBe(2)
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/username.test.ts`
Expected: FAIL（`./username` が存在しない）

- [ ] **Step 3: 実装する**

```ts
// server/utils/username.ts
import { randomBytes } from 'node:crypto'
import type Database from 'better-sqlite3'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export function randomUserName(length = 16): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return out
}

export function generateUniqueUserName(
  db: Database.Database,
  generator: () => string = randomUserName
): string {
  const exists = db.prepare('SELECT 1 FROM users WHERE user_name = ?')
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generator()
    if (!exists.get(candidate)) return candidate
  }
  throw new Error('user_name generation failed after 10 attempts')
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npx vitest run server/utils/username.test.ts`
Expected: PASS

- [ ] **Step 5: 人間へレビュー・コミットを依頼する**

---

### Task 4: アバターシード生成ユーティリティ

**Files:**
- Create: `server/utils/avatarSeed.ts`
- Test: `server/utils/avatarSeed.test.ts`

**Interfaces:**
- Produces: `generateAvatarSeed(): string`（24文字の16進文字列）

- [ ] **Step 1: 失敗するテストを書く**

```ts
// server/utils/avatarSeed.test.ts
import { describe, it, expect } from 'vitest'

describe('generateAvatarSeed', () => {
  it('returns a 24-character hex string', async () => {
    const { generateAvatarSeed } = await import('./avatarSeed')
    expect(generateAvatarSeed()).toMatch(/^[0-9a-f]{24}$/)
  })

  it('returns a different value on each call', async () => {
    const { generateAvatarSeed } = await import('./avatarSeed')
    expect(generateAvatarSeed()).not.toBe(generateAvatarSeed())
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/avatarSeed.test.ts`
Expected: FAIL（`./avatarSeed` が存在しない）

- [ ] **Step 3: 実装する**

```ts
// server/utils/avatarSeed.ts
import { randomBytes } from 'node:crypto'

export function generateAvatarSeed(): string {
  return randomBytes(12).toString('hex')
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npx vitest run server/utils/avatarSeed.test.ts`
Expected: PASS

- [ ] **Step 5: 人間へレビュー・コミットを依頼する**

---

### Task 5: Symbol鍵ペア操作ユーティリティ（クライアント/サーバー共有）

**Files:**
- Create: `utils/symbolCrypto.ts`（Nuxtのプロジェクトルート直下の`utils/`はクライアント・サーバー双方から使えるので、ここに置く）
- Test: `utils/symbolCrypto.test.ts`

**Interfaces:**
- Produces:
  - `interface SymbolAccount { privateKey: string; publicKey: string; address: string }`
  - `generateAccount(): SymbolAccount`
  - `importAccount(privateKeyHex: string): SymbolAccount`
  - `signMessage(privateKeyHex: string, message: string): string`
  - `verifySignature(publicKeyHex: string, message: string, signatureHex: string): boolean`
  - `deriveAddress(publicKeyHex: string): string`

*(注: `symbol-sdk`のAccount/PublicAccount APIはバージョンによって細部が変わることがある。ここでの実装がインストールしたバージョンの型と食い違う場合は、`node_modules/symbol-sdk`の型定義を確認して合わせること。)*

- [ ] **Step 1: 失敗するテストを書く**

```ts
// utils/symbolCrypto.test.ts
import { describe, it, expect } from 'vitest'

describe('symbolCrypto', () => {
  it('verifies a signature produced by the matching private key', async () => {
    const { generateAccount, signMessage, verifySignature } = await import('./symbolCrypto')
    const account = generateAccount()
    const signature = signMessage(account.privateKey, 'hello-nonce')
    expect(verifySignature(account.publicKey, 'hello-nonce', signature)).toBe(true)
  })

  it('rejects a signature for a tampered message', async () => {
    const { generateAccount, signMessage, verifySignature } = await import('./symbolCrypto')
    const account = generateAccount()
    const signature = signMessage(account.privateKey, 'hello-nonce')
    expect(verifySignature(account.publicKey, 'tampered', signature)).toBe(false)
  })

  it('derives the same address exposed by generateAccount', async () => {
    const { generateAccount, deriveAddress } = await import('./symbolCrypto')
    const account = generateAccount()
    expect(deriveAddress(account.publicKey)).toBe(account.address)
  })

  it('imports the same account from its private key', async () => {
    const { generateAccount, importAccount } = await import('./symbolCrypto')
    const original = generateAccount()
    const imported = importAccount(original.privateKey)
    expect(imported.address).toBe(original.address)
    expect(imported.publicKey).toBe(original.publicKey)
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run utils/symbolCrypto.test.ts`
Expected: FAIL（`./symbolCrypto` が存在しない）

- [ ] **Step 3: 実装する**

```ts
// utils/symbolCrypto.ts
import { Account, PublicAccount, NetworkType } from 'symbol-sdk'

export const SYMBOL_NETWORK_TYPE = NetworkType.TEST_NET

export interface SymbolAccount {
  privateKey: string
  publicKey: string
  address: string
}

function toSymbolAccount(account: Account): SymbolAccount {
  return {
    privateKey: account.privateKey,
    publicKey: account.publicKey,
    address: account.address.plain()
  }
}

export function generateAccount(): SymbolAccount {
  return toSymbolAccount(Account.generateNewAccount(SYMBOL_NETWORK_TYPE))
}

export function importAccount(privateKeyHex: string): SymbolAccount {
  return toSymbolAccount(Account.createFromPrivateKey(privateKeyHex, SYMBOL_NETWORK_TYPE))
}

export function signMessage(privateKeyHex: string, message: string): string {
  const account = Account.createFromPrivateKey(privateKeyHex, SYMBOL_NETWORK_TYPE)
  return account.signData(message)
}

export function verifySignature(publicKeyHex: string, message: string, signatureHex: string): boolean {
  const publicAccount = PublicAccount.createFromPublicKey(publicKeyHex, SYMBOL_NETWORK_TYPE)
  return publicAccount.verifySignature(message, signatureHex)
}

export function deriveAddress(publicKeyHex: string): string {
  return PublicAccount.createFromPublicKey(publicKeyHex, SYMBOL_NETWORK_TYPE).address.plain()
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npx vitest run utils/symbolCrypto.test.ts`
Expected: PASS

- [ ] **Step 5: 人間へレビュー・コミットを依頼する**

---

### Task 6: nonce発行・検証ユーティリティ

**Files:**
- Create: `server/utils/nonce.ts`
- Test: `server/utils/nonce.test.ts`

**Interfaces:**
- Consumes: `useDb()`, `resetDbForTests()`（Task 2）
- Produces: `issueNonce(db, address: string): { nonce: string; expiresAt: string }`、`consumeNonce(db, address: string, nonce: string): boolean`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// server/utils/nonce.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

beforeEach(() => {
  process.env.DATABASE_PATH = ':memory:'
})

afterEach(() => {
  vi.useRealTimers()
})

describe('issueNonce / consumeNonce', () => {
  it('consumes a freshly issued nonce for the matching address', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { issueNonce, consumeNonce } = await import('./nonce')

    const { nonce } = issueNonce(db, 'addrA')
    expect(consumeNonce(db, 'addrA', nonce)).toBe(true)
  })

  it('cannot reuse a nonce (replay protection)', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { issueNonce, consumeNonce } = await import('./nonce')

    const { nonce } = issueNonce(db, 'addrA')
    consumeNonce(db, 'addrA', nonce)
    expect(consumeNonce(db, 'addrA', nonce)).toBe(false)
  })

  it('rejects a nonce issued for a different address', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { issueNonce, consumeNonce } = await import('./nonce')

    const { nonce } = issueNonce(db, 'addrA')
    expect(consumeNonce(db, 'addrB', nonce)).toBe(false)
  })

  it('rejects an expired nonce', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { issueNonce, consumeNonce } = await import('./nonce')

    vi.useFakeTimers()
    const { nonce } = issueNonce(db, 'addrA')
    vi.advanceTimersByTime(6 * 60 * 1000)
    expect(consumeNonce(db, 'addrA', nonce)).toBe(false)
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/nonce.test.ts`
Expected: FAIL（`./nonce` が存在しない）

- [ ] **Step 3: 実装する**

```ts
// server/utils/nonce.ts
import { randomBytes } from 'node:crypto'
import type Database from 'better-sqlite3'

const NONCE_TTL_MS = 5 * 60 * 1000

export function issueNonce(db: Database.Database, address: string): { nonce: string; expiresAt: string } {
  const nonce = randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString()
  db.prepare('INSERT INTO nonces (nonce, address, expires_at) VALUES (?, ?, ?)').run(nonce, address, expiresAt)
  return { nonce, expiresAt }
}

export function consumeNonce(db: Database.Database, address: string, nonce: string): boolean {
  const row = db.prepare('SELECT address, expires_at FROM nonces WHERE nonce = ?').get(nonce) as
    | { address: string; expires_at: string }
    | undefined

  db.prepare('DELETE FROM nonces WHERE nonce = ?').run(nonce)

  if (!row) return false
  if (row.address !== address) return false
  if (new Date(row.expires_at).getTime() < Date.now()) return false
  return true
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npx vitest run server/utils/nonce.test.ts`
Expected: PASS

- [ ] **Step 5: 人間へレビュー・コミットを依頼する**

---

### Task 7: セッションストア

**Files:**
- Create: `server/utils/session.ts`
- Test: `server/utils/session.test.ts`

**Interfaces:**
- Consumes: `useDb()`, `resetDbForTests()`（Task 2）
- Produces:
  - `interface UserRow { id: number; address: string; public_key: string; user_name: string; gender: string | null; birth_year: number | null; nationality: string | null; avatar_seed: string; created_at: string }`
  - `createSession(db, userId: number): { id: string; expiresAt: string }`
  - `attachSessionCookie(event: H3Event, sessionId: string, expiresAt: string): void`
  - `destroySession(db, event: H3Event): void`
  - `getSessionUser(db, event: H3Event): UserRow | null`
  - `requireSessionUser(db, event: H3Event): UserRow`（未ログイン時は`401`を投げる）

Cookieの読み書きを伴う関数（`attachSessionCookie` / `destroySession` / `getSessionUser` / `requireSessionUser`）はH3Eventのモックが煩雑になるため、ここではDB操作のみを単体テストする。Cookie込みの挙動はTask 8のAPI統合テストで実HTTPリクエストを通して検証する。

- [ ] **Step 1: 失敗するテストを書く**

```ts
// server/utils/session.test.ts
import { describe, it, expect } from 'vitest'

describe('createSession', () => {
  it('creates a session row for a user and returns id + expiry', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    process.env.DATABASE_PATH = ':memory:'
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO users (address, public_key, user_name, avatar_seed, created_at)
       VALUES ('addrA', 'pubA', 'USERNAME0000000A', 'seedA', datetime('now'))`
    ).run()
    const userId = (db.prepare('SELECT id FROM users WHERE address = ?').get('addrA') as { id: number }).id

    const { createSession } = await import('./session')
    const session = createSession(db, userId)

    const row = db.prepare('SELECT user_id FROM sessions WHERE id = ?').get(session.id) as { user_id: number }
    expect(row.user_id).toBe(userId)
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/session.test.ts`
Expected: FAIL（`./session` が存在しない）

- [ ] **Step 3: 実装する**

```ts
// server/utils/session.ts
import { randomBytes } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { H3Event } from 'h3'
import { setCookie, getCookie, deleteCookie, createError } from 'h3'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const COOKIE_NAME = 'session_id'

export interface UserRow {
  id: number
  address: string
  public_key: string
  user_name: string
  gender: string | null
  birth_year: number | null
  nationality: string | null
  avatar_seed: string
  created_at: string
}

export function createSession(db: Database.Database, userId: number): { id: string; expiresAt: string } {
  const id = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  db.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, datetime('now'))`
  ).run(id, userId, expiresAt)
  return { id, expiresAt }
}

export function attachSessionCookie(event: H3Event, sessionId: string, expiresAt: string): void {
  setCookie(event, COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt)
  })
}

export function destroySession(db: Database.Database, event: H3Event): void {
  const sessionId = getCookie(event, COOKIE_NAME)
  if (sessionId) db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
  deleteCookie(event, COOKIE_NAME, { path: '/' })
}

export function getSessionUser(db: Database.Database, event: H3Event): UserRow | null {
  const sessionId = getCookie(event, COOKIE_NAME)
  if (!sessionId) return null

  const session = db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?')
    .get(sessionId) as { user_id: number; expires_at: string } | undefined
  if (!session) return null
  if (new Date(session.expires_at).getTime() < Date.now()) return null

  return db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as UserRow
}

export function requireSessionUser(db: Database.Database, event: H3Event): UserRow {
  const user = getSessionUser(db, event)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'ログインが必要です' })
  }
  return user
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npx vitest run server/utils/session.test.ts`
Expected: PASS

- [ ] **Step 5: 人間へレビュー・コミットを依頼する**

---

### Task 8: 認証API（nonce / verify / logout）

**Files:**
- Create: `server/api/auth/nonce.post.ts`
- Create: `server/api/auth/verify.post.ts`
- Create: `server/api/auth/logout.post.ts`
- Test: `server/api/auth/auth.test.ts`

**Interfaces:**
- Consumes: `useDb`（Task 2）、`issueNonce` / `consumeNonce`（Task 6）、`verifySignature`（Task 5）、`generateUniqueUserName`（Task 3）、`generateAvatarSeed`（Task 4）、`createSession` / `attachSessionCookie` / `destroySession` / `UserRow`（Task 7）
- Produces: `POST /api/auth/nonce`, `POST /api/auth/verify`, `POST /api/auth/logout` の3エンドポイント

- [ ] **Step 1: 失敗するテストを書く**

```ts
// server/api/auth/auth.test.ts
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { generateAccount, signMessage } from '../../../utils/symbolCrypto'

describe('auth API', async () => {
  await setup({ server: true, env: { DATABASE_PATH: ':memory:' } })

  it('logs in a new account via nonce + signature and sets a session cookie', async () => {
    const account = generateAccount()

    const { nonce } = await $fetch('/api/auth/nonce', {
      method: 'POST',
      body: { address: account.address }
    })

    const signature = signMessage(account.privateKey, nonce)

    const response = await $fetch.raw('/api/auth/verify', {
      method: 'POST',
      body: { address: account.address, publicKey: account.publicKey, signature, nonce }
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toMatch(/session_id=/)
  })

  it('rejects verify when the signature does not match the nonce', async () => {
    const account = generateAccount()
    const { nonce } = await $fetch('/api/auth/nonce', {
      method: 'POST',
      body: { address: account.address }
    })
    const badSignature = signMessage(account.privateKey, 'different-message')

    await expect(
      $fetch('/api/auth/verify', {
        method: 'POST',
        body: { address: account.address, publicKey: account.publicKey, signature: badSignature, nonce }
      })
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('logs out and clears the session cookie', async () => {
    const account = generateAccount()
    const { nonce } = await $fetch('/api/auth/nonce', {
      method: 'POST',
      body: { address: account.address }
    })
    const signature = signMessage(account.privateKey, nonce)
    const verifyResponse = await $fetch.raw('/api/auth/verify', {
      method: 'POST',
      body: { address: account.address, publicKey: account.publicKey, signature, nonce }
    })
    const cookie = (verifyResponse.headers.get('set-cookie') ?? '').split(';')[0]

    const logoutResponse = await $fetch.raw('/api/auth/logout', {
      method: 'POST',
      headers: { cookie }
    })
    expect(logoutResponse.status).toBe(200)
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/api/auth/auth.test.ts`
Expected: FAIL（エンドポイントが存在しない）

- [ ] **Step 3: 実装する**

```ts
// server/api/auth/nonce.post.ts
import { z } from 'zod'
import { useDb } from '../../utils/db'
import { issueNonce } from '../../utils/nonce'

const bodySchema = z.object({ address: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const { address } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  return issueNonce(db, address)
})
```

```ts
// server/api/auth/verify.post.ts
import { z } from 'zod'
import { useDb } from '../../utils/db'
import { consumeNonce } from '../../utils/nonce'
import { verifySignature } from '../../../utils/symbolCrypto'
import { generateUniqueUserName } from '../../utils/username'
import { generateAvatarSeed } from '../../utils/avatarSeed'
import { createSession, attachSessionCookie, type UserRow } from '../../utils/session'

const bodySchema = z.object({
  address: z.string().min(1),
  publicKey: z.string().min(1),
  signature: z.string().min(1),
  nonce: z.string().min(1)
})

export default defineEventHandler(async (event) => {
  const { address, publicKey, signature, nonce } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  if (!consumeNonce(db, address, nonce)) {
    throw createError({ statusCode: 401, statusMessage: 'nonceが無効です' })
  }

  if (!verifySignature(publicKey, nonce, signature)) {
    throw createError({ statusCode: 401, statusMessage: '署名が無効です' })
  }

  let user = db.prepare('SELECT * FROM users WHERE address = ?').get(address) as UserRow | undefined
  if (!user) {
    const userName = generateUniqueUserName(db)
    const avatarSeed = generateAvatarSeed()
    db.prepare(
      `INSERT INTO users (address, public_key, user_name, avatar_seed, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(address, publicKey, userName, avatarSeed)
    user = db.prepare('SELECT * FROM users WHERE address = ?').get(address) as UserRow
  }

  const session = createSession(db, user.id)
  attachSessionCookie(event, session.id, session.expiresAt)

  return { userName: user.user_name }
})
```

```ts
// server/api/auth/logout.post.ts
import { useDb } from '../../utils/db'
import { destroySession } from '../../utils/session'

export default defineEventHandler((event) => {
  const db = useDb()
  destroySession(db, event)
  return { ok: true }
})
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npx vitest run server/api/auth/auth.test.ts`
Expected: PASS

- [ ] **Step 5: 人間へレビュー・コミットを依頼する**

---

### Task 9: ユーザーAPI（me / profile / avatar regenerate）

**Files:**
- Create: `server/api/user/me.get.ts`
- Create: `server/api/user/profile.patch.ts`
- Create: `server/api/user/avatar/regenerate.post.ts`
- Test: `server/api/user/user.test.ts`

**Interfaces:**
- Consumes: `useDb`（Task 2）、`requireSessionUser`（Task 7）、`generateAvatarSeed`（Task 4）、`generateAccount` / `signMessage`（Task 5、テスト用）
- Produces: `GET /api/user/me`, `PATCH /api/user/profile`, `POST /api/user/avatar/regenerate`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// server/api/user/user.test.ts
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { generateAccount, signMessage } from '../../../utils/symbolCrypto'

async function loginAndGetCookie(): Promise<string> {
  const account = generateAccount()
  const { nonce } = await $fetch('/api/auth/nonce', { method: 'POST', body: { address: account.address } })
  const signature = signMessage(account.privateKey, nonce)
  const response = await $fetch.raw('/api/auth/verify', {
    method: 'POST',
    body: { address: account.address, publicKey: account.publicKey, signature, nonce }
  })
  return (response.headers.get('set-cookie') ?? '').split(';')[0]
}

describe('user API', async () => {
  await setup({ server: true, env: { DATABASE_PATH: ':memory:' } })

  it('rejects requests without a session', async () => {
    await expect($fetch('/api/user/me')).rejects.toMatchObject({ statusCode: 401 })
  })

  it('returns the logged-in user via /api/user/me', async () => {
    const cookie = await loginAndGetCookie()
    const me = await $fetch('/api/user/me', { headers: { cookie } })
    expect(me.user_name).toMatch(/^[A-Za-z0-9]{16}$/)
  })

  it('updates user_name and rejects a duplicate value', async () => {
    const cookieA = await loginAndGetCookie()
    const cookieB = await loginAndGetCookie()

    await $fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { cookie: cookieA },
      body: { userName: 'TakenName0000001' }
    })

    await expect(
      $fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { cookie: cookieB },
        body: { userName: 'TakenName0000001' }
      })
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('regenerates the avatar seed on each call', async () => {
    const cookie = await loginAndGetCookie()
    const first = await $fetch('/api/user/avatar/regenerate', { method: 'POST', headers: { cookie } })
    const second = await $fetch('/api/user/avatar/regenerate', { method: 'POST', headers: { cookie } })
    expect(first.avatarSeed).not.toBe(second.avatarSeed)
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/api/user/user.test.ts`
Expected: FAIL（エンドポイントが存在しない）

- [ ] **Step 3: 実装する**

```ts
// server/api/user/me.get.ts
import { useDb } from '../../utils/db'
import { requireSessionUser } from '../../utils/session'

export default defineEventHandler((event) => {
  const db = useDb()
  return requireSessionUser(db, event)
})
```

```ts
// server/api/user/profile.patch.ts
import { z } from 'zod'
import { useDb } from '../../utils/db'
import { requireSessionUser } from '../../utils/session'

const bodySchema = z.object({
  userName: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/).optional(),
  gender: z.enum(['male', 'female', 'other', 'unspecified']).nullable().optional(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
  nationality: z.string().length(2).nullable().optional()
})

export default defineEventHandler(async (event) => {
  const db = useDb()
  const user = requireSessionUser(db, event)
  const body = await readValidatedBody(event, bodySchema.parse)

  if (body.userName && body.userName !== user.user_name) {
    const taken = db.prepare('SELECT 1 FROM users WHERE user_name = ? AND id != ?').get(body.userName, user.id)
    if (taken) {
      throw createError({ statusCode: 409, statusMessage: 'そのユーザー名は既に使われています' })
    }
  }

  db.prepare(
    `UPDATE users SET
       user_name = ?,
       gender = ?,
       birth_year = ?,
       nationality = ?
     WHERE id = ?`
  ).run(
    body.userName ?? user.user_name,
    body.gender === undefined ? user.gender : body.gender,
    body.birthYear === undefined ? user.birth_year : body.birthYear,
    body.nationality === undefined ? user.nationality : body.nationality,
    user.id
  )

  return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
})
```

```ts
// server/api/user/avatar/regenerate.post.ts
import { useDb } from '../../../utils/db'
import { requireSessionUser } from '../../../utils/session'
import { generateAvatarSeed } from '../../../utils/avatarSeed'

export default defineEventHandler((event) => {
  const db = useDb()
  const user = requireSessionUser(db, event)
  const avatarSeed = generateAvatarSeed()
  db.prepare('UPDATE users SET avatar_seed = ? WHERE id = ?').run(avatarSeed, user.id)
  return { avatarSeed }
})
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npx vitest run server/api/user/user.test.ts`
Expected: PASS

- [ ] **Step 5: 人間へレビュー・コミットを依頼する**

---

### Task 10: クライアント側 useAccount composable

**Files:**
- Create: `app/composables/useAccount.ts`
- Test: `app/composables/useAccount.test.ts`

**Interfaces:**
- Consumes: `generateAccount` / `importAccount` / `signMessage` / `SymbolAccount`（Task 5）
- Produces: `useAccount(): { createNewAccount, importExistingAccount, loginWithAccount }`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// app/composables/useAccount.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAccount', () => {
  it('creates a new account with a 64-char hex private key', async () => {
    const { useAccount } = await import('./useAccount')
    const { createNewAccount } = useAccount()
    const account = await createNewAccount()
    expect(account.privateKey).toMatch(/^[0-9A-Fa-f]{64}$/)
    expect(account.address.length).toBeGreaterThan(0)
  })

  it('logs in by requesting a nonce, signing it, and posting verify', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ nonce: 'abc123' })
      .mockResolvedValueOnce({ userName: 'FRESHUSER0000001' })
    vi.stubGlobal('$fetch', fetchMock)

    const { useAccount } = await import('./useAccount')
    const { createNewAccount, loginWithAccount } = useAccount()
    const account = await createNewAccount()
    const result = await loginWithAccount(account)

    expect(result.userName).toBe('FRESHUSER0000001')
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/auth/nonce', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/verify', expect.objectContaining({ method: 'POST' }))
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run app/composables/useAccount.test.ts`
Expected: FAIL（`./useAccount` が存在しない）

- [ ] **Step 3: 実装する**

```ts
// app/composables/useAccount.ts
import { generateAccount, importAccount, signMessage, type SymbolAccount } from '../../utils/symbolCrypto'

export function useAccount() {
  async function createNewAccount(): Promise<SymbolAccount> {
    return generateAccount()
  }

  async function importExistingAccount(privateKeyHex: string): Promise<SymbolAccount> {
    return importAccount(privateKeyHex)
  }

  async function loginWithAccount(account: SymbolAccount): Promise<{ userName: string }> {
    const { nonce } = await $fetch('/api/auth/nonce', {
      method: 'POST',
      body: { address: account.address }
    })
    const signature = signMessage(account.privateKey, nonce)
    return await $fetch('/api/auth/verify', {
      method: 'POST',
      body: { address: account.address, publicKey: account.publicKey, signature, nonce }
    })
  }

  return { createNewAccount, importExistingAccount, loginWithAccount }
}
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npx vitest run app/composables/useAccount.test.ts`
Expected: PASS

- [ ] **Step 5: 人間へレビュー・コミットを依頼する**

---

### Task 11: UserAvatarコンポーネント

**Files:**
- Create: `app/components/UserAvatar.vue`
- Test: `app/components/UserAvatar.test.ts`

**Interfaces:**
- Consumes: `@dicebear/core`, `@dicebear/collection`（`pixel-art`）
- Produces: `<UserAvatar :seed="string" :size="number?" />`（SVGを描画するコンポーネント）

- [ ] **Step 1: 失敗するテストを書く**

```ts
// app/components/UserAvatar.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UserAvatar from './UserAvatar.vue'

describe('UserAvatar', () => {
  it('renders an svg element', () => {
    const wrapper = mount(UserAvatar, { props: { seed: 'seed-one' } })
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it('renders different markup for different seeds', () => {
    const a = mount(UserAvatar, { props: { seed: 'seed-one' } }).html()
    const b = mount(UserAvatar, { props: { seed: 'seed-two' } }).html()
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run app/components/UserAvatar.test.ts`
Expected: FAIL（`UserAvatar.vue` が存在しない）

- [ ] **Step 3: 実装する**

```vue
<!-- app/components/UserAvatar.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { createAvatar } from '@dicebear/core'
import { pixelArt } from '@dicebear/collection'

const props = defineProps<{ seed: string; size?: number }>()

const svg = computed(() =>
  createAvatar(pixelArt, { seed: props.seed, size: props.size ?? 96 }).toString()
)
</script>

<template>
  <div class="user-avatar" v-html="svg" />
</template>
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npx vitest run app/components/UserAvatar.test.ts`
Expected: PASS

- [ ] **Step 5: 人間へレビュー・コミットを依頼する**

---

### Task 12: 画面（アカウント作成・インポート・プロフィール）+ E2Eテスト

**Files:**
- Create: `app/pages/login.vue`
- Create: `app/pages/account/create.vue`
- Create: `app/pages/account/import.vue`
- Create: `app/pages/profile.vue`
- Test: `tests/e2e/account-flow.test.ts`

**Interfaces:**
- Consumes: `useAccount()`（Task 10）、`UserAvatar`（Task 11）、`GET /api/user/me` / `PATCH /api/user/profile` / `POST /api/user/avatar/regenerate` / `POST /api/auth/logout`（Task 9・Task 8）

- [ ] **Step 1: 失敗するE2Eテストを書く**

```ts
// tests/e2e/account-flow.test.ts
import { describe, it, expect } from 'vitest'
import { setup, createPage } from '@nuxt/test-utils/e2e'

describe('account flow', async () => {
  await setup({ server: true, env: { DATABASE_PATH: ':memory:' } })

  it('creates an account, views the profile, regenerates the avatar, and logs out', async () => {
    const page = await createPage('/account/create')
    await page.click('text=アカウントを新規作成')

    const privateKey = await page.locator('code').innerText()
    expect(privateKey).toMatch(/^[0-9A-Fa-f]{64}$/)

    await page.check('input[type=checkbox]')
    await page.click('text=続ける')
    await page.waitForURL(/\/profile/)

    await expect(page.locator('svg')).toBeVisible()
    const before = await page.locator('svg').innerHTML()
    await page.click('text=作り直す')
    await expect.poll(() => page.locator('svg').innerHTML()).not.toBe(before)

    await page.click('text=ログアウト')
    await page.waitForURL(/\/login/)

    await page.close()
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/e2e/account-flow.test.ts`
Expected: FAIL（ページが存在しない）

- [ ] **Step 3: 実装する**

```vue
<!-- app/pages/login.vue -->
<template>
  <div>
    <NuxtLink to="/account/create">新規アカウント作成</NuxtLink>
    <NuxtLink to="/account/import">既存アカウントでログイン</NuxtLink>
  </div>
</template>
```

```vue
<!-- app/pages/account/create.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useAccount } from '../../composables/useAccount'
import type { SymbolAccount } from '../../../utils/symbolCrypto'

const { createNewAccount, loginWithAccount } = useAccount()
const account = ref<SymbolAccount | null>(null)
const confirmed = ref(false)
const loading = ref(false)
const error = ref('')

async function generate() {
  account.value = await createNewAccount()
  confirmed.value = false
}

async function proceed() {
  if (!account.value || !confirmed.value) return
  loading.value = true
  error.value = ''
  try {
    await loginWithAccount(account.value)
    await navigateTo('/profile')
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'ログインに失敗しました'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <button v-if="!account" @click="generate">アカウントを新規作成</button>

    <div v-else>
      <p>この秘密鍵を必ず保存してください。再表示はできません。</p>
      <code>{{ account.privateKey }}</code>
      <label>
        <input v-model="confirmed" type="checkbox" />
        秘密鍵を保存しました
      </label>
      <button :disabled="!confirmed || loading" @click="proceed">続ける</button>
      <p v-if="error">{{ error }}</p>
    </div>
  </div>
</template>
```

```vue
<!-- app/pages/account/import.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useAccount } from '../../composables/useAccount'

const { importExistingAccount, loginWithAccount } = useAccount()
const privateKeyInput = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const account = await importExistingAccount(privateKeyInput.value.trim())
    await loginWithAccount(account)
    await navigateTo('/profile')
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'ログインに失敗しました'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <textarea v-model="privateKeyInput" placeholder="秘密鍵を貼り付け" />
    <button :disabled="loading" @click="submit">ログイン</button>
    <p v-if="error">{{ error }}</p>
  </div>
</template>
```

```vue
<!-- app/pages/profile.vue -->
<script setup lang="ts">
import { ref } from 'vue'

const { data: user, refresh } = await useFetch('/api/user/me')
const regenerating = ref(false)

async function regenerateAvatar() {
  regenerating.value = true
  await $fetch('/api/user/avatar/regenerate', { method: 'POST' })
  await refresh()
  regenerating.value = false
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}
</script>

<template>
  <div v-if="user">
    <UserAvatar :seed="user.avatar_seed" />
    <button :disabled="regenerating" @click="regenerateAvatar">作り直す</button>
    <p>{{ user.user_name }}</p>
    <button @click="logout">ログアウト</button>
  </div>
</template>
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `npx vitest run tests/e2e/account-flow.test.ts`
Expected: PASS

- [ ] **Step 5: プロジェクト全体のテストを一括で実行する**

Run: `npm test`
Expected: 全テストPASS

- [ ] **Step 6: 人間へレビュー・コミットを依頼する**

---

## 実行後の確認事項（人間向け）

- `npm test` が全件PASSすること
- `npm run dev` でブラウザから実際にアカウント作成→ログイン→アバター作り直し→ログアウトが動作すること
- git操作（ステージング・コミット・プッシュ）はすべて人間が行うこと
