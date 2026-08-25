# 管理画面: ナビゲーションメニュー Design

## Context

現在、管理画面(`/admin/drafts`・`/admin/articles`・`/admin/sources`)はそれぞれURL直打ちでしかアクセスできない。過去のdesign(`2026-08-22`〜`2026-08-25`の各admin画面design)ではいずれも「ナビゲーションリンクを追加しない」をNon-Goalとしていたが、管理画面が3つに増えたことで移動の手間が無視できなくなった。このdesignはその方針を覆し、管理画面同士を行き来できる共通ナビゲーションコンポーネントを追加する範囲を定める。

## Goals

- `/admin/drafts`・`/admin/articles`・`/admin/sources`の各画面に、他の管理画面へのリンクが並んだナビゲーションを表示する
- 現在表示中の画面のリンクをハイライトする
- 3画面で同じ実装を重複させず、1つの共通コンポーネントとして持つ

## Non-Goals

- トップページ(`/`)や通常ユーザー向けヘッダー(`layouts/default.vue`)への管理画面への導線追加(管理画面内で完結させる)
- 管理者以外への表示制御(各ページ自体が`requireAdminUser`で既にAPIレベルでガードされている。ナビ自体は誰が見ても表示されるが、非管理者はどのみち各ページのAPIが403を返し「You do not have access to this page.」が出るだけなので実害はない)
- Nuxt UI(`UButton`等)を使ったタブ風の見た目(シンプルなテキストリンクで十分)

## Architecture

### 新規: `components/AdminNav.vue`

```vue
<script setup lang="ts">
const links = [
  { to: '/admin/drafts', label: 'Drafts' },
  { to: '/admin/articles', label: 'Articles' },
  { to: '/admin/sources', label: 'Sources' }
]
</script>

<template>
  <nav class="flex gap-4 mb-6 text-sm">
    <NuxtLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      class="text-muted hover:text-primary"
      active-class="text-primary font-bold"
    >
      {{ link.label }}
    </NuxtLink>
  </nav>
</template>
```

`links`配列がこのプロジェクトの管理画面一覧の唯一の情報源になる。将来管理画面が増えたら、この配列に1行足すだけで3画面すべてのナビに反映される。

Nuxtのcomponents自動importにより、`pages/admin/*.vue`側で`import`文は不要(`components/`直下は自動的にグローバル登録される。既存の`UserAvatar`・`ArticleCard`等と同じ仕組み)。

### 新規: `components/AdminNav.test.ts`

`components/WeatherCard.test.ts`と同じパターン(`@vue/test-utils`の`mount`、`NuxtLink`をstub)。

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AdminNav from './AdminNav.vue'

const stubs = {
  NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' }
}

describe('AdminNav', () => {
  it('renders links to all three admin pages', () => {
    const wrapper = mount(AdminNav, { global: { stubs } })
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(hrefs).toEqual(['/admin/drafts', '/admin/articles', '/admin/sources'])
  })

  it('renders the expected labels', () => {
    const wrapper = mount(AdminNav, { global: { stubs } })
    expect(wrapper.text()).toContain('Drafts')
    expect(wrapper.text()).toContain('Articles')
    expect(wrapper.text()).toContain('Sources')
  })
})
```

`NuxtLink`をstubするため、`active-class`が実際のルートに応じて付与される挙動そのものはこのテストでは検証しない(Nuxtのビルトイン機構に委ねる。手動確認でカバーする)。

### 変更: `pages/admin/drafts.vue` / `pages/admin/articles.vue` / `pages/admin/sources.vue`

3ファイルとも、テンプレート内の`<h1 ...>`の直前に1行追加するだけ:

```vue
<AdminNav />
<h1 class="text-2xl font-bold text-primary mb-6">...</h1>
```

ロジック(`<script setup>`)側の変更は一切ない。

## Testing

### `components/AdminNav.test.ts`(新規、上記)

- 3つのリンクが正しい`to`で描画されること
- 3つのラベルがすべて表示されること

### 手動確認

`pages/admin/*.vue`はトップレベル`await useFetch`を使うためユニットテストを作らない方針を既存designから踏襲しており、`<AdminNav />`を追加しても方針は変わらない。実装後に開発サーバー(またはビルド)で以下を目視確認する:

1. `/admin/drafts`を開き、ナビに3リンクが表示され、「Drafts」がハイライトされていること
2. 「Articles」をクリックすると`/admin/articles`に遷移し、今度は「Articles」がハイライトされること
3. `/admin/sources`でも同様にハイライトが切り替わること

## Open Questions

なし(brainstormingセッション内で解消済み)
