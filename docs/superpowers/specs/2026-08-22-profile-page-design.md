# プロフィールページ Design

## Context

`pages/profile.vue`は現在、アバター表示・作り直し・ログアウトのみのベタな未スタイルページ。一方でバックエンド`PATCH /api/user/profile`(`server/api/user/profile.patch.ts`)はユーザー名・性別・生まれ年・国籍の編集をすでにサポートしているが、対応するUIが存在しない。

このdesignは、`pages/profile.vue`をブランドデザイン(ASAKUSA RED / WASHI / INK BLACK ほか)に沿った閲覧・編集両対応のフル機能ページとして構築する範囲を定める。

サイトの想定読者は英語圏の旅行者(project memory: `project_target_audience`)。このページで新規に書く文言はすべて英語にする。既存のヘッダー(`layouts/default.vue`)にある「プロフィール / ログアウト / ログイン」ラベルも、このページへの導線であり読者向けUIであるため、本designの範囲内で英語(`Profile` / `Log out` / `Log in`)に統一する。

## Goals

- ログイン中のユーザーが自分のプロフィール情報(ユーザー名・性別・生まれ年・国籍・ウォレットアドレス・登録日)を閲覧できる
- 既存の`PATCH /api/user/profile`に対応する編集フォームを提供する(ユーザー名・性別・生まれ年・国籍)
- 既存のアバター再生成・ログアウト機能を維持しつつ、ブランドデザインに沿ったUIにする
- 未ログインでこのページにアクセスした場合、`/login`にリダイレクトする(現状は空白ページになるエッジケースの修正)

## Non-Goals

- アカウント作成フロー(`pages/account/create.vue` / `pages/account/import.vue`)の文言・スタイルの変更
- ウォレットアドレスの送金・トランザクション関連機能
- 管理者向け機能(`pages/admin/`)との連携
- 国名リスト以外の新規共通コンポーネント抽出(このページ専用の実装に留める)

## Architecture

### 新規ファイル: `utils/countries.ts`

ISO 3166-1 alpha-2の国コード一覧を静的データとしてエクスポートする。

```ts
export interface Country {
  code: string // ISO 3166-1 alpha-2 (e.g. 'JP')
  name: string // English name (e.g. 'Japan')
}

export const COUNTRIES: Country[]
```

サーバーに依存しないクライアント専用の静的データ。`server/api/user/profile.patch.ts`の`nationality: z.string().length(2)`とは独立しており、コード側で整合性を取る(フォームの`USelectMenu`はこのリストの`code`のみを値として送信するため、長さ2は自動的に満たされる)。

### `pages/profile.vue`の書き直し

**データ取得:**
```ts
const { data: user, refresh, error } = await useFetch('/api/user/me')

if (error.value) {
  await navigateTo('/login')
}
```

**閲覧モード(デフォルト、`mode === 'view'`):**
- `UCard`内に以下を表示:
  - `UserAvatar`(既存コンポーネント、seedは`user.avatar_seed`)+ 「Regenerate avatar」ボタン(既存の`POST /api/user/avatar/regenerate`を叩いて`refresh()`)
  - Username
  - Joined: `created_at`を`YYYY-MM-DD`程度に整形して表示
  - Gender / Birth Year / Nationality: 値が`null`の場合は「Not set」と表示。Genderは`null`と`'unspecified'`のどちらも「Not set」として表示する(DBのNULLは「未回答」、`'unspecified'`は「あえて回答しない」を表すが、閲覧表示上は区別しない)。Nationalityは保存されている2文字コードを`utils/countries.ts`で国名に変換して表示(未知のコードの場合はコードそのまま表示にフォールバック)
  - Wallet address: `user.address`の先頭6文字+`...`+末尾4文字で中略表示。`title`属性にフルアドレスを設定(hoverで確認可能)。等幅フォント(`font-mono`)
  - 「Edit profile」ボタン(`mode = 'edit'`に切り替え、フォームの初期値を現在のuser値で埋める)
  - 「Log out」ボタン(既存の`POST /api/auth/logout` → `navigateTo('/login')`)

**編集モード(`mode === 'edit'`):**
- `UForm`(`:schema="profileSchema"` `:state="formState"` `@submit="onSubmit"`)
  - Username: `UInput`
  - Gender: `USelect`(options: `[{label: 'Male', value: 'male'}, {label: 'Female', value: 'female'}, {label: 'Other', value: 'other'}, {label: 'Prefer not to say', value: 'unspecified'}]`)
  - Birth Year: `UInputNumber`
  - Nationality: `USelectMenu`(`utils/countries.ts`の`COUNTRIES`を`searchable`な選択肢にする。`value-key="code"` `label-key="name"`)
  - 「Save」ボタン(`type="submit"`、送信中は`loading`)
  - 「Cancel」ボタン(`formState`を`user`の現在値にリセットし`mode = 'view'`に戻る。確認ダイアログは出さない)

### クライアント側バリデーション

`server/api/user/profile.patch.ts`のzodスキーマと同じ制約をクライアント側にも定義する(サーバー側の`bodySchema`をそのままインポートすることはできない — サーバー専用モジュールのため — が、同一の制約をpages/profile.vue内で再定義する):

```ts
const profileSchema = z.object({
  userName: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/, 'Use 3-32 letters, numbers, _ or -'),
  gender: z.enum(['male', 'female', 'other', 'unspecified']),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable(),
  nationality: z.string().length(2).nullable()
})
```

`gender`はclient側では常に4値enumのいずれかを持つ(nullを許容しない)。編集モードに入る際、`user.gender`が`null`なら`formState.gender`は`'unspecified'`で初期化する。これによりフォーム上は常に有効な選択肢が選ばれた状態になり、送信時も`'unspecified'`という具体的な値がサーバーに送られる(サーバー側は`null`も許容するが、クライアントからは送らない)。

`UForm`が`schema`に対してブラウザ側で自動検証し、`UFormField`が対応するエラーメッセージを表示する。

### 送信・エラー処理

```ts
async function onSubmit(event: FormSubmitEvent<typeof profileSchema>) {
  saving.value = true
  try {
    await $fetch('/api/user/profile', { method: 'PATCH', body: event.data })
    await refresh()
    mode.value = 'view'
  } catch (e) {
    if (e?.statusCode === 409) {
      submitError.value = 'This username is already taken.'
    } else {
      submitError.value = 'Something went wrong. Please try again.'
    }
  } finally {
    saving.value = false
  }
}
```

`submitError`はフォーム上部(またはUsernameフィールド直下)にテキストで表示する。

### `layouts/default.vue`の文言変更

`userMenuItems`のラベルを英語化する:
- 「プロフィール」→「Profile」
- 「ログアウト」→「Log out」
- 「ログイン」リンク → 「Log in」

ロジック(`logout`関数、`useFetch`呼び出し等)は変更しない。

## Testing

### ユニットテストは作らない(既存方針を踏襲)

`pages/profile.vue`は他の全ページ(`pages/index.vue`, `pages/articles/[id].vue`, 元の`pages/profile.vue`)と同様、トップレベルで`await useFetch(...)`を使う。Nuxtの実行時は`<NuxtPage>`が内部で`Suspense`しているため問題なく動くが、`@vue/test-utils`の素の`mount()`は`Suspense`を提供しないため、async setupを持つコンポーネントは同期的に`mount()`しても描画されない(空のまま)ことを実機検証で確認済み。このコードベースに`pages/*.test.ts`が一つも存在しないのはこれが理由であり、この既存方針を踏襲して`pages/profile.vue`の単体テストは作らない。

(`layouts/default.vue`は`useFetch`を`await`せずに使っており、これは既存の`layouts/default.test.ts`が同期`mount()`で動くようにするための意図的な選択。ページとレイアウトでこの非同期パターンが異なる点に注意。)

### e2eテスト: `tests/e2e/account-flow.test.ts`で全体を検証する

- 閲覧モードの表示項目(Joined日付、Gender/Birth Year/Nationalityの値と「Not set」表示、中略したウォレットアドレス)
- 「Edit profile」→フォーム表示→値変更→「Save」→閲覧モードに戻り変更が反映されている
- 「Cancel」で変更を破棄して閲覧モードに戻る
- 重複ユーザー名での保存が失敗し、エラーメッセージが表示される

### ユニットテスト: `layouts/default.test.ts`(更新)

既存のテスト内アサーションを日本語ラベル(「プロフィール」「ログアウト」「ログイン」)から英語ラベル(「Profile」「Log out」「Log in」)に更新する。

### e2eテスト: `tests/e2e/account-flow.test.ts`(更新)

既存シナリオ内の`text=ログアウト`クリックを`text=Log out`に更新。加えて、プロフィール編集の新規シナリオを追加:
- アカウント作成→`/profile`到達後、「Edit profile」クリック→Usernameを変更→「Save」→変更後の値が閲覧モードに反映されていることを確認

## Open Questions

なし(brainstormingセッション内で解消済み)
