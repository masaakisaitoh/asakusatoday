# 秘密鍵ダウンロード＆事前説明 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** アカウント新規作成フロー（`pages/account/create.vue`）に、鍵生成前の説明ゲートと、鍵生成直後の秘密鍵ファイル自動ダウンロードを追加する。

**Architecture:** すべてクライアントサイド（ブラウザ）で完結する変更。秘密鍵はサーバーに一切送らない既存方針を維持する。ファイル内容の組み立ては純粋関数として`utils/`に切り出し単体テストする。ダウンロード自体（Blob生成・`<a download>`クリック）はテスト対象外とし、`pages/account/create.vue`に直接実装する。

**Tech Stack:** Nuxt 3 (Vue 3 `<script setup>`), Vitest + happy-dom（単体テスト）, @nuxt/test-utils + Playwright（E2Eテスト）

**Spec:** `docs/superpowers/specs/2026-08-16-private-key-download-design.md`

## Global Constraints

- ダウンロードファイル名は固定: `asakusatoday-private-key.txt`
- ファイルのMIMEタイプ: `text/plain`
- 作成日時フォーマット: ブラウザのローカル時刻を `YYYY-MM-DD HH:mm:ss` 形式（タイムゾーン変換なし）
- `pages/account/import.vue`（既存鍵インポート画面）は変更しない
- サーバー側コード（`server/`配下）は変更しない
- 新しいcomposableは作らない（ロジック量が小さいためYAGNI。ページ内および`utils/`に留める）

---

### Task 1: 秘密鍵ファイルの中身を組み立てる純粋関数

**Files:**
- Create: `utils/privateKeyFile.ts`
- Test: `utils/privateKeyFile.test.ts`

**Interfaces:**
- Produces:
  - `formatLocalDateTime(date: Date): string` — ローカル時刻を`YYYY-MM-DD HH:mm:ss`形式の文字列にする
  - `buildPrivateKeyFileContent(privateKey: string, createdAt: Date): string` — ダウンロードファイルの中身（秘密鍵・注意書き・作成日時を含む全文）を返す
  - `PRIVATE_KEY_FILE_NAME: string` — 固定値 `'asakusatoday-private-key.txt'`

- [ ] **Step 1: Write the failing test**

`utils/privateKeyFile.test.ts` を作成する。

```typescript
import { describe, it, expect } from 'vitest'
import { buildPrivateKeyFileContent, formatLocalDateTime, PRIVATE_KEY_FILE_NAME } from './privateKeyFile'

describe('formatLocalDateTime', () => {
  it('formats a date as YYYY-MM-DD HH:mm:ss with zero-padding', () => {
    const date = new Date(2026, 0, 5, 9, 3, 7)
    expect(formatLocalDateTime(date)).toBe('2026-01-05 09:03:07')
  })
})

describe('buildPrivateKeyFileContent', () => {
  it('includes the private key and formatted creation timestamp', () => {
    const date = new Date(2026, 7, 16, 14, 32, 10)
    const privateKey = 'ABCDEF0123456789'.repeat(4)
    const content = buildPrivateKeyFileContent(privateKey, date)
    expect(content).toContain('作成日時: 2026-08-16 14:32:10')
    expect(content).toContain(`秘密鍵: ${privateKey}`)
  })

  it('includes the required warning text', () => {
    const content = buildPrivateKeyFileContent('abc123', new Date())
    expect(content).toContain('再発行・復元はできません')
    expect(content).toContain('誰にも教えないでください')
  })
})

describe('PRIVATE_KEY_FILE_NAME', () => {
  it('is the fixed filename for the downloaded key file', () => {
    expect(PRIVATE_KEY_FILE_NAME).toBe('asakusatoday-private-key.txt')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run utils/privateKeyFile.test.ts`
Expected: FAIL（`utils/privateKeyFile.ts` が存在しないため、importエラーで失敗する）

- [ ] **Step 3: Write minimal implementation**

`utils/privateKeyFile.ts` を作成する。

```typescript
export const PRIVATE_KEY_FILE_NAME = 'asakusatoday-private-key.txt'

export function formatLocalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

export function buildPrivateKeyFileContent(privateKey: string, createdAt: Date): string {
  return `ASAKUSA TODAY - 秘密鍵

この秘密鍵はあなたのアカウントへの唯一のログイン手段です。
再発行・復元はできません。安全な場所に保管し、誰にも教えないでください。

作成日時: ${formatLocalDateTime(createdAt)}
秘密鍵: ${privateKey}
`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run utils/privateKeyFile.test.ts`
Expected: PASS（4件のテストすべて成功）

- [ ] **Step 5: Commit**

```bash
git add utils/privateKeyFile.ts utils/privateKeyFile.test.ts
git commit -m "feat: add private key file content builder"
```

---

### Task 2: 鍵生成前に説明を表示し、同意チェックでボタンをゲートする

**Files:**
- Modify: `pages/account/create.vue`
- Modify: `tests/e2e/account-flow.test.ts`

**Interfaces:**
- Consumes: なし（既存の`useAccount()`のみ使用）
- Produces: なし（UIのみの変更、他タスクから参照されるインターフェースなし）

**現状の`pages/account/create.vue`全文（変更前）:**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAccount } from '../../composables/useAccount'
import type { SymbolAccount } from '../../utils/symbolCrypto'

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
    error.value = e?.data?.message ?? 'ログインに失敗しました'
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

- [ ] **Step 1: Update the e2e test to check the new explanation checkbox first**

`tests/e2e/account-flow.test.ts` の該当箇所を書き換える（`await page.check('input[type=checkbox]')` を最初のクリックの前に1行追加するだけ）。

変更前:
```typescript
    const page = await createPage('/account/create')
    await page.click('text=アカウントを新規作成')
```

変更後:
```typescript
    const page = await createPage('/account/create')
    await page.check('input[type=checkbox]')
    await page.click('text=アカウントを新規作成')
```

- [ ] **Step 2: Run the e2e test to verify it fails**

Run: `npx vitest run tests/e2e/account-flow.test.ts`
Expected: FAIL（現状の`create.vue`には説明チェックボックスが無いため、`page.check('input[type=checkbox]')`が要素を見つけられずタイムアウトする）

- [ ] **Step 3: Add the explanation gate to `pages/account/create.vue`**

ファイル全体を以下に置き換える。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAccount } from '../../composables/useAccount'
import type { SymbolAccount } from '../../utils/symbolCrypto'

const { createNewAccount, loginWithAccount } = useAccount()
const account = ref<SymbolAccount | null>(null)
const understood = ref(false)
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
    error.value = e?.data?.message ?? 'ログインに失敗しました'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <div v-if="!account">
      <p>
        この秘密鍵はあなたのアカウントの唯一の証明です。
        サーバーには保存されません。紛失すると二度と復元できません。
        誰にも教えないでください。
      </p>
      <label>
        <input v-model="understood" type="checkbox" />
        内容を理解しました
      </label>
      <button :disabled="!understood" @click="generate">アカウントを新規作成</button>
    </div>

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

- [ ] **Step 4: Run the e2e test to verify it passes**

Run: `npx vitest run tests/e2e/account-flow.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pages/account/create.vue tests/e2e/account-flow.test.ts
git commit -m "feat: gate account creation behind a private key explanation checkbox"
```

---

### Task 3: 鍵生成直後に秘密鍵ファイルを自動ダウンロード

**Files:**
- Modify: `pages/account/create.vue`

**Interfaces:**
- Consumes（Task 1で作った関数）:
  - `buildPrivateKeyFileContent(privateKey: string, createdAt: Date): string`
  - `PRIVATE_KEY_FILE_NAME: string`

**現状の`<script setup>`冒頭（Task 2完了後の状態）:**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAccount } from '../../composables/useAccount'
import type { SymbolAccount } from '../../utils/symbolCrypto'

const { createNewAccount, loginWithAccount } = useAccount()
const account = ref<SymbolAccount | null>(null)
const understood = ref(false)
const confirmed = ref(false)
const loading = ref(false)
const error = ref('')

async function generate() {
  account.value = await createNewAccount()
  confirmed.value = false
}
```

このダウンロード処理は`Blob`/`URL.createObjectURL`/DOM操作に依存するため自動テストの対象外とする（spec参照）。実装後に手動確認を行う。

- [ ] **Step 1: Add the download import and helper function**

`pages/account/create.vue` の `<script setup>` を以下のように変更する（import追加、`downloadPrivateKeyFile`関数追加、`generate()`内で呼び出し）。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAccount } from '../../composables/useAccount'
import type { SymbolAccount } from '../../utils/symbolCrypto'
import { buildPrivateKeyFileContent, PRIVATE_KEY_FILE_NAME } from '../../utils/privateKeyFile'

const { createNewAccount, loginWithAccount } = useAccount()
const account = ref<SymbolAccount | null>(null)
const understood = ref(false)
const confirmed = ref(false)
const loading = ref(false)
const error = ref('')

function downloadPrivateKeyFile(privateKey: string) {
  const content = buildPrivateKeyFileContent(privateKey, new Date())
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = PRIVATE_KEY_FILE_NAME
  link.click()
  URL.revokeObjectURL(url)
}

async function generate() {
  account.value = await createNewAccount()
  confirmed.value = false
  downloadPrivateKeyFile(account.value.privateKey)
}

async function proceed() {
  if (!account.value || !confirmed.value) return
  loading.value = true
  error.value = ''
  try {
    await loginWithAccount(account.value)
    await navigateTo('/profile')
  } catch (e: any) {
    error.value = e?.data?.message ?? 'ログインに失敗しました'
  } finally {
    loading.value = false
  }
}
</script>
```

テンプレート部分（`<template>...</template>`）はTask 2完了時のまま変更しない。

- [ ] **Step 2: Run the full test suite to check for regressions**

Run: `npm run test`
Expected: PASS（全テストが通ること。Task 1・Task 2で追加/更新したテストも含めて成功する）

- [ ] **Step 3: Manually verify the download in a real browser**

Run: `npm run dev`

ブラウザで `http://localhost:3000/account/create` を開き、以下を確認する。

1. 「内容を理解しました」にチェックを入れずに「アカウントを新規作成」が押せないこと
2. チェックを入れてボタンを押すと、`asakusatoday-private-key.txt` というファイルが自動でダウンロードされること
3. ダウンロードしたファイルを開き、画面に表示された秘密鍵と一致すること、作成日時が現在時刻に近い値で入っていること
4. 「秘密鍵を保存しました」にチェックを入れて「続ける」を押すと `/profile` に遷移すること（既存フローが壊れていないこと）

確認後、開発サーバーを停止する（Ctrl+C）。

- [ ] **Step 4: Commit**

```bash
git add pages/account/create.vue
git commit -m "feat: auto-download the private key file on account creation"
```
