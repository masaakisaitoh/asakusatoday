# ASAKUSA TODAY UI (Nuxt UI導入・和モダンデザイン) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@nuxt/ui`を導入し、藍×朱の和モダンなカラーテーマとゴシック体タイポグラフィで、記事一覧・詳細・管理画面(下書き承認)にビジュアルデザインを与える。UI表示文言はすべて英語にする。

**Architecture:** 既存のNuxt 3構成に`@nuxt/ui`モジュールを追加し、Tailwind CSSベースのユーティリティクラスとNuxt UIコンポーネント(`UCard`, `UButton`, `UPagination`)でページを再構築する。`app.config.ts`でセマンティックカラー(primary=藍、secondary=朱)を定義し、共通レイアウト(`layouts/default.vue`)でヘッダー・フッターを一元化する。APIやDBスキーマ、サーバーロジックには一切手を入れない。

**Tech Stack:** Nuxt 3 / Nitro, `@nuxt/ui` 4.10.0(Tailwind CSS v4内包), Vue 3, vitest + @vue/test-utils + happy-dom

## Global Constraints

- UI表示文言(見出し・ボタン・エラーメッセージ・空状態メッセージ)はすべて英語にする。既存の日本語文言は本プランの各タスクで英語に差し替える。
- モバイルファーストでレイアウトを組む(まず1カラムを基準に、`sm:`/`lg:`のブレークポイントで拡張する)。
- ダークモードはOS設定に自動追従させる(`@nuxt/ui`同梱の`@nuxtjs/color-mode`に任せ、追加設定は行わない)。
- 表示ロジックの変更のみを行う。`server/`配下のAPI・DBスキーマ・ロジックは一切変更しない。
- 既存のテストパターンに従う: コンポーネントテストは`@vue/test-utils`の`mount()`に`global.stubs`で`NuxtLink`等をスタブする既存方式(`components/ArticleCard.test.ts`)を踏襲する。
- **このリポジトリではgitコマンドを実行しない(ユーザーのCLAUDE.md指示)。** 各タスク末尾の「コミット」ステップは、実際には`git add`/`git commit`を実行せず、変更したファイル一覧をユーザーに報告し、コミットはユーザー自身に行ってもらう。
- 各タスクの最後は該当ファイルのみ`npx vitest run <path>`で確認する(他タスクの一時的な失敗に引きずられないため)。全タスク完了後に`npm test`で全体確認する。

---

### Task 1: `@nuxt/ui`の導入とカラーテーマ定義

**Files:**
- Modify: `nuxt.config.ts`
- Create: `assets/css/main.css`
- Create: `app.config.ts`
- Modify: `app.vue`

**Interfaces:**
- Produces: `@nuxt/ui`のコンポーネント(`UCard`, `UButton`, `UPagination`等)がページ・コンポーネントから自動インポートで使える状態。`app.config.ts`で`primary`(藍)・`secondary`(朱)のセマンティックカラーが定義され、以降のタスクで`color="secondary"`や`text-primary`等のユーティリティクラスとして使える。

- [ ] **Step 1: `@nuxt/ui`をインストール**

Run: `npm install @nuxt/ui`
Expected: `package.json`の`dependencies`に`@nuxt/ui`が追加される

- [ ] **Step 2: Tailwind CSS読み込み用のCSSファイルを作成**

Create `assets/css/main.css`:

```css
@import "tailwindcss";
@import "@nuxt/ui";
```

- [ ] **Step 3: カラーテーマを`app.config.ts`に定義**

Create `app.config.ts`:

```ts
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'indigo',
      secondary: 'red',
      neutral: 'slate'
    }
  }
})
```

- [ ] **Step 4: `nuxt.config.ts`に`@nuxt/ui`モジュールとCSSを登録**

`nuxt.config.ts`を以下に置き換える:

```ts
export default defineNuxtConfig({
  compatibilityDate: '2026-08-13',
  devtools: { enabled: false },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css']
})
```

- [ ] **Step 5: `app.vue`を`UApp`でラップ**

`app.vue`を以下に置き換える:

```vue
<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
```

- [ ] **Step 6: 既存のスモークテストが通ることを確認**

Run: `npx vitest run tests/smoke.test.ts`
Expected: PASS(`layouts/default.vue`がまだ無いため`NuxtLayout`は素通りするだけで、トップページに"ASAKUSA TODAY"が引き続き含まれる)

- [ ] **Step 7: 開発サーバーでビルドエラーがないことを確認**

Run: `npm run dev`を起動し、`http://localhost:3000/`にアクセスしてコンソール・ターミナルにエラーが出ていないことを目視確認する。確認後Ctrl+Cで停止する。

- [ ] **Step 8: 変更内容を報告(コミットはユーザーが実施)**

変更ファイル: `package.json`, `package-lock.json`, `nuxt.config.ts`, `assets/css/main.css`, `app.config.ts`, `app.vue`
コミットメッセージ案: `chore: add @nuxt/ui and configure indigo/red color theme`

---

### Task 2: 共通レイアウト(ヘッダー・フッター)の作成

**Files:**
- Create: `layouts/default.vue`
- Create: `layouts/default.test.ts`

**Interfaces:**
- Consumes: Task 1で導入した`@nuxt/ui`のカラートークン(`text-primary`, `border-default`, `text-muted`)
- Produces: `layouts/default.vue`。`app.vue`の`<NuxtLayout>`から自動適用され、ロゴヘッダーとAI生成物である旨のフッター注記を全ページに提供する。

- [ ] **Step 1: 失敗するテストを書く**

Create `layouts/default.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DefaultLayout from './default.vue'

const stubs = { NuxtLink: { template: '<a><slot /></a>' } }

describe('default layout', () => {
  it('renders the site logo linking to home', () => {
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    expect(wrapper.text()).toContain('ASAKUSA TODAY')
  })

  it('renders the AI-generation disclosure in the footer', () => {
    const wrapper = mount(DefaultLayout, { global: { stubs } })
    expect(wrapper.text()).toContain('AI-generated')
  })

  it('renders slot content in the main area', () => {
    const wrapper = mount(DefaultLayout, {
      slots: { default: '<div class="test-content">Hello</div>' },
      global: { stubs }
    })
    expect(wrapper.find('.test-content').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run layouts/default.test.ts`
Expected: FAIL(`./default.vue`が存在しない)

- [ ] **Step 3: `layouts/default.vue`を実装**

Create `layouts/default.vue`:

```vue
<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-default">
      <div class="max-w-5xl mx-auto px-4 py-4">
        <NuxtLink to="/" class="text-xl font-bold text-primary no-underline">
          ASAKUSA TODAY
        </NuxtLink>
      </div>
    </header>
    <main class="flex-1">
      <slot />
    </main>
    <footer class="border-t border-default">
      <div class="max-w-5xl mx-auto px-4 py-4 text-sm text-muted">
        Articles are AI-generated from public sources and reviewed by our editors before publishing.
      </div>
    </footer>
  </div>
</template>
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run layouts/default.test.ts`
Expected: PASS

- [ ] **Step 5: 既存のスモークテストが通ることを確認**

Run: `npx vitest run tests/smoke.test.ts`
Expected: PASS

- [ ] **Step 6: 変更内容を報告(コミットはユーザーが実施)**

変更ファイル: `layouts/default.vue`, `layouts/default.test.ts`
コミットメッセージ案: `feat: add default layout with logo header and AI-disclosure footer`

---

### Task 3: `ArticleCard.vue`を`UCard`ベースに再構築

**Files:**
- Modify: `components/ArticleCard.vue`
- Modify: `components/ArticleCard.test.ts`

**Interfaces:**
- Consumes: Task 1で導入した`@nuxt/ui`の`UCard`コンポーネントとカラートークン(`text-highlighted`, `text-muted`, `hover:ring-secondary`)
- Produces: `<ArticleCard :id :title :image-url :published-at />`(既存と同じprops、DOM構造は`h2`タイトル・`time`公開日・任意の`img`を維持)

- [ ] **Step 1: `ArticleCard.vue`を`UCard`ベースに実装し直す**

`components/ArticleCard.vue`を以下に置き換える:

```vue
<script setup lang="ts">
defineProps<{
  id: number
  title: string
  publishedAt: string
  imageUrl?: string | null
}>()
</script>

<template>
  <NuxtLink :to="`/articles/${id}`" class="block h-full no-underline">
    <UCard class="h-full transition hover:ring-2 hover:ring-secondary" :ui="{ body: 'p-4', header: 'p-0' }">
      <template v-if="imageUrl" #header>
        <img :src="imageUrl" :alt="title" class="aspect-video w-full object-cover">
      </template>
      <h2 class="line-clamp-2 font-bold text-highlighted">{{ title }}</h2>
      <time class="text-sm text-muted">{{ publishedAt }}</time>
    </UCard>
  </NuxtLink>
</template>
```

- [ ] **Step 2: 既存テストを`UCard`未スタブのまま実行し、失敗することを確認**

Run: `npx vitest run components/ArticleCard.test.ts`
Expected: FAIL または警告付きで期待通りにレンダリングされない(`UCard`が`global.stubs`に登録されておらず、Nuxtの自動インポートも無いテスト環境のため解決できない)

- [ ] **Step 3: テストに`UCard`のスタブを追加**

`components/ArticleCard.test.ts`の`stubs`定義を以下に置き換える(以降のテスト本体は変更なし):

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ArticleCard from './ArticleCard.vue'

const stubs = {
  NuxtLink: { template: '<a><slot /></a>' },
  UCard: { template: '<div><slot name="header" /><slot /></div>' }
}

describe('ArticleCard', () => {
  it('renders the title and published date', () => {
    const wrapper = mount(ArticleCard, {
      props: { id: 1, title: 'テスト記事', publishedAt: '2026-08-14', imageUrl: null },
      global: { stubs }
    })
    expect(wrapper.text()).toContain('テスト記事')
    expect(wrapper.text()).toContain('2026-08-14')
  })

  it('renders an image when imageUrl is provided', () => {
    const wrapper = mount(ArticleCard, {
      props: { id: 1, title: 'テスト記事', publishedAt: '2026-08-14', imageUrl: 'https://example.com/a.jpg' },
      global: { stubs }
    })
    expect(wrapper.find('img').exists()).toBe(true)
  })

  it('does not render an image when imageUrl is absent', () => {
    const wrapper = mount(ArticleCard, {
      props: { id: 1, title: 'テスト記事', publishedAt: '2026-08-14' },
      global: { stubs }
    })
    expect(wrapper.find('img').exists()).toBe(false)
  })
})
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run components/ArticleCard.test.ts`
Expected: PASS

- [ ] **Step 5: 変更内容を報告(コミットはユーザーが実施)**

変更ファイル: `components/ArticleCard.vue`, `components/ArticleCard.test.ts`
コミットメッセージ案: `feat: rebuild ArticleCard on UCard with hover accent`

---

### Task 4: トップページのカードグリッド化・ページネーション・英語化

**Files:**
- Modify: `pages/index.vue`

**Interfaces:**
- Consumes: `GET /api/articles?page=`(既存API、変更なし)、`ArticleCard`(Task 3)、`UPagination`(Task 1で導入)

- [ ] **Step 1: `pages/index.vue`を実装**

`pages/index.vue`を以下に置き換える:

```vue
<script setup lang="ts">
import { computed } from 'vue'

const route = useRoute()
const router = useRouter()

const page = computed({
  get: () => Number(route.query.page) || 1,
  set: (value: number) => {
    router.push({ path: '/', query: { page: value } })
  }
})

const { data } = await useFetch('/api/articles', {
  query: { page },
  watch: [page]
})
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold text-primary mb-6">ASAKUSA TODAY</h1>
    <p v-if="data && data.articles.length === 0" class="text-muted">
      No articles yet.
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <ArticleCard
        v-for="article in data?.articles"
        :id="article.id"
        :key="article.id"
        :title="article.title"
        :image-url="article.image_url"
        :published-at="article.published_at ?? ''"
      />
    </div>
    <div v-if="data && data.total > data.pageSize" class="flex justify-center mt-8">
      <UPagination v-model:page="page" :total="data.total" :items-per-page="data.pageSize" />
    </div>
  </div>
</template>
```

- [ ] **Step 2: 既存のスモークテストが通ることを確認**

Run: `npx vitest run tests/smoke.test.ts`
Expected: PASS(トップページに"ASAKUSA TODAY"が引き続き含まれる)

- [ ] **Step 3: 開発サーバーで手動確認**

Run: `npm run dev`を起動し、`/`にアクセスして以下を確認する:
- 記事が0件の場合に"No articles yet."が表示される(DBが空の状態で確認)
- モバイル幅(375px相当)で1カラム、デスクトップ幅で複数カラムのグリッドになる
- 記事が11件以上ある場合にページネーションが表示され、ページ送りが機能する(手元にデータがなければこの項目はスキップしてよい)

確認後Ctrl+Cで停止する。

- [ ] **Step 4: 変更内容を報告(コミットはユーザーが実施)**

変更ファイル: `pages/index.vue`
コミットメッセージ案: `feat: redesign top page with card grid and UPagination`

---

### Task 5: 記事詳細ページのビジュアル実装・英語化

**Files:**
- Modify: `pages/articles/[id].vue`

**Interfaces:**
- Consumes: `GET /api/articles/:id`(既存API、変更なし)

- [ ] **Step 1: `pages/articles/[id].vue`を実装**

`pages/articles/[id].vue`を以下に置き換える:

```vue
<script setup lang="ts">
const route = useRoute()
const { data: article, error } = await useFetch(`/api/articles/${route.params.id}`)

if (error.value) {
  throw createError({ statusCode: error.value.statusCode || 404, statusMessage: 'Article not found' })
}
</script>

<template>
  <div v-if="article" class="max-w-2xl mx-auto px-4 py-8">
    <img
      v-if="article.image_url"
      :src="article.image_url"
      :alt="article.title"
      class="w-full aspect-video object-cover rounded-lg mb-6"
    >
    <h1 class="text-3xl font-bold text-highlighted mb-2">{{ article.title }}</h1>
    <time class="text-sm text-muted">{{ article.published_at }}</time>
    <p class="mt-6 leading-relaxed whitespace-pre-wrap">{{ article.body }}</p>
    <p class="mt-8 pt-4 border-t border-default text-sm text-muted">
      Source:
      <a :href="article.source_url" target="_blank" rel="noopener" class="text-primary underline">{{ article.source_name }}</a>
    </p>
  </div>
</template>
```

- [ ] **Step 2: 既存のAPI結合テストが通ることを確認**

Run: `npx vitest run tests/api/articles.test.ts`
Expected: PASS(表示ロジックのみの変更でAPIレスポンス形状は変えていないため影響なし)

- [ ] **Step 3: 開発サーバーで手動確認**

Run: `npm run dev`を起動し、存在しない記事IDで`/articles/999999`にアクセスして404になること、公開済み記事があればそのページでタイトル・本文・出典リンクが表示されることを確認する。確認後Ctrl+Cで停止する。

- [ ] **Step 4: 変更内容を報告(コミットはユーザーが実施)**

変更ファイル: `pages/articles/[id].vue`
コミットメッセージ案: `feat: redesign article detail page and translate copy to English`

---

### Task 6: 管理画面(下書き承認)のビジュアル実装・英語化

**Files:**
- Modify: `pages/admin/drafts.vue`

**Interfaces:**
- Consumes: `GET /api/admin/drafts`, `POST /api/admin/drafts/:id/publish`, `POST /api/admin/drafts/:id/reject`(既存API、変更なし)、`UCard`・`UButton`(Task 1で導入)

- [ ] **Step 1: `pages/admin/drafts.vue`を実装**

`pages/admin/drafts.vue`を以下に置き換える:

```vue
<script setup lang="ts">
const { data: drafts, error, refresh } = await useFetch('/api/admin/drafts')

async function publish(id: number) {
  await $fetch(`/api/admin/drafts/${id}/publish`, { method: 'POST' })
  await refresh()
}

async function reject(id: number) {
  await $fetch(`/api/admin/drafts/${id}/reject`, { method: 'POST' })
  await refresh()
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold text-primary mb-6">Draft Review</h1>
    <p v-if="error" class="text-muted">You do not have access to this page.</p>
    <template v-else>
      <p v-if="drafts && drafts.length === 0" class="text-muted">No drafts to review.</p>
      <UCard v-for="draft in drafts" :key="draft.id" class="mb-4">
        <h2 class="text-lg font-bold text-highlighted mb-2">{{ draft.title }}</h2>
        <p class="mb-4 whitespace-pre-wrap">{{ draft.body }}</p>
        <p class="text-sm text-muted mb-4">
          Source: {{ draft.source_name }} ({{ draft.source_url }})
        </p>
        <div class="flex gap-2">
          <UButton color="secondary" @click="publish(draft.id)">Approve</UButton>
          <UButton variant="outline" @click="reject(draft.id)">Reject</UButton>
        </div>
      </UCard>
    </template>
  </div>
</template>
```

- [ ] **Step 2: 既存のAPI結合テストが通ることを確認**

Run: `npx vitest run tests/api/admin.test.ts`
Expected: PASS(表示ロジックのみの変更でAPIレスポンス形状は変えていないため影響なし)

- [ ] **Step 3: 開発サーバーで手動確認**

Run: `npm run dev`を起動し、未ログイン状態で`/admin/drafts`にアクセスして"You do not have access to this page."が表示されること、`is_admin=1`のユーザーでログインした状態で下書きが存在すれば一覧・承認・却下ボタンが機能することを確認する。確認後Ctrl+Cで停止する。

- [ ] **Step 4: 全体テストを実行**

Run: `npm test`
Expected: PASS(全テストスイート)

- [ ] **Step 5: 変更内容を報告(コミットはユーザーが実施)**

変更ファイル: `pages/admin/drafts.vue`
コミットメッセージ案: `feat: redesign draft review page and translate copy to English`
