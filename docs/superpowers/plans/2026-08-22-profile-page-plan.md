# プロフィールページ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pages/profile.vue`を、閲覧・編集(ユーザー名/性別/生まれ年/国籍)両対応のブランドデザイン準拠フル機能ページとして構築する。あわせて`layouts/default.vue`のユーザーメニュー文言を英語化する。

**Architecture:** 新規`utils/countries.ts`にISO 3166-1 alpha-2の国コード一覧を静的データとして定義する。`pages/profile.vue`は`UCard`内に閲覧モード(`mode === 'view'`)と編集モード(`mode === 'edit'`)を切り替えるVueコンポーネントとして書き直す。編集フォームは`UForm`+zodスキーマでバリデーションし、既存の`PATCH /api/user/profile`に送信する。`layouts/default.vue`のヘッダードロップダウンは日本語ラベルを英語ラベルに置き換える。

**Tech Stack:** Vue 3(`<script setup>`), Nuxt 3, @nuxt/ui v3(`UCard`/`UForm`/`UFormField`/`UInput`/`USelect`/`USelectMenu`/`UInputNumber`/`UButton`)、zod、Vitest、`@nuxt/test-utils/e2e`(Playwright)

## Global Constraints

- CLAUDE.mdの方針により、gitコマンド(`git add`/`git commit`等)は実行しない。各タスク末尾の「コミット」ステップは、実行者(人間)が内容を確認してから手動で行う
- このページで新規に書く文言はすべて英語にする(サイトの想定読者は英語圏の旅行者)
- `pages/profile.vue`は他ページ(`pages/index.vue`等)と同様にトップレベルで`await useFetch(...)`を使う。Nuxt実行時は`<NuxtPage>`内部の`Suspense`で問題なく動くが、`@vue/test-utils`の素の`mount()`はSuspenseを提供しないため単体テストでは描画されない(実機検証済み)。このコードベースに既存の`pages/*.test.ts`が存在しないのはこれが理由であり、この方針を踏襲して`pages/profile.vue`の単体テストは作らない。検証はすべて`tests/e2e/account-flow.test.ts`(実ブラウザ)で行う
- サーバー側のバリデーション制約(`server/api/user/profile.patch.ts`)と同じ制約をクライアント側zodスキーマでも守る: `userName: /^[A-Za-z0-9_-]{3,32}$/`、`gender: 'male'|'female'|'other'|'unspecified'`、`birthYear: 1900〜当年の整数 or null`、`nationality: 2文字 or null`

---

### Task 1: `utils/countries.ts` — ISO国コード一覧

**Files:**
- Create: `utils/countries.ts`
- Test: `utils/countries.test.ts`

**Interfaces:**
- Produces: `export interface Country { code: string; name: string }` / `export const COUNTRIES: Country[]`(Task 3が`pages/profile.vue`から使う)

- [ ] **Step 1: 失敗するテストを書く**

`utils/countries.test.ts`を新規作成:

```ts
import { describe, it, expect } from 'vitest'
import { COUNTRIES } from './countries'

describe('COUNTRIES', () => {
  it('includes Japan with the correct ISO code', () => {
    expect(COUNTRIES).toContainEqual({ code: 'JP', name: 'Japan' })
  })

  it('has no duplicate codes', () => {
    const codes = COUNTRIES.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('uses 2-letter uppercase ISO codes', () => {
    for (const country of COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/)
    }
  })

  it('is sorted alphabetically by name', () => {
    const names = COUNTRIES.map((c) => c.name)
    const sorted = [...names].sort((a, b) => a.localeCompare(b))
    expect(names).toEqual(sorted)
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run utils/countries.test.ts`
Expected: FAIL(`./countries`モジュールが存在せずエラーになる)

- [ ] **Step 3: `utils/countries.ts`を実装する**

`utils/countries.ts`を新規作成し、以下の内容をそのまま書き込む(ISO 3166-1 alpha-2、英語名、name昇順ソート済み、249件):

```ts
export interface Country {
  code: string
  name: string
}

export const COUNTRIES: Country[] = [
  { code: 'AF', name: 'Afghanistan' },
  { code: 'AX', name: 'Åland Islands' },
  { code: 'AL', name: 'Albania' },
  { code: 'DZ', name: 'Algeria' },
  { code: 'AS', name: 'American Samoa' },
  { code: 'AD', name: 'Andorra' },
  { code: 'AO', name: 'Angola' },
  { code: 'AI', name: 'Anguilla' },
  { code: 'AQ', name: 'Antarctica' },
  { code: 'AG', name: 'Antigua & Barbuda' },
  { code: 'AR', name: 'Argentina' },
  { code: 'AM', name: 'Armenia' },
  { code: 'AW', name: 'Aruba' },
  { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' },
  { code: 'AZ', name: 'Azerbaijan' },
  { code: 'BS', name: 'Bahamas' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'BB', name: 'Barbados' },
  { code: 'BY', name: 'Belarus' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BZ', name: 'Belize' },
  { code: 'BJ', name: 'Benin' },
  { code: 'BM', name: 'Bermuda' },
  { code: 'BT', name: 'Bhutan' },
  { code: 'BO', name: 'Bolivia' },
  { code: 'BA', name: 'Bosnia & Herzegovina' },
  { code: 'BW', name: 'Botswana' },
  { code: 'BV', name: 'Bouvet Island' },
  { code: 'BR', name: 'Brazil' },
  { code: 'IO', name: 'British Indian Ocean Territory' },
  { code: 'VG', name: 'British Virgin Islands' },
  { code: 'BN', name: 'Brunei' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'BF', name: 'Burkina Faso' },
  { code: 'BI', name: 'Burundi' },
  { code: 'KH', name: 'Cambodia' },
  { code: 'CM', name: 'Cameroon' },
  { code: 'CA', name: 'Canada' },
  { code: 'CV', name: 'Cape Verde' },
  { code: 'BQ', name: 'Caribbean Netherlands' },
  { code: 'KY', name: 'Cayman Islands' },
  { code: 'CF', name: 'Central African Republic' },
  { code: 'TD', name: 'Chad' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'CX', name: 'Christmas Island' },
  { code: 'CC', name: 'Cocos (Keeling) Islands' },
  { code: 'CO', name: 'Colombia' },
  { code: 'KM', name: 'Comoros' },
  { code: 'CG', name: 'Congo - Brazzaville' },
  { code: 'CD', name: 'Congo - Kinshasa' },
  { code: 'CK', name: 'Cook Islands' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'CI', name: 'Côte d’Ivoire' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CU', name: 'Cuba' },
  { code: 'CW', name: 'Curaçao' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'DK', name: 'Denmark' },
  { code: 'DJ', name: 'Djibouti' },
  { code: 'DM', name: 'Dominica' },
  { code: 'DO', name: 'Dominican Republic' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'EG', name: 'Egypt' },
  { code: 'SV', name: 'El Salvador' },
  { code: 'GQ', name: 'Equatorial Guinea' },
  { code: 'ER', name: 'Eritrea' },
  { code: 'EE', name: 'Estonia' },
  { code: 'SZ', name: 'Eswatini' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'FK', name: 'Falkland Islands' },
  { code: 'FO', name: 'Faroe Islands' },
  { code: 'FJ', name: 'Fiji' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'GF', name: 'French Guiana' },
  { code: 'PF', name: 'French Polynesia' },
  { code: 'TF', name: 'French Southern Territories' },
  { code: 'GA', name: 'Gabon' },
  { code: 'GM', name: 'Gambia' },
  { code: 'GE', name: 'Georgia' },
  { code: 'DE', name: 'Germany' },
  { code: 'GH', name: 'Ghana' },
  { code: 'GI', name: 'Gibraltar' },
  { code: 'GR', name: 'Greece' },
  { code: 'GL', name: 'Greenland' },
  { code: 'GD', name: 'Grenada' },
  { code: 'GP', name: 'Guadeloupe' },
  { code: 'GU', name: 'Guam' },
  { code: 'GT', name: 'Guatemala' },
  { code: 'GG', name: 'Guernsey' },
  { code: 'GN', name: 'Guinea' },
  { code: 'GW', name: 'Guinea-Bissau' },
  { code: 'GY', name: 'Guyana' },
  { code: 'HT', name: 'Haiti' },
  { code: 'HM', name: 'Heard & McDonald Islands' },
  { code: 'HN', name: 'Honduras' },
  { code: 'HK', name: 'Hong Kong SAR China' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IS', name: 'Iceland' },
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IR', name: 'Iran' },
  { code: 'IQ', name: 'Iraq' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IM', name: 'Isle of Man' },
  { code: 'IL', name: 'Israel' },
  { code: 'IT', name: 'Italy' },
  { code: 'JM', name: 'Jamaica' },
  { code: 'JP', name: 'Japan' },
  { code: 'JE', name: 'Jersey' },
  { code: 'JO', name: 'Jordan' },
  { code: 'KZ', name: 'Kazakhstan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'KI', name: 'Kiribati' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'KG', name: 'Kyrgyzstan' },
  { code: 'LA', name: 'Laos' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LB', name: 'Lebanon' },
  { code: 'LS', name: 'Lesotho' },
  { code: 'LR', name: 'Liberia' },
  { code: 'LY', name: 'Libya' },
  { code: 'LI', name: 'Liechtenstein' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MO', name: 'Macao SAR China' },
  { code: 'MG', name: 'Madagascar' },
  { code: 'MW', name: 'Malawi' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'MV', name: 'Maldives' },
  { code: 'ML', name: 'Mali' },
  { code: 'MT', name: 'Malta' },
  { code: 'MH', name: 'Marshall Islands' },
  { code: 'MQ', name: 'Martinique' },
  { code: 'MR', name: 'Mauritania' },
  { code: 'MU', name: 'Mauritius' },
  { code: 'YT', name: 'Mayotte' },
  { code: 'MX', name: 'Mexico' },
  { code: 'FM', name: 'Micronesia' },
  { code: 'MD', name: 'Moldova' },
  { code: 'MC', name: 'Monaco' },
  { code: 'MN', name: 'Mongolia' },
  { code: 'ME', name: 'Montenegro' },
  { code: 'MS', name: 'Montserrat' },
  { code: 'MA', name: 'Morocco' },
  { code: 'MZ', name: 'Mozambique' },
  { code: 'MM', name: 'Myanmar (Burma)' },
  { code: 'NA', name: 'Namibia' },
  { code: 'NR', name: 'Nauru' },
  { code: 'NP', name: 'Nepal' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NC', name: 'New Caledonia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'NI', name: 'Nicaragua' },
  { code: 'NE', name: 'Niger' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'NU', name: 'Niue' },
  { code: 'NF', name: 'Norfolk Island' },
  { code: 'KP', name: 'North Korea' },
  { code: 'MK', name: 'North Macedonia' },
  { code: 'MP', name: 'Northern Mariana Islands' },
  { code: 'NO', name: 'Norway' },
  { code: 'OM', name: 'Oman' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'PW', name: 'Palau' },
  { code: 'PS', name: 'Palestinian Territories' },
  { code: 'PA', name: 'Panama' },
  { code: 'PG', name: 'Papua New Guinea' },
  { code: 'PY', name: 'Paraguay' },
  { code: 'PE', name: 'Peru' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PN', name: 'Pitcairn Islands' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'QA', name: 'Qatar' },
  { code: 'RE', name: 'Réunion' },
  { code: 'RO', name: 'Romania' },
  { code: 'RU', name: 'Russia' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'WS', name: 'Samoa' },
  { code: 'SM', name: 'San Marino' },
  { code: 'ST', name: 'São Tomé & Príncipe' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SN', name: 'Senegal' },
  { code: 'RS', name: 'Serbia' },
  { code: 'SC', name: 'Seychelles' },
  { code: 'SL', name: 'Sierra Leone' },
  { code: 'SG', name: 'Singapore' },
  { code: 'SX', name: 'Sint Maarten' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'SB', name: 'Solomon Islands' },
  { code: 'SO', name: 'Somalia' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'GS', name: 'South Georgia & South Sandwich Islands' },
  { code: 'KR', name: 'South Korea' },
  { code: 'SS', name: 'South Sudan' },
  { code: 'ES', name: 'Spain' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'BL', name: 'St. Barthélemy' },
  { code: 'SH', name: 'St. Helena' },
  { code: 'KN', name: 'St. Kitts & Nevis' },
  { code: 'LC', name: 'St. Lucia' },
  { code: 'MF', name: 'St. Martin' },
  { code: 'PM', name: 'St. Pierre & Miquelon' },
  { code: 'VC', name: 'St. Vincent & Grenadines' },
  { code: 'SD', name: 'Sudan' },
  { code: 'SR', name: 'Suriname' },
  { code: 'SJ', name: 'Svalbard & Jan Mayen' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'SY', name: 'Syria' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TJ', name: 'Tajikistan' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TL', name: 'Timor-Leste' },
  { code: 'TG', name: 'Togo' },
  { code: 'TK', name: 'Tokelau' },
  { code: 'TO', name: 'Tonga' },
  { code: 'TT', name: 'Trinidad & Tobago' },
  { code: 'TN', name: 'Tunisia' },
  { code: 'TR', name: 'Türkiye' },
  { code: 'TM', name: 'Turkmenistan' },
  { code: 'TC', name: 'Turks & Caicos Islands' },
  { code: 'TV', name: 'Tuvalu' },
  { code: 'UM', name: 'U.S. Outlying Islands' },
  { code: 'VI', name: 'U.S. Virgin Islands' },
  { code: 'UG', name: 'Uganda' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'UZ', name: 'Uzbekistan' },
  { code: 'VU', name: 'Vanuatu' },
  { code: 'VA', name: 'Vatican City' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'WF', name: 'Wallis & Futuna' },
  { code: 'EH', name: 'Western Sahara' },
  { code: 'YE', name: 'Yemen' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'ZW', name: 'Zimbabwe' }
]
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run utils/countries.test.ts`
Expected: PASS(4件とも)

- [ ] **Step 5: コミット**

```bash
git add utils/countries.ts utils/countries.test.ts
git commit -m "ISO国コード一覧utils/countries.tsを追加"
```

---

### Task 2: `pages/profile.vue` — 閲覧モードの書き直し

**Files:**
- Modify: `pages/profile.vue`(全面書き直し)
- Modify: `tests/e2e/account-flow.test.ts:9-30`(既存シナリオの文言更新 + 新規表示項目のアサーション追加)

**Interfaces:**
- Consumes: `COUNTRIES`(Task 1)、既存API `GET /api/user/me`・`POST /api/user/avatar/regenerate`・`POST /api/auth/logout`
- Produces: 閲覧モードの`pages/profile.vue`(Task 3が編集モードを追加する土台)

- [ ] **Step 1: `pages/profile.vue`を閲覧モードのみで書き直す**

`pages/profile.vue`の内容を丸ごと以下に置き換える:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { COUNTRIES } from '../utils/countries'

const { data: user, refresh, error } = await useFetch('/api/user/me')

if (error.value) {
  await navigateTo('/login')
}

const regenerating = ref(false)

async function regenerateAvatar(): Promise<void> {
  regenerating.value = true
  await $fetch('/api/user/avatar/regenerate', { method: 'POST' })
  await refresh()
  regenerating.value = false
}

async function logout(): Promise<void> {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}

function formatJoinedDate(createdAt: string): string {
  return createdAt.slice(0, 10)
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const GENDER_LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  unspecified: 'Not set'
}

function genderLabel(gender: string | null): string {
  if (!gender) return 'Not set'
  return GENDER_LABELS[gender] ?? 'Not set'
}

function nationalityLabel(code: string | null): string {
  if (!code) return 'Not set'
  return COUNTRIES.find((c) => c.code === code)?.name ?? code
}
</script>

<template>
  <div v-if="user" class="max-w-2xl mx-auto px-4 py-8">
    <UCard>
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-4">
          <UserAvatar :seed="user.avatar_seed" :size="72" />
          <UButton :loading="regenerating" variant="outline" size="sm" @click="regenerateAvatar">
            Regenerate avatar
          </UButton>
        </div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt class="text-muted">Username</dt>
          <dd>{{ user.user_name }}</dd>
          <dt class="text-muted">Joined</dt>
          <dd>{{ formatJoinedDate(user.created_at) }}</dd>
          <dt class="text-muted">Gender</dt>
          <dd>{{ genderLabel(user.gender) }}</dd>
          <dt class="text-muted">Birth year</dt>
          <dd>{{ user.birth_year ?? 'Not set' }}</dd>
          <dt class="text-muted">Nationality</dt>
          <dd>{{ nationalityLabel(user.nationality) }}</dd>
          <dt class="text-muted">Wallet address</dt>
          <dd class="font-mono" :title="user.address">{{ formatAddress(user.address) }}</dd>
        </dl>
        <div class="flex gap-3 pt-2">
          <UButton variant="outline" color="neutral" @click="logout">Log out</UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>
```

- [ ] **Step 2: `tests/e2e/account-flow.test.ts`の既存シナリオを新しい英語文言に合わせて更新する**

1つ目の`it('creates an account, views the profile, regenerates the avatar, and logs out', ...)`内の該当行を書き換える。変更前:

```ts
    await page.check('input[type=checkbox]')
    await page.click('text=続ける')
    await page.waitForURL(/\/profile/)
    await page.waitForSelector('svg')

    expect(await page.locator('svg').isVisible()).toBe(true)
    const before = await page.locator('svg').innerHTML()
    await page.click('text=作り直す')
    await expect.poll(() => page.locator('svg').innerHTML()).not.toBe(before)

    await page.click('text=ログアウト')
    await page.waitForURL(/\/login/)
```

変更後:

```ts
    await page.check('input[type=checkbox]')
    await page.click('text=続ける')
    await page.waitForURL(/\/profile/)
    await page.waitForSelector('svg')

    expect(await page.locator('svg').isVisible()).toBe(true)
    expect(await page.locator('text=Not set').count()).toBe(3)
    expect(await page.locator('dd.font-mono').isVisible()).toBe(true)

    const before = await page.locator('svg').innerHTML()
    await page.click('text=Regenerate avatar')
    await expect.poll(() => page.locator('svg').innerHTML()).not.toBe(before)

    await page.click('text=Log out')
    await page.waitForURL(/\/login/)
```

(新規アカウントは`gender`/`birth_year`/`nationality`が全て未設定なので「Not set」が3箇所表示される。ウォレットアドレス欄の`dd.font-mono`が表示されていることも合わせて確認する。)

- [ ] **Step 3: テストを実行して通ることを確認する**

Run: `npx vitest run tests/e2e/account-flow.test.ts`
Expected: 2件ともPASS(2つ目のテストは次のTaskでヘッダー文言を直すまでは失敗する可能性があるため、まずは1つ目のテストが通ることを重点的に確認する)

- [ ] **Step 4: コミット**

```bash
git add pages/profile.vue tests/e2e/account-flow.test.ts
git commit -m "プロフィールページの閲覧モードをブランドデザインで書き直し、英語UIにする"
```

---

### Task 3: `pages/profile.vue` — 編集モードの追加

**Files:**
- Modify: `pages/profile.vue`(編集モードを追加)
- Modify: `tests/e2e/account-flow.test.ts`(アカウント作成の重複コードをヘルパーに抽出 + 編集シナリオの新規テスト追加)

**Interfaces:**
- Consumes: `COUNTRIES`(Task 1)、既存API `PATCH /api/user/profile`
- Produces: 閲覧⇄編集を切り替え可能な完成形の`pages/profile.vue`

- [ ] **Step 1: `pages/profile.vue`に編集モードを追加する**

`pages/profile.vue`の内容を丸ごと以下に置き換える(Task 2の内容に編集モードを追加したもの):

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { COUNTRIES } from '../utils/countries'

const { data: user, refresh, error } = await useFetch('/api/user/me')

if (error.value) {
  await navigateTo('/login')
}

const regenerating = ref(false)

async function regenerateAvatar(): Promise<void> {
  regenerating.value = true
  await $fetch('/api/user/avatar/regenerate', { method: 'POST' })
  await refresh()
  regenerating.value = false
}

async function logout(): Promise<void> {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}

function formatJoinedDate(createdAt: string): string {
  return createdAt.slice(0, 10)
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const GENDER_LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  unspecified: 'Not set'
}

function genderLabel(gender: string | null): string {
  if (!gender) return 'Not set'
  return GENDER_LABELS[gender] ?? 'Not set'
}

function nationalityLabel(code: string | null): string {
  if (!code) return 'Not set'
  return COUNTRIES.find((c) => c.code === code)?.name ?? code
}

type Mode = 'view' | 'edit'
const mode = ref<Mode>('view')

const profileSchema = z.object({
  userName: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/, 'Use 3-32 letters, numbers, _ or -'),
  gender: z.enum(['male', 'female', 'other', 'unspecified']),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable(),
  nationality: z.string().length(2).nullable()
})
type ProfileFormState = z.infer<typeof profileSchema>

const formState = ref<ProfileFormState>({
  userName: '',
  gender: 'unspecified',
  birthYear: null,
  nationality: null
})

const genderOptions = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
  { label: 'Prefer not to say', value: 'unspecified' }
]

const saving = ref(false)
const submitError = ref('')

function startEdit(): void {
  if (!user.value) return
  formState.value = {
    userName: user.value.user_name,
    gender: (user.value.gender as ProfileFormState['gender']) ?? 'unspecified',
    birthYear: user.value.birth_year,
    nationality: user.value.nationality
  }
  submitError.value = ''
  mode.value = 'edit'
}

function cancelEdit(): void {
  mode.value = 'view'
}

async function onSubmit(event: FormSubmitEvent<ProfileFormState>): Promise<void> {
  saving.value = true
  submitError.value = ''
  try {
    await $fetch('/api/user/profile', { method: 'PATCH', body: event.data })
    await refresh()
    mode.value = 'view'
  } catch (e: any) {
    submitError.value =
      e?.statusCode === 409 ? 'This username is already taken.' : 'Something went wrong. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="user" class="max-w-2xl mx-auto px-4 py-8">
    <UCard>
      <div v-if="mode === 'view'" class="flex flex-col gap-4">
        <div class="flex items-center gap-4">
          <UserAvatar :seed="user.avatar_seed" :size="72" />
          <UButton :loading="regenerating" variant="outline" size="sm" @click="regenerateAvatar">
            Regenerate avatar
          </UButton>
        </div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt class="text-muted">Username</dt>
          <dd>{{ user.user_name }}</dd>
          <dt class="text-muted">Joined</dt>
          <dd>{{ formatJoinedDate(user.created_at) }}</dd>
          <dt class="text-muted">Gender</dt>
          <dd>{{ genderLabel(user.gender) }}</dd>
          <dt class="text-muted">Birth year</dt>
          <dd>{{ user.birth_year ?? 'Not set' }}</dd>
          <dt class="text-muted">Nationality</dt>
          <dd>{{ nationalityLabel(user.nationality) }}</dd>
          <dt class="text-muted">Wallet address</dt>
          <dd class="font-mono" :title="user.address">{{ formatAddress(user.address) }}</dd>
        </dl>
        <div class="flex gap-3 pt-2">
          <UButton @click="startEdit">Edit profile</UButton>
          <UButton variant="outline" color="neutral" @click="logout">Log out</UButton>
        </div>
      </div>

      <UForm v-else :schema="profileSchema" :state="formState" class="flex flex-col gap-4" @submit="onSubmit">
        <UFormField label="Username" name="userName">
          <UInput v-model="formState.userName" />
        </UFormField>
        <UFormField label="Gender" name="gender">
          <USelect v-model="formState.gender" :items="genderOptions" />
        </UFormField>
        <UFormField label="Birth year" name="birthYear">
          <UInputNumber v-model="formState.birthYear" :min="1900" :max="new Date().getFullYear()" />
        </UFormField>
        <UFormField label="Nationality" name="nationality">
          <USelectMenu
            v-model="formState.nationality"
            :items="COUNTRIES"
            value-key="code"
            label-key="name"
            placeholder="Select a country"
          />
        </UFormField>
        <p v-if="submitError" class="text-sm text-error">{{ submitError }}</p>
        <div class="flex gap-3 pt-2">
          <UButton type="submit" :loading="saving">Save</UButton>
          <UButton variant="outline" color="neutral" :disabled="saving" @click="cancelEdit">Cancel</UButton>
        </div>
      </UForm>
    </UCard>
  </div>
</template>
```

- [ ] **Step 2: `tests/e2e/account-flow.test.ts`にアカウント作成のヘルパー関数を抽出する**

ファイル冒頭、`describe('account flow', ...)`の直前に以下を追加する:

```ts
async function createAndLoginAccount(page: Awaited<ReturnType<typeof createPage>>): Promise<void> {
  await page.goto(new URL('/account/create', page.url()).toString())
  await page.check('input[type=checkbox]')
  await page.click('text=アカウントを新規作成')
  await page.check('input[type=checkbox]')
  await page.click('text=続ける')
  await page.waitForURL(/\/profile/)
}
```

1つ目の`it('creates an account, views the profile, regenerates the avatar, and logs out', ...)`冒頭を書き換える。変更前:

```ts
  it('creates an account, views the profile, regenerates the avatar, and logs out', async () => {
    const page = await createPage('/account/create')
    await page.check('input[type=checkbox]')
    await page.click('text=アカウントを新規作成')

    const privateKey = await page.locator('code').innerText()
    expect(privateKey).toMatch(/^[0-9A-Fa-f]{64}$/)

    await page.check('input[type=checkbox]')
    await page.click('text=続ける')
    await page.waitForURL(/\/profile/)
    await page.waitForSelector('svg')
```

変更後(秘密鍵の検証は`createAndLoginAccount`呼び出し前に単独で行う必要があるため、この1つ目のテストだけはヘルパーを使わず既存のまま維持する):

```ts
  it('creates an account, views the profile, regenerates the avatar, and logs out', async () => {
    const page = await createPage('/account/create')
    await page.check('input[type=checkbox]')
    await page.click('text=アカウントを新規作成')

    const privateKey = await page.locator('code').innerText()
    expect(privateKey).toMatch(/^[0-9A-Fa-f]{64}$/)

    await page.check('input[type=checkbox]')
    await page.click('text=続ける')
    await page.waitForURL(/\/profile/)
    await page.waitForSelector('svg')
```

(このステップでは1つ目のテストは変更しない。2つ目のテストのアカウント作成部分をヘルパーに置き換える。)

2つ目の`it('shows the header avatar when logged in and logs out via the header dropdown menu', ...)`の冒頭を書き換える。変更前:

```ts
  it('shows the header avatar when logged in and logs out via the header dropdown menu', async () => {
    const page = await createPage('/account/create')
    await page.check('input[type=checkbox]')
    await page.click('text=アカウントを新規作成')
    await page.check('input[type=checkbox]')
    await page.click('text=続ける')
    await page.waitForURL(/\/profile/)

    await page.goto(new URL('/', page.url()).toString())
```

変更後:

```ts
  it('shows the header avatar when logged in and logs out via the header dropdown menu', async () => {
    const page = await createPage('/account/create')
    await createAndLoginAccount(page)

    await page.goto(new URL('/', page.url()).toString())
```

- [ ] **Step 3: テストを実行して通ることを確認する(リファクタのみで挙動は変えていない)**

Run: `npx vitest run tests/e2e/account-flow.test.ts`
Expected: 2件ともPASS

- [ ] **Step 4: 編集モードの失敗するe2eテストを書く**

同ファイルの末尾(`describe`ブロックの最後の`})`の直前)に以下を追加する:

```ts

  it('edits the profile and saves the changes', async () => {
    const page = await createPage('/account/create')
    await createAndLoginAccount(page)

    await page.click('text=Edit profile')
    await page.fill('input[name=userName]', 'UpdatedName0001')
    await page.click('text=Save')

    await expect(page.locator('text=UpdatedName0001')).toBeVisible()
    await expect(page.locator('text=Edit profile')).toBeVisible()

    await page.close()
  }, 30000)

  it('discards changes when Cancel is clicked', async () => {
    const page = await createPage('/account/create')
    await createAndLoginAccount(page)

    const originalName = await page.locator('dd').first().innerText()

    await page.click('text=Edit profile')
    await page.fill('input[name=userName]', 'ShouldNotSaveXX')
    await page.click('text=Cancel')

    await expect(page.locator(`text=${originalName}`)).toBeVisible()
    await expect(page.locator('text=ShouldNotSaveXX')).toHaveCount(0)

    await page.close()
  }, 30000)

  it('shows an error when the username is already taken', async () => {
    const pageA = await createPage('/account/create')
    await createAndLoginAccount(pageA)
    const takenName = await pageA.locator('dd').first().innerText()

    const pageB = await createPage('/account/create')
    await createAndLoginAccount(pageB)

    await pageB.click('text=Edit profile')
    await pageB.fill('input[name=userName]', takenName)
    await pageB.click('text=Save')

    await expect(pageB.locator('text=This username is already taken.')).toBeVisible()

    await pageA.close()
    await pageB.close()
  }, 30000)
```

- [ ] **Step 5: テストを実行して通ることを確認する**

Run: `npx vitest run tests/e2e/account-flow.test.ts`
Expected: 5件ともPASS。失敗する場合はセレクタ(`input[name=userName]`が`UFormField`+`UInput`の組み合わせで実際にその`name`属性を持つ`<input>`を描画しているか)を実ブラウザで確認して調整する

- [ ] **Step 6: コミット**

```bash
git add pages/profile.vue tests/e2e/account-flow.test.ts
git commit -m "プロフィールページに編集モード(ユーザー名/性別/生まれ年/国籍)を追加"
```

---

### Task 4: ヘッダーのユーザーメニュー文言を英語化

**Files:**
- Modify: `layouts/default.vue`
- Modify: `layouts/default.test.ts`
- Modify: `tests/e2e/account-flow.test.ts`(2つ目のテストの文言更新)

**Interfaces:**
- Consumes: なし(既存の`userMenuItems`・`v-else`のログインリンクの文言のみ変更)

- [ ] **Step 1: `layouts/default.test.ts`を新しい英語文言に合わせて更新する(先に更新して失敗させる)**

以下の3箇所を書き換える:

```ts
  it('shows a login link and no avatar when the user is logged out', () => {
    stubUseState(null)
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    expect(wrapper.text()).toContain('Log in')
    expect(wrapper.find('.user-avatar-stub').exists()).toBe(false)
  })

  it('shows the user avatar in a dropdown with profile and logout options when logged in', () => {
    stubUseState({ avatar_seed: 'seed-1', user_name: 'tester' })
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    expect(wrapper.find('.user-avatar-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('Profile')
    expect(wrapper.text()).toContain('Log out')
  })

  it('logs out and redirects to /login when the logout item is selected', async () => {
    const { fetchMock, navigateMock } = stubUseState({ avatar_seed: 'seed-1', user_name: 'tester' })
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    const logoutItem = wrapper.findAll('li').find((li) => li.text() === 'Log out')
    await logoutItem?.trigger('click')
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    expect(navigateMock).toHaveBeenCalledWith('/login')
  })
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run layouts/default.test.ts`
Expected: 上記3件がFAIL(コンポーネント側はまだ日本語のため)

- [ ] **Step 3: `layouts/default.vue`のラベルを英語化する**

`userMenuItems`の定義を書き換える。変更前:

```ts
const userMenuItems = [
  [{ label: 'プロフィール', to: '/profile' }],
  [{ label: 'ログアウト', onSelect: logout }]
]
```

変更後:

```ts
const userMenuItems = [
  [{ label: 'Profile', to: '/profile' }],
  [{ label: 'Log out', onSelect: logout }]
]
```

テンプレート内の`aria-label`とログインリンクを書き換える。変更前:

```html
            <button
              type="button"
              class="h-9 w-9 rounded-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="ユーザーメニュー"
            >
              <UserAvatar :seed="user.avatar_seed" :size="36" />
            </button>
          </UDropdownMenu>
          <NuxtLink v-else to="/login" class="text-sm text-primary no-underline">ログイン</NuxtLink>
```

変更後:

```html
            <button
              type="button"
              class="h-9 w-9 rounded-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="User menu"
            >
              <UserAvatar :seed="user.avatar_seed" :size="36" />
            </button>
          </UDropdownMenu>
          <NuxtLink v-else to="/login" class="text-sm text-primary no-underline">Log in</NuxtLink>
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run layouts/default.test.ts`
Expected: 8件全てPASS

- [ ] **Step 5: `tests/e2e/account-flow.test.ts`の2つ目のテストを新しい英語文言に合わせて更新する**

変更前:

```ts
    await page.goto(new URL('/', page.url()).toString())
    await page.waitForSelector('[aria-label="ユーザーメニュー"]')
    expect(await page.locator('a:has-text("ログイン")').count()).toBe(0)

    await page.click('[aria-label="ユーザーメニュー"]')
    await page.click('text=ログアウト')
    await page.waitForURL(/\/login/)
```

変更後:

```ts
    await page.goto(new URL('/', page.url()).toString())
    await page.waitForSelector('[aria-label="User menu"]')
    expect(await page.locator('a:has-text("Log in")').count()).toBe(0)

    await page.click('[aria-label="User menu"]')
    await page.click('text=Log out')
    await page.waitForURL(/\/login/)
```

- [ ] **Step 6: テストを実行して成功を確認する**

Run: `npx vitest run tests/e2e/account-flow.test.ts layouts/default.test.ts`
Expected: 全件PASS

- [ ] **Step 7: コミット**

```bash
git add layouts/default.vue layouts/default.test.ts tests/e2e/account-flow.test.ts
git commit -m "ヘッダーのユーザーメニュー文言を英語化する"
```

---

### Task 5: 最終検証

**Files:** なし(検証のみ)

**Interfaces:**
- Consumes: Task 1〜4で実装した全機能

- [ ] **Step 1: 型チェックを実行する**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 今回変更したファイル(`utils/countries.ts`, `pages/profile.vue`, `layouts/default.vue`, `tests/e2e/account-flow.test.ts`)に起因する新規エラーが無いこと。(既存の`.vue`モジュール解決や`generator.test.ts`の型エラーはこの作業と無関係の既知の問題であり無視してよい)

- [ ] **Step 2: プロジェクト全体のテストスイートを実行する**

Run: `npx vitest run`
Expected: 全テストPASS

- [ ] **Step 3: devサーバーで実際に画面を確認する**

Run: `npm run dev`(バックグラウンド起動)

- ブラウザ相当のチェックとして、`/account/create`からアカウントを作成し`/profile`に遷移した状態で:
  - 閲覧モードにWASHI/ASAKUSA REDのブランドカラーが適用されていること
  - 「Edit profile」でフォームに切り替わり、Nationalityの`USelectMenu`で「Japan」等を検索・選択できること
  - 「Save」で保存され閲覧モードに戻ること
  - ヘッダーのアバターをクリックすると「Profile」「Log out」のドロップダウンが出ること
- 確認後、devサーバーを停止する

- [ ] **Step 4: 完了報告**

このタスクはコード変更を含まないため、コミットは不要。Task 1〜4のコミットが完了していることを確認して完了とする。
