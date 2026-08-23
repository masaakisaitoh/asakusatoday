# プロフィール テーマ設定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** プロフィール画面にライト/ダーク/システムのテーマ選択欄を追加し、DBに永続化してログイン中は全ページに反映する。

**Architecture:** `@nuxt/ui`が既に自動有効化している`@nuxtjs/color-mode`(`useColorMode()`)をそのまま使う。新規に`users.theme`カラムを追加し、`PATCH /api/user/profile`で更新、クライアント側`plugins/theme.client.ts`がログイン中ユーザーの`theme`を`colorMode.preference`に反映する。詳細は[2026-08-22-profile-theme-design.md](../specs/2026-08-22-profile-theme-design.md)を参照。

**Tech Stack:** Nuxt 3, `@nuxt/ui` v3(内部で`@nuxtjs/color-mode`), better-sqlite3, zod, vitest, `@nuxt/test-utils/e2e` + Playwright

## Global Constraints

- gitコマンドは実行しない(プロジェクトの`CLAUDE.md`方針)。各タスク末尾の「コミット」ステップでは、変更したファイル一覧を提示するだけに留め、実際の`git add`/`git commit`はユーザーに委ねる。
- `nuxt.config.ts`の`modules`・`colorMode`オプションは変更しない(design docの通り、`@nuxt/ui`が`classSuffix: ''`, `disableTransition: true`で既に`@nuxtjs/color-mode`を自動登録済みのため)。
- テーマの型は常に`'light' | 'dark' | 'system'`の3値で統一する。
- UI文言はすべて`utils/i18n/uiStrings.ts`の辞書経由(`useUiText()`の`t()`)で追加し、ハードコードしない。

---

### Task 1: DBスキーマに`theme`カラムを追加

**Files:**
- Modify: `server/utils/db.ts`
- Modify: `server/utils/session.ts:9-20`(`UserRow`インターフェース)
- Test: `server/utils/db.test.ts`

**Interfaces:**
- Produces: `users`テーブルに`theme TEXT NOT NULL DEFAULT 'light'`カラム。既存DBには`migrate()`でALTER TABLEにより追加。`UserRow.theme: 'light' | 'dark' | 'system'`型。

- [ ] **Step 1: 失敗するテストを書く(フレッシュDB)**

`server/utils/db.test.ts`の`describe('useDb', ...)`ブロック内、`'creates a fresh users table with an is_admin column'`のテストの直後に追加:

```ts
  it('creates a fresh users table with a theme column defaulting to light', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const columns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[]
    expect(columns.some((c) => c.name === 'theme')).toBe(true)

    db.prepare(
      `INSERT INTO users (address, public_key, user_name, avatar_seed, created_at)
       VALUES ('addr-theme', 'pub-theme', 'ThemeUser00000001', 'seed-theme', datetime('now'))`
    ).run()
    const user = db.prepare('SELECT theme FROM users WHERE address = ?').get('addr-theme') as { theme: string }
    expect(user.theme).toBe('light')
  })
```

`'migrates an existing users table without is_admin'`のテストの直後には、レガシーDBからのマイグレーションを検証するテストを追加:

```ts
  it('migrates an existing users table without theme to default light', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'asakusa-migrate-theme-'))
    const path = join(dir, 'legacy.sqlite3')

    const legacyDb = new Database(path)
    legacyDb.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        address TEXT UNIQUE NOT NULL,
        public_key TEXT NOT NULL,
        user_name TEXT UNIQUE NOT NULL,
        gender TEXT,
        birth_year INTEGER,
        nationality TEXT,
        avatar_seed TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `)
    legacyDb
      .prepare(
        `INSERT INTO users (address, public_key, user_name, avatar_seed, created_at)
         VALUES ('addr2', 'pub2', 'LegacyUser000002', 'seed2', datetime('now'))`
      )
      .run()
    legacyDb.close()

    process.env.DATABASE_PATH = path
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()

    const columns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[]
    expect(columns.some((c) => c.name === 'theme')).toBe(true)

    const user = db.prepare('SELECT theme FROM users WHERE address = ?').get('addr2') as { theme: string }
    expect(user.theme).toBe('light')

    rmSync(dir, { recursive: true, force: true })
  })
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run server/utils/db.test.ts`
Expected: 新しく追加した2件が FAIL(`theme`カラムが存在しないため)。既存のテストは PASS のまま。

- [ ] **Step 3: `SCHEMA`と`migrate()`を実装**

`server/utils/db.ts`の`SCHEMA`定数内、`users`テーブル定義を変更(12-23行目):

```ts
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
  is_admin INTEGER NOT NULL DEFAULT 0,
  theme TEXT NOT NULL DEFAULT 'light',
  created_at TEXT NOT NULL
);
```

(以降のテーブル定義はそのまま変更しない)

`migrate()`関数(72-90行目)の`is_admin`マイグレーションの直後に追記:

```ts
function migrate(database: Database.Database): void {
  const userColumns = database.prepare('PRAGMA table_info(users)').all() as { name: string }[]
  if (!userColumns.some((c) => c.name === 'is_admin')) {
    database.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0')
  }
  if (!userColumns.some((c) => c.name === 'theme')) {
    database.exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'light'")
  }
  // ...(sourceColumns, articleColumns の既存処理はそのまま)
```

- [ ] **Step 4: `UserRow`型を更新**

`server/utils/session.ts:9-20`を変更:

```ts
export interface UserRow {
  id: number
  address: string
  public_key: string
  user_name: string
  gender: string | null
  birth_year: number | null
  nationality: string | null
  avatar_seed: string
  is_admin: number
  theme: 'light' | 'dark' | 'system'
  created_at: string
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npx vitest run server/utils/db.test.ts`
Expected: 全件 PASS(既存の`is_admin`関連テストも含め壊れていないこと)。

Run: `npx vitest run` (型エラーが出ないか全体も軽く確認)
Expected: 既存テストが引き続き PASS。

- [ ] **Step 6: 変更ファイルを提示(コミットはユーザーが行う)**

変更ファイル: `server/utils/db.ts`, `server/utils/session.ts`, `server/utils/db.test.ts`
(gitコマンドは実行しない。ユーザーに変更内容を報告し、コミットを依頼する。)

---

### Task 2: `PATCH /api/user/profile`が`theme`を受け付けるようにする

**Files:**
- Modify: `server/api/user/profile.patch.ts`
- Test: `tests/api/user.test.ts`

**Interfaces:**
- Consumes: `UserRow.theme`(Task 1)
- Produces: `PATCH /api/user/profile`のリクエストボディに`theme?: 'light' | 'dark' | 'system'`を追加受付。レスポンス(更新後のユーザー行)とその後の`GET /api/user/me`のレスポンスに`theme`フィールドが含まれる。

- [ ] **Step 1: 失敗するテストを書く**

`tests/api/user.test.ts`の`describe('user API', ...)`ブロック内、最後の`it(...)`の後に追加:

```ts
  it('updates theme and returns it via /api/user/me', async () => {
    const cookie = await loginAndGetCookie()
    const updated = await $fetch('/api/user/profile', {
      method: 'PATCH',
      headers: { cookie },
      body: { theme: 'dark' }
    })
    expect(updated.theme).toBe('dark')

    const me = await $fetch('/api/user/me', { headers: { cookie } })
    expect(me.theme).toBe('dark')
  })

  it('rejects an invalid theme value', async () => {
    const cookie = await loginAndGetCookie()
    await expect(
      $fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { cookie },
        body: { theme: 'blue' }
      })
    ).rejects.toMatchObject({ statusCode: 400 })
  })
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/api/user.test.ts`
Expected: 新しい2件が FAIL(`updated.theme`が`undefined`になる/不正値が400で弾かれない)。

- [ ] **Step 3: `bodySchema`とUPDATE文を実装**

`server/api/user/profile.patch.ts`を変更:

```ts
import { z } from 'zod'
import { useDb } from '../../utils/db'
import { requireSessionUser } from '../../utils/session'

const bodySchema = z.object({
  userName: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/).optional(),
  gender: z.enum(['male', 'female', 'other', 'unspecified']).nullable().optional(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
  nationality: z.string().length(2).nullable().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional()
})

export default defineEventHandler(async (event) => {
  const db = useDb()
  const user = requireSessionUser(db, event)
  const body = await readValidatedBody(event, bodySchema.parse)

  if (body.userName && body.userName !== user.user_name) {
    const taken = db.prepare('SELECT 1 FROM users WHERE user_name = ? AND id != ?').get(body.userName, user.id)
    if (taken) {
      throw createError({ statusCode: 409, message: 'そのユーザー名は既に使われています' })
    }
  }

  db.prepare(
    `UPDATE users SET
       user_name = ?,
       gender = ?,
       birth_year = ?,
       nationality = ?,
       theme = ?
     WHERE id = ?`
  ).run(
    body.userName ?? user.user_name,
    body.gender === undefined ? user.gender : body.gender,
    body.birthYear === undefined ? user.birth_year : body.birthYear,
    body.nationality === undefined ? user.nationality : body.nationality,
    body.theme === undefined ? user.theme : body.theme,
    user.id
  )

  return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
})
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/api/user.test.ts`
Expected: 全件 PASS。

- [ ] **Step 5: 変更ファイルを提示(コミットはユーザーが行う)**

変更ファイル: `server/api/user/profile.patch.ts`, `tests/api/user.test.ts`

---

### Task 3: i18n辞書に`theme`関連キーを追加

**Files:**
- Modify: `utils/i18n/uiStrings.ts`
- Test: `composables/useUiText.test.ts`

**Interfaces:**
- Produces: `UiStringKey`に`'profile.theme' | 'profile.themeLight' | 'profile.themeDark' | 'profile.themeSystem'`を追加。6言語(`en`/`ja`/`ko`/`zh-Hant`/`zh-Hans`/`pt`)すべてに値が入る。`useUiText().t(key)`でこれらを取得できる。

- [ ] **Step 1: 失敗するテストを書く**

`composables/useUiText.test.ts`の`describe('useUiText', ...)`ブロック内、最後の`it(...)`の後に追加:

```ts
  it('returns theme option labels for en and ja', async () => {
    const { useArticleLocale } = await import('./useArticleLocale')
    vi.stubGlobal('useArticleLocale', useArticleLocale)
    const { useUiText } = await import('./useUiText')

    const { locale, setLocale } = useArticleLocale()
    const { t } = useUiText()
    expect(t('profile.theme')).toBe('Theme')
    expect(t('profile.themeLight')).toBe('Light')
    expect(t('profile.themeDark')).toBe('Dark')
    expect(t('profile.themeSystem')).toBe('System')

    setLocale('ja')
    expect(locale.value).toBe('ja')
    expect(t('profile.themeDark')).toBe('ダーク')
  })
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run composables/useUiText.test.ts`
Expected: FAIL(`UiStringKey`に該当キーがなくコンパイルエラーになるか、実行時に`undefined`が返る)。

- [ ] **Step 3: 辞書に追加**

`utils/i18n/uiStrings.ts`の`UiStringKey`型に追加(`'profile.nationalityPlaceholder'`の直後):

```ts
  | 'profile.nationalityPlaceholder'
  | 'profile.theme'
  | 'profile.themeLight'
  | 'profile.themeDark'
  | 'profile.themeSystem'
```

`UI_STRINGS`の各言語オブジェクトに、`'profile.nationalityPlaceholder'`の行の直後に追加:

```ts
// en
    'profile.nationalityPlaceholder': 'Select a country',
    'profile.theme': 'Theme',
    'profile.themeLight': 'Light',
    'profile.themeDark': 'Dark',
    'profile.themeSystem': 'System',

// ja
    'profile.nationalityPlaceholder': '国を選択',
    'profile.theme': 'テーマ',
    'profile.themeLight': 'ライト',
    'profile.themeDark': 'ダーク',
    'profile.themeSystem': 'システム設定に合わせる',

// ko
    'profile.nationalityPlaceholder': '국가 선택',
    'profile.theme': '테마',
    'profile.themeLight': '라이트',
    'profile.themeDark': '다크',
    'profile.themeSystem': '시스템 설정 사용',

// zh-Hant
    'profile.nationalityPlaceholder': '選擇國家',
    'profile.theme': '主題',
    'profile.themeLight': '淺色',
    'profile.themeDark': '深色',
    'profile.themeSystem': '跟隨系統設定',

// zh-Hans
    'profile.nationalityPlaceholder': '选择国家',
    'profile.theme': '主题',
    'profile.themeLight': '浅色',
    'profile.themeDark': '深色',
    'profile.themeSystem': '跟随系统设置',

// pt
    'profile.nationalityPlaceholder': 'Selecione um país',
    'profile.theme': 'Tema',
    'profile.themeLight': 'Claro',
    'profile.themeDark': 'Escuro',
    'profile.themeSystem': 'Usar configuração do sistema',
```

(それぞれ対応する言語ブロック内の該当行に追記する。既存の`'profile.nationalityPlaceholder'`行はそのまま残す)

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run composables/useUiText.test.ts`
Expected: 全件 PASS。

Run: `npx vitest run` で型エラーがないことも確認(`Record<TranslationLocale, Record<UiStringKey, string>>`によりキー漏れはコンパイルエラーになる)。
Expected: 全件 PASS。

- [ ] **Step 5: 変更ファイルを提示(コミットはユーザーが行う)**

変更ファイル: `utils/i18n/uiStrings.ts`, `composables/useUiText.test.ts`

---

### Task 4: プロフィール画面のテーマ選択UIとアプリ起動時の反映プラグイン

**Files:**
- Create: `plugins/theme.client.ts`
- Modify: `pages/profile.vue`
- Test: `tests/e2e/account-flow.test.ts`

**Interfaces:**
- Consumes: `UserRow.theme`(Task 1)、`PATCH /api/user/profile`の`theme`受付(Task 2)、`t('profile.theme' | 'profile.themeLight' | 'profile.themeDark' | 'profile.themeSystem')`(Task 3)、Nuxtが自動importする`useColorMode()`(`@nuxtjs/color-mode`、`@nuxt/ui`により既に有効)
- Produces: ログイン中は全ページで`colorMode.preference`がDBの`theme`と一致する。プロフィール編集画面でテーマ選択が即時プレビューされ、保存でDBに永続化される。

- [ ] **Step 1: 失敗するe2eテストを書く**

`tests/e2e/account-flow.test.ts`の`describe('account flow', ...)`ブロック内、最後の`it(...)`の後に追加:

```ts
  it('defaults to Light theme and previews Dark immediately when selected', async () => {
    const page = await createPage('/account/create')
    await createAndLoginAccount(page)

    expect(await page.locator('text=Light').first().isVisible()).toBe(true)

    await page.click('text=Edit profile')
    await page.getByLabel('Theme').click()
    await page.getByRole('option', { name: 'Dark' }).click()

    await expect.poll(async () => (await page.locator('html').getAttribute('class')) ?? '').toContain('dark')

    await page.close()
  }, 30000)

  it('persists the selected theme after saving and reloading', async () => {
    const page = await createPage('/account/create')
    await createAndLoginAccount(page)

    await page.click('text=Edit profile')
    await page.getByLabel('Theme').click()
    await page.getByRole('option', { name: 'Dark' }).click()
    await page.click('text=Save')

    await page.reload()
    await page.waitForSelector('text=Dark')
    await expect.poll(async () => (await page.locator('html').getAttribute('class')) ?? '').toContain('dark')

    await page.close()
  }, 30000)
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/e2e/account-flow.test.ts`
Expected: 新しい2件が FAIL(`Theme`ラベルの要素が存在しない)。既存のテストは PASS のまま。

- [ ] **Step 3: `plugins/theme.client.ts`を新規作成**

```ts
export default defineNuxtPlugin(async () => {
  const colorMode = useColorMode()
  const { data: user } = await useFetch('/api/user/me', { key: 'current-user' })
  if (user.value?.theme) {
    colorMode.preference = user.value.theme
  }
})
```

- [ ] **Step 4: `pages/profile.vue`を変更**

`genderLabelKeys`の直後(37-41行目あたり)に`themeLabelKeys`を追加:

```ts
const themeLabelKeys: Record<'light' | 'dark' | 'system', 'profile.themeLight' | 'profile.themeDark' | 'profile.themeSystem'> = {
  light: 'profile.themeLight',
  dark: 'profile.themeDark',
  system: 'profile.themeSystem'
}
```

`const colorMode = useColorMode()`を`mode`定義の前(53行目あたり)に追加:

```ts
const colorMode = useColorMode()
```

`profileSchema`(56-63行目)に`theme`を追加:

```ts
const profileSchema = computed(() =>
  z.object({
    userName: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/, t('profile.usernameHint')),
    gender: z.enum(['male', 'female', 'other', 'unspecified']),
    birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable(),
    nationality: z.string().length(2).nullable(),
    theme: z.enum(['light', 'dark', 'system'])
  })
)
```

`formState`(65-75行目)の型と初期値に`theme`を追加:

```ts
const formState = ref<{
  userName: string
  gender: 'male' | 'female' | 'other' | 'unspecified'
  birthYear: number | null
  nationality: string | null
  theme: 'light' | 'dark' | 'system'
}>({
  userName: '',
  gender: 'unspecified',
  birthYear: null,
  nationality: null,
  theme: 'light'
})
```

`genderOptions`の直後に`themeOptions`を追加:

```ts
const themeOptions = computed(() => [
  { label: t('profile.themeLight'), value: 'light' },
  { label: t('profile.themeDark'), value: 'dark' },
  { label: t('profile.themeSystem'), value: 'system' }
])
```

`startEdit()`(87-97行目)に`theme`の初期化を追加:

```ts
function startEdit(): void {
  if (!user.value) return
  formState.value = {
    userName: user.value.user_name,
    gender: (user.value.gender as typeof formState.value.gender) ?? 'unspecified',
    birthYear: user.value.birth_year,
    nationality: user.value.nationality,
    theme: user.value.theme
  }
  submitError.value = ''
  mode.value = 'edit'
}
```

`cancelEdit()`(99-101行目)でプレビュー中のテーマを保存済みの値に戻す:

```ts
function cancelEdit(): void {
  if (user.value) {
    colorMode.preference = user.value.theme
  }
  mode.value = 'view'
}
```

`startEdit()`の後(または`themeOptions`の後)に、選択変更を即時プレビューする`watch`を追加:

```ts
watch(
  () => formState.value.theme,
  (value) => {
    colorMode.preference = value
  }
)
```

(`watch`は`vue`から既にimport済み。`import { computed, ref } from 'vue'`を`import { computed, ref, watch } from 'vue'`に変更する)

テンプレートの表示モード(128-141行目)、`profile.nationality`の`<dt>`/`<dd>`の直後に追加:

```vue
          <dt class="text-muted">{{ t('profile.theme') }}</dt>
          <dd>{{ t(themeLabelKeys[user.theme]) }}</dd>
```

テンプレートの編集モード(163-171行目)、`nationality`の`UFormField`の直後に追加:

```vue
        <UFormField :label="t('profile.theme')" name="theme">
          <USelect v-model="formState.theme" :items="themeOptions" />
        </UFormField>
```

- [ ] **Step 5: i18nに`profile.theme`ラベルが必要な箇所を確認**

Task 3で追加済みの`profile.theme` / `profile.themeLight` / `profile.themeDark` / `profile.themeSystem`が全て揃っていることを確認する(`utils/i18n/uiStrings.ts`を再確認)。

- [ ] **Step 6: テストが通ることを確認**

Run: `npx vitest run tests/e2e/account-flow.test.ts`
Expected: 全件 PASS。

Run: `npx vitest run`(全体回帰)
Expected: 全件 PASS。

- [ ] **Step 7: 変更ファイルを提示(コミットはユーザーが行う)**

変更ファイル: `plugins/theme.client.ts`(新規), `pages/profile.vue`, `tests/e2e/account-flow.test.ts`
