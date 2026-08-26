# MAP PINS (v2) Design

## Context

`/map`ページ(2026-08-22 design)は現在地表示のみのv1で、「行きたい場所/行った場所」スポット機能はv2として別セッションでbrainstormする、と当時のdesignで明記されていた。本designはそのv2にあたるが、ブレインストーミングの結果、記事に紐づく「行きたい場所/行った場所」機能ではなく、**管理者がカテゴリ別に任意の場所へピンを1つずつ登録できる機能**として実装する(記事との紐付けは無し、独立したPOI(Point of Interest)データ)。

登録されたピンは`/map`ページを訪れる全ユーザー(未ログイン含む)に表示される。既存の`AsakusaMap.vue`(現在地表示用のLeaflet+MapLibreコンポーネント)を拡張し、ピン表示・座標ピック機能を追加する形で実装する。

## Goals

- 管理者専用ページ`/admin/map-pins`で、ピンを登録・編集・削除できる
- ピンには「名前」「説明」「カテゴリ(固定リストから選択)」「アイコン(用意したアイコンセットから選択)」「位置(地図クリックで指定)」を設定できる
- `/map`ページで、登録された全ピンが地図上に表示され、タップすると名前・カテゴリ・説明がポップアップ表示される(カテゴリ名は閲覧者のロケールに応じて多言語表示される)
- カテゴリ名は既存の`UI_STRINGS`/`CATEGORY_LABELS`と同様、6言語(ja/en/ko/zh-Hant/zh-Hans/pt)で表示される

## Non-Goals

- 一般ログインユーザーによるピン投稿(管理者のみが登録する)
- カテゴリの動的追加(固定6種のみ。将来増やす場合はコード修正が必要)
- ピン名・説明の多言語翻訳(単一言語で自由入力、記事本文以外の自由記述と同様ブラウザの自動翻訳に任せる方針を維持)
- `/map`側でのカテゴリ絞り込み・検索フィルタ(将来必要になれば別途design)
- 記事とピンの紐付け(「行きたい場所/行った場所」機能。将来必要になれば別途design)
- ピンへの画像添付
- 座標の数値手入力(地図クリックのみ)

## Architecture

### 新規ファイル

- `server/utils/mapPins.ts` — `map_pins`テーブルへのCRUD関数とバリデーション
- `server/utils/mapPins.test.ts`
- `server/api/map-pins/index.get.ts` — 公開一覧取得API
- `server/api/admin/map-pins/index.get.ts` — 管理者用一覧取得API
- `server/api/admin/map-pins/index.post.ts` — 新規登録API
- `server/api/admin/map-pins/[id].patch.ts` — 更新API
- `server/api/admin/map-pins/[id].delete.ts` — 削除API
- `utils/mapPins.ts` — `PIN_CATEGORIES`・`PIN_ICONS`・`MapPin`型など、クライアント/サーバー共有の定数・型
- `utils/i18n/mapPinCategoryLabels.ts` — カテゴリの6言語ラベル(`categoryLabels.ts`と同じ構造)
- `pages/admin/map-pins.vue` — ピン管理画面(登録/編集フォーム + 一覧 + 削除確認モーダル)

### 既存ファイルの変更

- `server/utils/db.ts` — `SCHEMA`に`map_pins`テーブルを追加
- `components/AsakusaMap.vue` — `pins`・`pickMode`propsと`pick`イベントを追加(詳細後述)
- `pages/map.vue` — `/api/map-pins`を`useFetch`し、`AsakusaMap`に`:pins`を渡す
- `components/AdminNav.vue` — `links`配列に`{ to: '/admin/map-pins', label: 'Map Pins' }`を追加

### データモデル

```sql
CREATE TABLE IF NOT EXISTS map_pins (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  icon TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  created_at TEXT NOT NULL
);
```

`server/utils/db.ts`の`migrate()`は既存テーブルへのカラム追加用なので、新規テーブルである`map_pins`は`SCHEMA`の`CREATE TABLE IF NOT EXISTS`に追加するだけでよく、`migrate()`の変更は不要。

### `utils/mapPins.ts` (クライアント/サーバー共有)

```ts
export const PIN_CATEGORIES = ['spot', 'restaurant', 'shopping', 'toilet', 'event', 'other'] as const
export type PinCategory = (typeof PIN_CATEGORIES)[number]

export const PIN_ICONS = [
  'lucide:map-pin',
  'lucide:landmark',
  'lucide:utensils',
  'lucide:coffee',
  'lucide:shopping-bag',
  'lucide:toilet',
  'lucide:ticket',
  'lucide:tent',
  'lucide:camera',
  'lucide:car',
  'lucide:train-front',
  'lucide:info'
] as const
export type PinIcon = (typeof PIN_ICONS)[number]

export interface MapPin {
  id: number
  name: string
  description: string
  category: PinCategory
  icon: PinIcon
  lat: number
  lng: number
  created_at: string
}
```

実装時に、`PIN_ICONS`各値が`@nuxt/icon`(lucideセット)で実在するアイコン名であることを確認する(dev環境で`UIcon`が404にならないか目視確認)。存在しないものがあれば同等の代替アイコン名に差し替える。

### `utils/i18n/mapPinCategoryLabels.ts`

`utils/i18n/categoryLabels.ts`と同じ構造で、`PIN_CATEGORIES`の6言語ラベルを定義する:

```ts
import type { TranslationLocale } from '../../server/utils/articles'
import type { PinCategory } from '../mapPins'

export const MAP_PIN_CATEGORY_LABELS: Record<TranslationLocale, Record<PinCategory, string>> = {
  en: { spot: 'Sightseeing Spot', restaurant: 'Restaurant', shopping: 'Shopping', toilet: 'Restroom', event: 'Event Venue', other: 'Other' },
  ja: { spot: '観光スポット', restaurant: '飲食店', shopping: 'ショッピング', toilet: 'トイレ', event: 'イベント会場', other: 'その他' },
  ko: { spot: '관광 명소', restaurant: '음식점', shopping: '쇼핑', toilet: '화장실', event: '이벤트 장소', other: '기타' },
  'zh-Hant': { spot: '觀光景點', restaurant: '餐飲店', shopping: '購物', toilet: '洗手間', event: '活動會場', other: '其他' },
  'zh-Hans': { spot: '观光景点', restaurant: '餐饮店', shopping: '购物', toilet: '洗手间', event: '活动场地', other: '其他' },
  pt: { spot: 'Ponto Turístico', restaurant: 'Restaurante', shopping: 'Compras', toilet: 'Banheiro', event: 'Local de Evento', other: 'Outro' }
}

export function mapPinCategoryLabelFor(locale: TranslationLocale, category: PinCategory): string {
  return MAP_PIN_CATEGORY_LABELS[locale][category]
}
```

管理画面(`pages/admin/map-pins.vue`)は他のadmin配下ページ(`admin/articles.vue`・`admin/sources.vue`)と同様、文言は英語固定で`useUiText()`を通さない。カテゴリ表示には`mapPinCategoryLabelFor('en', category)`を直接呼ぶ。公開`/map`ページ側(`AsakusaMap.vue`)は、既に取得済みの`locale`(`useArticleLocale()`)を使って`mapPinCategoryLabelFor(locale.value, category)`を直接呼ぶ。どちらも`useUiText()`への追加は不要(`mapPinCategoryLabelFor`を直接importして使う)。

### `server/utils/mapPins.ts`

```ts
import type Database from 'better-sqlite3'
import { createError } from 'h3'
import { PIN_CATEGORIES, PIN_ICONS, type MapPin } from '../../utils/mapPins'

export function listMapPins(db: Database.Database): MapPin[] {
  return db.prepare(`SELECT id, name, description, category, icon, lat, lng, created_at FROM map_pins ORDER BY id DESC`).all() as MapPin[]
}

export interface MapPinInput {
  name: string
  description: string
  category: string
  icon: string
  lat: number
  lng: number
}

function validateInput(input: MapPinInput): void {
  if (!input.name.trim()) throw createError({ statusCode: 400, message: 'name is required' })
  if (!(PIN_CATEGORIES as readonly string[]).includes(input.category)) {
    throw createError({ statusCode: 400, message: 'invalid category' })
  }
  if (!(PIN_ICONS as readonly string[]).includes(input.icon)) {
    throw createError({ statusCode: 400, message: 'invalid icon' })
  }
  if (typeof input.lat !== 'number' || input.lat < -90 || input.lat > 90) {
    throw createError({ statusCode: 400, message: 'invalid lat' })
  }
  if (typeof input.lng !== 'number' || input.lng < -180 || input.lng > 180) {
    throw createError({ statusCode: 400, message: 'invalid lng' })
  }
}

export function createMapPin(db: Database.Database, input: MapPinInput): MapPin {
  validateInput(input)
  const createdAt = new Date().toISOString()
  const result = db
    .prepare(`INSERT INTO map_pins (name, description, category, icon, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(input.name.trim(), input.description, input.category, input.icon, input.lat, input.lng, createdAt)
  return { id: Number(result.lastInsertRowid), ...input, name: input.name.trim(), created_at: createdAt } as MapPin
}

export function updateMapPin(db: Database.Database, id: number, input: MapPinInput): MapPin {
  validateInput(input)
  const existing = db.prepare(`SELECT id FROM map_pins WHERE id = ?`).get(id)
  if (!existing) throw createError({ statusCode: 404, message: 'pin not found' })
  db.prepare(`UPDATE map_pins SET name = ?, description = ?, category = ?, icon = ?, lat = ?, lng = ? WHERE id = ?`)
    .run(input.name.trim(), input.description, input.category, input.icon, input.lat, input.lng, id)
  return db.prepare(`SELECT id, name, description, category, icon, lat, lng, created_at FROM map_pins WHERE id = ?`).get(id) as MapPin
}

export function deleteMapPin(db: Database.Database, id: number): void {
  const existing = db.prepare(`SELECT id FROM map_pins WHERE id = ?`).get(id)
  if (!existing) throw createError({ statusCode: 404, message: 'pin not found' })
  db.prepare(`DELETE FROM map_pins WHERE id = ?`).run(id)
}
```

### API ハンドラ

`server/api/map-pins/index.get.ts`(公開、認証不要):

```ts
import { useDb } from '../../utils/db'
import { listMapPins } from '../../utils/mapPins'

export default defineEventHandler(() => {
  const db = useDb()
  return listMapPins(db)
})
```

`server/api/admin/map-pins/index.get.ts`・`index.post.ts`・`[id].patch.ts`・`[id].delete.ts`は、既存の`server/api/admin/sources/index.get.ts`・`server/api/admin/articles/[id].delete.ts`と同じパターンで、`requireAdminUser(db, event)`を先頭に呼んだ上でそれぞれ`listMapPins`/`createMapPin`/`updateMapPin`/`deleteMapPin`を呼ぶ。POST/PATCHは`readBody(event)`で受けたJSONをそのまま`MapPinInput`として渡す(型不一致は`validateInput`内のtypeof/範囲チェックで弾かれる)。

### `AsakusaMap.vue`の拡張

```ts
const props = defineProps<{
  pins?: MapPin[]
  pickMode?: boolean
  pickedLat?: number | null
  pickedLng?: number | null
}>()
const emit = defineEmits<{ pick: [lat: number, lng: number] }>()
```

- `pins`が渡された場合: `onMounted`後(および`watch(() => props.pins, ...)`で変更時)に、既存のピンマーカーを全て`removeLayer`してから`props.pins`の各要素をLeafletの`L.marker([pin.lat, pin.lng], { icon: L.divIcon({ html: iconSvgHtml, className: 'map-pin-marker' }) })`で配置し直す。各マーカーに`bindPopup`で`pin.name`・カテゴリラベル(`mapPinCategoryLabelFor(locale.value, pin.category)`、`AsakusaMap.vue`は既に`useArticleLocale()`から`locale`を取得済みなのでそれを再利用する)・`pin.description`(いずれもHTMLエスケープした上で)を表示する。Leafletの`divIcon`はVueのレンダーツリー外の生HTML文字列を要求するため`<UIcon>`はそのまま使えない。`iconSvgHtml`は`@iconify/vue`の`loadIcon(pin.icon)`(`onMounted`内で`await`)が返す`{ body, width, height }`から`<svg viewBox="0 0 ${width} ${height}">${body}</svg>`を組み立てて生成する
- `pickMode`が`true`の場合: `map.on('click', (e) => emit('pick', e.latlng.lat, e.latlng.lng))`を登録する。`pickedLat`/`pickedLng` propを`watch`し、変化したら仮マーカー(`L.marker`、ドラッグ不可)の位置を更新する。既存の現在地マーカーとは別のLeafletレイヤーとして管理する

### `pages/admin/map-pins.vue`

1ページ構成(モーダルは削除確認のみ、既存`pages/admin/articles.vue`の流儀に合わせる)。

```
<AdminNav />
<h1>Map Pin Management</h1>

<!-- 登録/編集フォーム -->
<UCard>
  <UInput v-model="form.name" placeholder="Pin name" />
  <UTextarea v-model="form.description" placeholder="Description" />
  <USelect v-model="form.category" :items="PIN_CATEGORIES.map(c => ({ label: mapPinCategoryLabelFor('en', c), value: c }))" />
  <!-- アイコングリッド: PIN_ICONS をボタン12個、選択中は ring 等でハイライト -->
  <div class="grid grid-cols-6 gap-2">
    <button v-for="icon in PIN_ICONS" :key="icon" @click="form.icon = icon" :class="{ selected: form.icon === icon }">
      <UIcon :name="icon" />
    </button>
  </div>
  <p v-if="form.lat !== null">Selected: {{ form.lat }}, {{ form.lng }}</p>
  <ClientOnly>
    <AsakusaMap pick-mode :picked-lat="form.lat" :picked-lng="form.lng" @pick="(lat, lng) => { form.lat = lat; form.lng = lng }" class="h-64" />
  </ClientOnly>
  <UButton @click="submit">{{ editingId ? 'Update' : 'Register' }}</UButton>
  <UButton v-if="editingId" variant="outline" @click="cancelEdit">Cancel</UButton>
</UCard>

<!-- 一覧 -->
<UCard v-for="pin in pins" :key="pin.id">
  <UIcon :name="pin.icon" /> {{ pin.name }} ({{ mapPinCategoryLabelFor('en', pin.category) }})
  <p>{{ pin.description }}</p>
  <UButton @click="startEdit(pin)">Edit</UButton>
  <UButton color="error" @click="requestDelete(pin.id)">Delete</UButton>
</UCard>

<!-- 削除確認モーダル: articles.vue と同じパターン -->
```

`startEdit(pin)`でフォームの各フィールド(`name`/`description`/`category`/`icon`/`lat`/`lng`)を選択ピンの値で埋め、`editingId`をセットする。ピッカー地図は`picked-lat`/`picked-lng` propの変化を検知して仮マーカー位置を更新する(前述のAsakusaMap拡張)。`submit()`は`editingId`が`null`なら`POST /api/admin/map-pins`、それ以外なら`PATCH /api/admin/map-pins/${editingId}`を呼び、完了後フォームをリセットして一覧を`refresh()`する。

送信時のバリデーション(name必須・icon未選択不可・座標未選択不可)はクライアント側でも簡易チェックし、送信ボタンを`disabled`にする(サーバー側の`validateInput`が最終防衛線)。

### `pages/map.vue`の変更

```ts
const { data: pins } = await useFetch('/api/map-pins')
```

```html
<AsakusaMap :pins="pins ?? []" />
```

## Testing

### ユニットテスト

- `server/utils/mapPins.test.ts`: `createMapPin`/`updateMapPin`/`deleteMapPin`/`listMapPins`の正常系、および不正な`category`/`icon`/`lat`/`lng`でエラーが投げられることを検証(`:memory:`DBを使う既存テストパターンに倣う)

### APIテスト

- 既存の`server/utils/admin.test.ts`のパターンに倣い、`server/api/admin/map-pins/*`エンドポイントが管理者以外のアクセスで403を返すことを確認するテストを追加する

### 手動確認

- devサーバーで`/admin/map-pins`から登録→`/map`で表示確認→`/admin/map-pins`で編集→座標・アイコン・カテゴリが反映されることを確認→削除して`/map`から消えることを確認
- 管理者権限を持たないユーザーで`/admin/map-pins`にアクセスし、一覧が表示されない(403相当のエラー表示になる)ことを確認
- `PIN_ICONS`の各アイコン名が実際にレンダリングされること(404にならないこと)を目視確認

## Open Questions

なし(brainstormingセッション内で解消済み)
