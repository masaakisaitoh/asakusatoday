# プロフィール テーマ設定 Design

## Context

`pages/profile.vue`のプロフィール編集フォーム(ユーザー名・性別・生まれ年・国籍、[2026-08-22-profile-page-design.md](./2026-08-22-profile-page-design.md)参照)に、ライト/ダーク/システムのテーマ選択を追加する。

`@nuxt/ui@3`は内部で`@nuxtjs/color-mode`を自動的に有効化しており(デフォルトオプション`colorMode: true`)、OSのカラースキーム設定に追従したライト/ダーク自動切替は既に動いている。ただし、ユーザーが明示的にテーマを選んでDBに保存する機能・その値をアプリ全体に反映する仕組みは存在しない。`useColorMode()`の呼び出し箇所もアプリコード内にはまだない。

## Goals

- プロフィール画面にテーマ選択欄(ライト/ダーク/システム設定に合わせる、の3択)を追加する
- 選択は`users`テーブルに永続化し、どの端末からログインしても同じテーマが適用される
- 新規ユーザーのデフォルトはライトテーマ
- セレクトを変更した瞬間に画面のテーマが切り替わる(保存ボタンを押す前でもプレビューできる)
- ログイン中ユーザーがどのページを開いてもDBに保存されたテーマが適用される(プロフィール画面限定にしない)

## Non-Goals

- 未ログインユーザー(ログイン前の`/login`, `/account/create`等)向けのテーマ切り替えUI。未ログイン時は`system`扱い(`@nuxtjs/color-mode`のデフォルト動作に委ねる)
- テーマごとの配色・デザイントークンの新規作成。既存の`app.config.ts`の`ui.colors`定義とNuxt UIの標準ダークパレットをそのまま使う
- 複数タブ間のリアルタイム同期(片方のタブで変更してももう片方のタブは再読み込みまで反映されない。ブラウザの標準的な挙動に委ねる)

## Architecture

### `@nuxtjs/color-mode`はすでに有効(nuxt.config.tsの変更は不要)

調査の結果、`@nuxt/ui`のモジュール本体(`node_modules/@nuxt/ui/dist/module.mjs`)は`defaultOptions`で`colorMode: true`を持ち、setup内で`@nuxtjs/color-mode`を`classSuffix: ''`(`.dark`/`.light`クラスをそのまま`<html>`に付与、Tailwindの`dark:`バリアントと一致), `disableTransition: true`で自動的に`installModule`している。`assets/css/main.css`の`.dark { ... }`ブロック(47〜56行目)もこの前提で書かれている。

つまり**このプロジェクトは既に「OSのカラースキーム設定に追従してライト/ダークが自動切替される」状態が動いている**(`nuxt.config.ts`や`useColorMode()`呼び出しがアプリコードに一切なくても)。`@nuxtjs/color-mode`のデフォルトは`preference: 'system'`, `fallback: 'light'`, `storage: 'localStorage'`(Cookieではない)。

このdesignで新たに必要なのは、**ログイン中ユーザーに限り、この`preference`をDBに保存した値で上書きする**ことだけ。`nuxt.config.ts`の`modules`や`colorMode`オプションは一切変更しない(未ログイン時の`system`追従という既存の非ゴールとも整合する)。

`useColorMode()`はNuxtの自動importで(`@nuxtjs/color-mode`が提供する composable)どこからでも呼び出せる。`.preference`に`'light' | 'dark' | 'system'`をセットすることで画面のテーマが即座に切り替わり、同時に`localStorage`にも書き込まれる(モジュールの標準動作)。

### DBスキーマ変更

`server/utils/db.ts`の`SCHEMA`(新規DB作成用)に`theme`カラムを追加:

```sql
CREATE TABLE IF NOT EXISTS users (
  ...
  theme TEXT NOT NULL DEFAULT 'light',
  ...
);
```

既存DBへは`migrate()`関数に`is_admin`追加時(72〜90行目)と同じパターンでマイグレーションを追記する:

```ts
const hasTheme = db.prepare(`PRAGMA table_info(users)`).all().some((c) => c.name === 'theme')
if (!hasTheme) {
  db.exec(`ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'light'`)
}
```

値のとりうる範囲(`'light' | 'dark' | 'system'`)はアプリケーション層(zod)で保証する。DB側にCHECK制約は追加しない(既存の`gender`等の他カラムもCHECK制約なしで統一されているため、既存パターンに合わせる)。

### 型定義

`server/utils/session.ts`の`UserRow`インターフェースに追加:

```ts
export interface UserRow {
  ...
  theme: 'light' | 'dark' | 'system'
  ...
}
```

### API変更 (`server/api/user/profile.patch.ts`)

`bodySchema`に追加:

```ts
theme: z.enum(['light', 'dark', 'system'])
```

UPDATE文にも`theme = ?`を追加する。`server/api/user/me.get.ts`は既存カラムを返す実装なので変更不要(`theme`も自動的に含まれる)。

### プラグイン: アプリ起動時にDBの値を反映

新規ファイル `plugins/theme.client.ts`:

```ts
export default defineNuxtPlugin(async () => {
  const colorMode = useColorMode()
  const { data: user } = await useFetch('/api/user/me', { key: 'current-user' })
  if (user.value?.theme) {
    colorMode.preference = user.value.theme
  }
})
```

`key: 'current-user'`は`pages/profile.vue`の`useFetch('/api/user/me', { key: 'current-user' })`と同じキー。これによりNuxtのペイロードキャッシュが共有され、アプリ起動直後にこのプラグインが取得した結果をプロフィール画面がそのまま再利用できる(二重fetchを避ける)。

`.client.ts`サフィックスによりクライアント側のみで実行される(未ログイン時は`/api/user/me`が401を返し、`user.value`が`null`のままなので何もしない = `@nuxtjs/color-mode`のデフォルト`system`挙動が維持される)。このプラグインはSSR中には走らないため、ログイン中ユーザーがDBで`dark`を保存していても初回SSR描画はOS設定ベースで出て、ハイドレーション後にDBの値へ切り替わる一瞬のちらつきが起こり得る。これは許容する(Non-GoalsのSSR/複数タブ同期を作り込まない方針と同じ理由)。

これにより、プロフィール画面を開かなくても、ログイン直後から(別端末であっても)DBに保存されたテーマが全ページで適用される。

### `pages/profile.vue`の変更

**表示モード:** 他項目と同様に`<dt>`/`<dd>`でテーマ設定を表示(`t('profile.theme')`ラベル、値は`t('profile.themeLight' | 'profile.themeDark' | 'profile.themeSystem')`)。

**編集モード:**

```vue
<UFormField :label="t('profile.theme')" name="theme">
  <USelect v-model="formState.theme" :items="themeOptions" />
</UFormField>
```

```ts
const colorMode = useColorMode()

const themeOptions = computed(() => [
  { label: t('profile.themeLight'), value: 'light' },
  { label: t('profile.themeDark'), value: 'dark' },
  { label: t('profile.themeSystem'), value: 'system' }
])

watch(() => formState.value.theme, (value) => {
  colorMode.preference = value
})
```

`formState`の型に`theme: 'light' | 'dark' | 'system'`を追加。`startEdit()`(既存の編集モード開始時に`formState`を`user`の現在値で埋める関数)で`formState.value.theme = user.value.theme`をセットする。

`profileSchema`(zod)に`theme: z.enum(['light', 'dark', 'system'])`を追加。

**Cancel時の挙動:** `cancelEdit()`で`formState`をリセットするのと合わせて`colorMode.preference`も`user.value.theme`(保存済みの値)に戻す。即時プレビューで変えた画面テーマを、保存せず取り消した場合は元に戻すため。

### i18n辞書への追加

`utils/i18n/uiStrings.ts`の`UiStringKey`に追加:

```ts
| 'profile.theme'
| 'profile.themeLight'
| 'profile.themeDark'
| 'profile.themeSystem'
```

6言語(`en` / `ja` / `ko` / `zh-Hant` / `zh-Hans` / `pt`)すべての`UI_STRINGS`に値を追加する。型が`Record<TranslationLocale, Record<UiStringKey, string>>`のため、1つでも抜けるとコンパイルエラーになり漏れを防げる。

## Data Flow

1. セレクト変更 → `watch`で即座に`colorMode.preference`セット → 画面即時反映(未保存)
2. 「Save」押下 → 既存の`onSubmit`が`theme`を含めて`PATCH /api/user/profile`送信 → DB永続化 → `refresh()`で`user`再取得
3. 「Cancel」押下 → `colorMode.preference`を保存済みの値に戻す → 編集モード終了
4. 別端末でログイン → `plugins/theme.client.ts`が`/api/user/me`の`theme`を`colorMode.preference`にセット → 全ページに反映

## Error Handling

既存のプロフィール更新エラーハンドリング(zodバリデーション、409重複エラー、汎用エラー)にそのまま相乗りする。テーマ専用の追加エラー処理はない(不正な値はzod enumで弾かれる)。

`plugins/theme.client.ts`内の`useFetch('/api/user/me')`が失敗(未ログイン等)した場合も、`user.value`が`null`のままなので分岐で何もせず、エラーとして表面化させない。

## Testing

### DBマイグレーション

`server/utils/db.ts`の既存マイグレーションテスト(存在すれば)に、`theme`カラムが追加されデフォルト値が`'light'`になることの確認を追加。既存の`is_admin`マイグレーションテストと同じパターン。

### API

`server/api/user/profile.patch.ts`のテスト(存在すれば)に、`theme`を含むPATCHが正しくDBに反映されることの確認を追加。不正な値(`z.enum`に含まれない文字列)が400で弾かれることも確認。

### e2e (`tests/e2e/account-flow.test.ts`)

既存のプロフィール編集シナリオ([2026-08-22-profile-page-design.md](./2026-08-22-profile-page-design.md)で追加済み)に以下を追加:

- テーマセレクトで「Dark」を選択 → `<html>`要素(または`body`)に`dark`クラスが付与されることを確認(即時反映)
- 「Save」→ リロード → ダークテーマが維持されていることを確認

### ユニットテスト

`pages/profile.vue`自体は既存方針(トップレベル`await useFetch`を使うページはSuspense問題によりユニットテスト対象外、[2026-08-22-profile-page-design.md](./2026-08-22-profile-page-design.md)の「Testing」参照)を踏襲し、単体テストは作らない。

## Open Questions

なし(brainstormingセッション内で解消済み)
