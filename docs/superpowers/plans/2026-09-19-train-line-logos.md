# 交通情報カード 路線ロゴ・公式リンク追加 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `TrainStatusCard.vue`を「路線ごとに1行(ロゴ+路線名+状態)」の表示に作り直し、異常表示の行には各社の公式運行情報ページへのリンクを付け、ODPTデータの出典表示を追加する。

**Architecture:** サーバー側(`server/utils/trainStatus.ts`・`/api/train-status`)は変更しない。ロゴ画像は`public/train-logos/`の静的ファイル(東京メトロ公式JPG→四隅透明PNG、都営公式PDF→ガイド線なしSVG)。`lineId`ごとのロゴパス・公式URLは新規の`utils/trainLineMeta.ts`(純粋なデータ)に持ち、`TrainStatusCard.vue`がそれを引いて描画する。

**Tech Stack:** Nuxt 3、Vue 3(`<script setup>`)、`@nuxt/ui`(`UCard`)、TypeScript、Vitest + `@vue/test-utils`(happy-dom)、Python 3 + Pillow(画像加工)、`pdftocairo`(poppler-utils)、Playwright(目視確認用、既にインストール済み)。

## Global Constraints

- **gitコマンドは実行しない**(`CLAUDE.md`)。各タスク末尾の「コミット」は人間が行う。エージェントは提案メッセージを提示するだけ。
- 回答・コメント・設計書は日本語。既存のコードのスタイル(インデント2スペース、シングルクォート、セミコロンなし)に合わせる。
- 参照設計書: `docs/superpowers/specs/2026-09-19-train-line-logos-design.md`。既存の`docs/superpowers/specs/2026-08-16-train-status-widget-design.md`の方針(サーバー側でのみODPTに通信、i18nは6言語(ja/en/ko/zh-Hant/zh-Hans/pt)、路線名`lineName`は英語固定)は引き続き有効。
- ロゴ画像は**加工しない**。許される加工は「周辺部分を透明にする」「縦横等倍の拡縮(トリミングを含む)」のみ。配色・形・文字は変えない(東京メトロ「画像データ利用条件」)。東京メトロと提携・協賛していると誤認される表示をしない。
- 東京メトロ画像の入手には`.env`の`ODPT_API_KEY`が必要。**キーの値を出力・ログ・ファイルに残さない**(コマンドは`$ODPT_API_KEY`を環境変数展開で使うだけにする)。
- TX(つくばエクスプレス)はMIRの使用承認を得るまで**ロゴ画像を置かない・自作バッジも作らない**。ロゴの位置には装飾なしの文字「TX」を置く。
- 外部リンクは`<a target="_blank" rel="noopener noreferrer">`の通常リンクのみ。iframe等で他社ページを表示しない(東京メトロ利用規約で禁止)。
- 単体テストの実行コマンド: `npx vitest run components composables utils server/utils layouts`。実装前のベースラインは**33ファイル・220テスト全部PASS**。`npx vitest run`(全体)は`tests/e2e`・`tests/api`がNuxtサーバー起動のタイムアウトで既存の失敗をするため(2026-09-19時点で7ファイル失敗、今回の変更とは無関係)、合否は上記の単体テストで判断する。

## File Structure

| ファイル | 役割 | 種別 |
|---|---|---|
| `public/train-logos/ginza.png`・`hibiya.png` | 東京メトロ公式路線シンボル(四隅透明、120×120) | 新規 |
| `public/train-logos/asakusa.svg`・`oedo.svg` | 都営公式路線シンボル(ベクター) | 新規 |
| `utils/trainLineMeta.ts` | `lineId` → ロゴパス・代替ラベル・公式運行情報URL の対応表(データのみ) | 新規 |
| `utils/trainLineMeta.test.ts` | 対応表の整合(ロゴファイルの実在・URLのドメイン)の検証 | 新規 |
| `utils/i18n/uiStrings.ts` | `train.statusNormal`・`train.viewOfficial`追加、`train.allNormal`・`train.lineStatus`削除 | 変更 |
| `composables/useUiText.test.ts` | 新キーのテスト追加、旧キーのテスト削除 | 変更 |
| `components/TrainStatusCard.vue` | 路線ごと1行の表示・公式リンク・出典表示 | 作り直し |
| `components/TrainStatusCard.test.ts` | 上記のテスト | 作り直し |
| `docs/superpowers/specs/2026-09-19-train-line-logos-design.md` | 実装に合わせた記述の修正(Task 5) | 変更 |
| `docs/superpowers/specs/2026-08-16-train-status-widget-design.md` | 旧「表示ロジック」が置き換わった旨の注記(Task 5) | 変更 |

---

### Task 1: ロゴ素材を作って`public/train-logos/`に置く

**Files:**
- Create: `public/train-logos/ginza.png`、`public/train-logos/hibiya.png`、`public/train-logos/asakusa.svg`、`public/train-logos/oedo.svg`

**Interfaces:**
- Produces: 上記4ファイル。配信URLは`/train-logos/ginza.png`・`/train-logos/hibiya.png`・`/train-logos/asakusa.svg`・`/train-logos/oedo.svg`(Task 2の`trainLineMeta.ts`がこのパスを参照する)。

- [ ] **Step 1: 作業用ディレクトリを作り、元データを取得する**

プロジェクトのルート(`/home/masa/iDesktop/asakusatoday`)で実行する。`WORK`は各コマンドの先頭で定義し直す(シェルの状態は引き継がれないため)。

```bash
WORK="${TMPDIR:-/tmp}/train-logos-work"
mkdir -p "$WORK" && cd "$WORK"
set -a; . /home/masa/iDesktop/asakusatoday/.env; set +a

# 東京メトロ(要ODPT_API_KEY): 駅ナンバリング画像+路線シンボルのZIP
curl -sSL -m 60 -o metro.zip -w "metro HTTP %{http_code} %{size_download}B\n" \
  "https://api.odpt.org/api/v4/files/TokyoMetro/Image/TokyoMetroStationNumberLineSymbol.zip?acl:consumerKey=$ODPT_API_KEY"

# 都営(公開URL、キー不要): 路線シンボルデータPDF
curl -sSL -m 60 -o toei_symbol.pdf -w "toei HTTP %{http_code} %{size_download}B\n" \
  "https://api-public.odpt.org/api/v4/files/Toei/Image/odpt_Image-Toei_%E9%83%BD%E5%96%B6%E5%9C%B0%E4%B8%8B%E9%89%84_%E8%B7%AF%E7%B7%9A%E3%82%B7%E3%83%B3%E3%83%9C%E3%83%AB%E3%83%87%E3%83%BC%E3%82%BF.pdf"

unzip -oq metro.zip && mkdir -p metro_ls && (cd metro_ls && unzip -oq ../LineSymbol.zip) && ls metro_ls
```

Expected: `metro HTTP 200 ...B`、`toei HTTP 200 ...B`、`ls metro_ls`に`G.jpg`・`H.jpg`を含むJPG群(`C F G H M N T Y Z`)が並ぶ。

- [ ] **Step 2: 東京メトロの利用条件PDFを読み直す(念のための再確認)**

```bash
cd "${TMPDIR:-/tmp}/train-logos-work" && pdftotext -layout "東京メトロ画像データ利用条件.pdf" - | sed -n 1,40p
```

Expected: 「変形、回転等させないで使用」「配色を変更しない」「周辺部分を透明にしたもの」が認められる加工例に挙がっている旨、「東京メトログループが協賛又は協力していると誤認される使用」の禁止が読める。**条件が変わっていたら、実装を止めて人間に報告する。**

- [ ] **Step 3: 東京メトロ`G.jpg`・`H.jpg`を四隅透明の120×120 PNGにする**

JPGは円の外側が白い正方形。円の外を透明にし(規約が認める「周辺を透明にする」加工)、円にぴったり120×120でトリミングする(形・色は変えない)。

```bash
cd "${TMPDIR:-/tmp}/train-logos-work" && mkdir -p out && python3 - <<'EOF'
from PIL import Image, ImageDraw

for code, name in (('G', 'ginza'), ('H', 'hibiya')):
    im = Image.open(f'metro_ls/{code}.jpg').convert('RGB')
    w, h = im.size
    # 白でないピクセルの外接矩形から円の中心と半径を求める
    gray = im.convert('L').point(lambda v: 255 if v < 235 else 0)
    bb = gray.getbbox()
    cx, cy = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
    r = min(bb[2] - bb[0], bb[3] - bb[1]) / 2
    # 円形マスク(8倍で描いて縮小し、縁をなめらかにする。半径は0.5px内側にして白い縁を出さない)
    S = 8
    mask = Image.new('L', (w * S, h * S), 0)
    ImageDraw.Draw(mask).ellipse(
        [(cx - r + 0.5) * S, (cy - r + 0.5) * S, (cx + r - 0.5) * S, (cy + r - 0.5) * S], fill=255)
    mask = mask.resize((w, h), Image.LANCZOS)
    out = im.convert('RGBA')
    out.putalpha(mask)
    # 円にぴったり120x120でトリミング
    left, top = round(cx - 60), round(cy - 60)
    out = out.crop((left, top, left + 120, top + 120))
    assert out.size == (120, 120), out.size
    assert out.getpixel((0, 0))[3] == 0, 'corner must be transparent'
    assert out.getpixel((60, 60))[3] == 255, 'center must be opaque'
    out.save(f'out/{name}.png', optimize=True)
    print(name, 'ok', out.size)
EOF
ls -la out
```

Expected: `ginza ok (120, 120)`、`hibiya ok (120, 120)`。`out/`に`ginza.png`・`hibiya.png`ができる。`AssertionError`が出たら、`bb`(外接矩形)の値を`print`して確認する。

- [ ] **Step 4: 都営PDFからA(浅草線)・E(大江戸線)のSVGを作る**

PDFをSVG化し、円(赤/マゼンタのリング)と文字(A/E)の2つのパスだけを取り出す。PDFには制作用の点線ガイドが重なっているため、必要なパスだけを選べばガイド線は入らない。リングの中央は透明の穴で、文字の色(黒)がダークモードで見えなくなるため、穴の大きさの白い円を背面に敷く(公式シンボルは中央が白)。

```bash
cd "${TMPDIR:-/tmp}/train-logos-work" && pdftocairo -svg -f 1 -l 1 toei_symbol.pdf toei_full.svg && python3 - <<'EOF'
import math
import re

s = open('toei_full.svg', encoding='utf-8').read()
body = s[s.index('</defs>') + 7:]
els = re.findall(r'<path\b[^>]*?/>', body)


def coords(t):
    m = re.search(r' d="([^"]*)"', t)
    return [float(x) for x in re.findall(r'-?\d+\.?\d*', m.group(1))] if m else []


def bbox(t):
    if 'transform' in t:  # ガイド線などは transform 付き。除外する
        return None
    n = coords(t)
    if not n:
        return None
    xs, ys = n[0::2], n[1::2]
    return (min(xs), min(ys), max(xs), max(ys))


# 右列の路線シンボル(円)の上端y座標(pt)。A=浅草線, E=大江戸線
TARGETS = {'asakusa': 743.6, 'oedo': 985.5}

for name, y0 in TARGETS.items():
    circle = None
    for t in els:
        b = bbox(t)
        if b and 55 < b[2] - b[0] < 68 and abs(b[1] - y0) < 0.3 and 1140 < b[0] < 1160:
            circle = (t, b)
    assert circle, f'{name}: circle path not found'
    cb = circle[1]
    letters = []
    for t in els:
        b = bbox(t)
        if b and t is not circle[0] and b[0] > cb[0] and b[1] > cb[1] and b[2] < cb[2] and b[3] < cb[3]:
            letters.append(t)
    assert len(letters) == 1, f'{name}: expected 1 letter path, got {len(letters)}'

    cx, cy = (cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2
    d = re.search(r' d="([^"]*)"', circle[0]).group(1)
    subpaths = [x for x in d.split('M ') if x.strip()]
    assert len(subpaths) == 2, f'{name}: expected ring with a hole (2 subpaths)'
    hole = [float(v) for v in re.findall(r'-?\d+\.?\d*', subpaths[1])]
    hole_r = math.hypot(hole[0] - cx, hole[1] - cy)

    vb = f'{cb[0]:.3f} {cb[1]:.3f} {cb[2] - cb[0]:.3f} {cb[3] - cb[1]:.3f}'
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="128" height="128">',
        f'<circle cx="{cx:.3f}" cy="{cy:.3f}" r="{hole_r + 0.3:.3f}" fill="#fff"/>',
        circle[0],
        letters[0],
        '</svg>',
    ]
    open(f'out/{name}.svg', 'w', encoding='utf-8').write('\n'.join(parts))
    print(name, 'ok', 'hole_r', round(hole_r, 2))
EOF
ls -la out
```

Expected: `asakusa ok hole_r 17.04`、`oedo ok hole_r 17.04`。`out/asakusa.svg`・`out/oedo.svg`が各1〜2KB程度。`AssertionError`が出たら、PDFの版が変わった可能性がある。その場合は止めて人間に報告する。

- [ ] **Step 5: `public/train-logos/`に置く**

```bash
mkdir -p /home/masa/iDesktop/asakusatoday/public/train-logos
cp "${TMPDIR:-/tmp}/train-logos-work/out/"{ginza.png,hibiya.png,asakusa.svg,oedo.svg} /home/masa/iDesktop/asakusatoday/public/train-logos/
ls -la /home/masa/iDesktop/asakusatoday/public/train-logos
```

Expected: 4ファイル(`ginza.png`・`hibiya.png`・`asakusa.svg`・`oedo.svg`)が並ぶ。

- [ ] **Step 6: 目視確認(ライト背景・ダーク背景、小・大)**

```bash
cd /home/masa/iDesktop/asakusatoday && cat > "${TMPDIR:-/tmp}/train-logos-work/preview.html" <<'EOF'
<html><body style="margin:0;font:12px sans-serif"><div style="display:flex">
<div style="background:#fff;padding:16px;display:flex;gap:16px;align-items:center">
 <img src="file:///home/masa/iDesktop/asakusatoday/public/train-logos/ginza.png" width="28"><img src="file:///home/masa/iDesktop/asakusatoday/public/train-logos/hibiya.png" width="28"><img src="file:///home/masa/iDesktop/asakusatoday/public/train-logos/asakusa.svg" width="28"><img src="file:///home/masa/iDesktop/asakusatoday/public/train-logos/oedo.svg" width="28">
 <img src="file:///home/masa/iDesktop/asakusatoday/public/train-logos/ginza.png" width="96"><img src="file:///home/masa/iDesktop/asakusatoday/public/train-logos/hibiya.png" width="96"><img src="file:///home/masa/iDesktop/asakusatoday/public/train-logos/asakusa.svg" width="96"><img src="file:///home/masa/iDesktop/asakusatoday/public/train-logos/oedo.svg" width="96">
</div>
<div style="background:#18181b;padding:16px;display:flex;gap:16px;align-items:center">
 <img src="file:///home/masa/iDesktop/asakusatoday/public/train-logos/ginza.png" width="28"><img src="file:///home/masa/iDesktop/asakusatoday/public/train-logos/hibiya.png" width="28"><img src="file:///home/masa/iDesktop/asakusatoday/public/train-logos/asakusa.svg" width="28"><img src="file:///home/masa/iDesktop/asakusatoday/public/train-logos/oedo.svg" width="28">
 <img src="file:///home/masa/iDesktop/asakusatoday/public/train-logos/ginza.png" width="96"><img src="file:///home/masa/iDesktop/asakusatoday/public/train-logos/hibiya.png" width="96"><img src="file:///home/masa/iDesktop/asakusatoday/public/train-logos/asakusa.svg" width="96"><img src="file:///home/masa/iDesktop/asakusatoday/public/train-logos/oedo.svg" width="96">
</div></div></body></html>
EOF
WORK="${TMPDIR:-/tmp}/train-logos-work" node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1300, height: 170 }, deviceScaleFactor: 2 });
  await p.goto('file://' + process.env.WORK + '/preview.html');
  await p.screenshot({ path: process.env.WORK + '/preview.png' });
  await b.close(); console.log('saved', process.env.WORK + '/preview.png');
})().catch(e => { console.error(e.message); process.exit(1) })"
```

Expected: `saved .../train-logos-work/preview.png`。`preview.png`を開いて(Readツール等)確認する:
- 銀座線(オレンジの「G」)・日比谷線(ベージュ系の「H」)・浅草線(赤の「A」)・大江戸線(マゼンタの「E」)の4つの円。
- **ライト背景・ダーク背景のどちらでも、円の外側に白い四角の角が見えない**。
- 浅草線・大江戸線に**点線(ガイド線)が横切っていない**。中央が白く、黒い文字が読める。
- 日比谷線の色が規定色(`#B5B5AC`)より暖色に見えるのは正常。元JPGの色そのもの(規定色の`#B5B5AC`等は「駅ナンバリングマーク」用の指定)で、配色は加工しない。

画像が表示されない場合は、`preview.html`内の`file://`パスが実在するか(`ls public/train-logos`)を確認する。

- [ ] **Step 7: コミット(人間が実行)**

git操作は人間が行う。提案メッセージ:

```
feat: add official line symbol logos for Tokyo Metro and Toei lines
```

---

### Task 2: `utils/trainLineMeta.ts` — ロゴパス・公式URLの対応表

**Files:**
- Create: `utils/trainLineMeta.ts`
- Test: `utils/trainLineMeta.test.ts`

**Interfaces:**
- Consumes: `TrainLineStatus['lineId']`(`server/utils/trainStatus.ts`の`'ginza' | 'hibiya' | 'asakusa' | 'oedo' | 'tx'`)、Task 1の`public/train-logos/*`。
- Produces:
  - `export interface TrainLineMeta { logo: string | null; fallbackLabel: string; officialUrl: string }`
  - `export const TRAIN_LINE_META: Record<TrainLineStatus['lineId'], TrainLineMeta>`
  - `logo`はサイトルートからのパス(`/train-logos/...`)。ロゴが無い路線は`null`。`fallbackLabel`は`logo`が`null`のときにロゴの場所に出す文字。

- [ ] **Step 1: 失敗するテストを書く**

`utils/trainLineMeta.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { TRAIN_LINE_META } from './trainLineMeta'

const LINE_IDS = ['ginza', 'hibiya', 'asakusa', 'oedo', 'tx'] as const

const OFFICIAL_HOSTS: Record<(typeof LINE_IDS)[number], string> = {
  ginza: 'www.tokyometro.jp',
  hibiya: 'www.tokyometro.jp',
  asakusa: 'www.kotsu.metro.tokyo.jp',
  oedo: 'www.kotsu.metro.tokyo.jp',
  tx: 'www.mir.co.jp'
}

describe('TRAIN_LINE_META', () => {
  it('has an entry for every line id', () => {
    expect(Object.keys(TRAIN_LINE_META).sort()).toEqual([...LINE_IDS].sort())
  })

  it('points every logo at an existing file under public/', () => {
    for (const id of LINE_IDS) {
      const logo = TRAIN_LINE_META[id].logo
      if (logo === null) continue
      expect(logo.startsWith('/train-logos/'), `${id}: ${logo}`).toBe(true)
      expect(existsSync(join(process.cwd(), 'public', logo)), `${id}: ${logo} is missing`).toBe(true)
    }
  })

  it('uses the operator official https domain for every official link', () => {
    for (const id of LINE_IDS) {
      const url = new URL(TRAIN_LINE_META[id].officialUrl)
      expect(url.protocol, id).toBe('https:')
      expect(url.hostname, id).toBe(OFFICIAL_HOSTS[id])
    }
  })

  it('gives every line a non-empty fallback label', () => {
    for (const id of LINE_IDS) {
      expect(TRAIN_LINE_META[id].fallbackLabel.length, id).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run utils/trainLineMeta.test.ts`
Expected: FAIL(`Failed to resolve import "./trainLineMeta"`)

- [ ] **Step 3: 最小の実装を書く**

`utils/trainLineMeta.ts`:

```ts
import type { TrainLineStatus } from '../server/utils/trainStatus'

export interface TrainLineMeta {
  // サイトルートからのロゴ画像パス。ロゴを使えない路線は null
  logo: string | null
  // logo が null のとき、ロゴの位置に出す装飾なしの文字
  fallbackLabel: string
  // 遅延等を表示しているときに飛ばす、各社公式の運行情報ページ
  officialUrl: string
}

export const TRAIN_LINE_META: Record<TrainLineStatus['lineId'], TrainLineMeta> = {
  ginza: {
    logo: '/train-logos/ginza.png',
    fallbackLabel: 'G',
    officialUrl: 'https://www.tokyometro.jp/unkou/history/ginza.html'
  },
  hibiya: {
    logo: '/train-logos/hibiya.png',
    fallbackLabel: 'H',
    officialUrl: 'https://www.tokyometro.jp/unkou/history/hibiya.html'
  },
  asakusa: {
    logo: '/train-logos/asakusa.svg',
    fallbackLabel: 'A',
    officialUrl: 'https://www.kotsu.metro.tokyo.jp/subway/schedule/asakusa.html'
  },
  oedo: {
    logo: '/train-logos/oedo.svg',
    fallbackLabel: 'E',
    officialUrl: 'https://www.kotsu.metro.tokyo.jp/subway/schedule/oedo.html'
  },
  // TXロゴはMIRの使用承認を得るまで置かない(設計書「後続作業」参照)。承認後は logo を追加する
  tx: {
    logo: null,
    fallbackLabel: 'TX',
    officialUrl: 'https://www.mir.co.jp/info/'
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run utils/trainLineMeta.test.ts`
Expected: PASS(4 tests)

- [ ] **Step 5: コミット(人間が実行)**

提案メッセージ:

```
feat: add train line meta (logo paths and official status page URLs)
```

---

### Task 3: i18n — `train.statusNormal`・`train.viewOfficial`を6言語に追加

旧キー(`train.allNormal`・`train.lineStatus`)はTask 4で削除する(Task 3の時点では旧コンポーネントがまだ使っているため、ここでは**追加のみ**)。

**Files:**
- Modify: `utils/i18n/uiStrings.ts`(型`UiStringKey`と6言語ブロック)
- Test: `composables/useUiText.test.ts`

**Interfaces:**
- Produces: `UiStringKey`に`'train.statusNormal'`・`'train.viewOfficial'`を追加。`useUiText().t('train.statusNormal')`・`t('train.viewOfficial')`が6言語で文字列を返す。

- [ ] **Step 1: 失敗するテストを書く**

`composables/useUiText.test.ts`の先頭の`import`群に`UI_STRINGS`のimportを追加する(既存の`import { ref } from 'vue'`の下):

```ts
import { UI_STRINGS } from '../utils/i18n/uiStrings'
```

`it('returns train status strings for en and ja', ...)`の直後に、次のテストを追加する:

```ts
  it('returns the normal-status and official-link strings for en and ja', async () => {
    const { useArticleLocale } = await import('./useArticleLocale')
    vi.stubGlobal('useArticleLocale', useArticleLocale)
    const { useUiText } = await import('./useUiText')

    const { setLocale } = useArticleLocale()
    const { t } = useUiText()
    expect(t('train.statusNormal')).toBe('Normal')
    expect(t('train.viewOfficial')).toBe('Check official site')

    setLocale('ja')
    expect(t('train.statusNormal')).toBe('平常')
    expect(t('train.viewOfficial')).toBe('公式サイトで確認')
  })

  it('defines the normal-status and official-link strings for every locale', () => {
    for (const [locale, strings] of Object.entries(UI_STRINGS)) {
      expect(strings['train.statusNormal'], locale).toBeTruthy()
      expect(strings['train.viewOfficial'], locale).toBeTruthy()
    }
  })
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run composables/useUiText.test.ts`
Expected: FAIL(新しい2つのテストが失敗。`t('train.statusNormal')`が`undefined`、`strings['train.statusNormal']`が`undefined`)

- [ ] **Step 3: 型とすべての言語ブロックに新キーを追加する**

`utils/i18n/uiStrings.ts`の`UiStringKey`で、`'train.statusDisrupted'`の行の直後に2行追加する:

```ts
  | 'train.statusDisrupted'
  | 'train.statusNormal'
  | 'train.viewOfficial'
```

次に、6つの言語ブロックそれぞれで、`'train.statusDisrupted': ...,`の行の直後に下表の2行を追加する(各ブロックの`train.*`は「en」127行目付近、「ja」191行目付近…にある。`'train.statusDisrupted'`で検索すると6箇所ヒットする):

| ロケール | 追加する2行 |
|---|---|
| `en` | `'train.statusNormal': 'Normal',` / `'train.viewOfficial': 'Check official site',` |
| `ja` | `'train.statusNormal': '平常',` / `'train.viewOfficial': '公式サイトで確認',` |
| `ko` | `'train.statusNormal': '정상',` / `'train.viewOfficial': '공식 사이트에서 확인',` |
| `zh-Hant` | `'train.statusNormal': '正常',` / `'train.viewOfficial': '前往官方網站查看',` |
| `zh-Hans` | `'train.statusNormal': '正常',` / `'train.viewOfficial': '前往官方网站查看',` |
| `pt` | `'train.statusNormal': 'Normal',` / `'train.viewOfficial': 'Ver no site oficial',` |

例(`en`ブロック):

```ts
    'train.statusDisrupted': 'Service Alert',
    'train.statusNormal': 'Normal',
    'train.viewOfficial': 'Check official site',
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run composables/useUiText.test.ts`
Expected: PASS(全テスト)

- [ ] **Step 5: 6言語すべてにキーが入っていることを確認する**

Run: `grep -c "'train.statusNormal'" utils/i18n/uiStrings.ts; grep -c "'train.viewOfficial'" utils/i18n/uiStrings.ts`
Expected: どちらも`7`(型定義の1行 + 6言語ぶん)

- [ ] **Step 6: コミット(人間が実行)**

提案メッセージ:

```
feat: add train normal-status and official-link UI strings
```

---

### Task 4: `TrainStatusCard.vue` — 路線ごと1行・公式リンク・出典表示

**Files:**
- Modify(作り直し): `components/TrainStatusCard.vue`
- Modify(作り直し): `components/TrainStatusCard.test.ts`
- Modify: `utils/i18n/uiStrings.ts`(旧キー`train.allNormal`・`train.lineStatus`の削除)
- Modify: `composables/useUiText.test.ts`(旧キーのアサーションの削除)

**Interfaces:**
- Consumes: `TrainLineStatus`・`TrainStatusLevel`(`server/utils/trainStatus.ts`)、`TRAIN_LINE_META`(Task 2)、`t('train.statusNormal' | 'train.statusDelayed' | 'train.statusSuspended' | 'train.statusDisrupted' | 'train.viewOfficial')`(Task 3と既存)。
- Produces: props `{ lines: TrainLineStatus[] }`は変更なし。各行は`<li data-line-id="...">`。`pages/index.vue`は変更不要。

- [ ] **Step 1: テストを新仕様で全面的に書き換える(失敗するテスト)**

`components/TrainStatusCard.test.ts`を次の内容に置き換える:

```ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import TrainStatusCard from './TrainStatusCard.vue'
import { useArticleLocale } from '../composables/useArticleLocale'
import { useUiText } from '../composables/useUiText'
import type { TrainLineStatus } from '../server/utils/trainStatus'

const stubs = {
  UCard: { template: '<div><slot /></div>' }
}

beforeEach(() => {
  const stateCache = new Map()
  vi.stubGlobal('useState', (_key: string, init: () => unknown) => {
    if (!stateCache.has(_key)) {
      stateCache.set(_key, ref(init()))
    }
    return stateCache.get(_key)
  })
  vi.stubGlobal('useArticleLocale', useArticleLocale)
  vi.stubGlobal('useUiText', useUiText)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const allNormal: TrainLineStatus[] = [
  { lineId: 'ginza', lineName: 'Ginza Line', status: 'normal' },
  { lineId: 'hibiya', lineName: 'Hibiya Line', status: 'normal' },
  { lineId: 'asakusa', lineName: 'Asakusa Line', status: 'normal' },
  { lineId: 'oedo', lineName: 'Oedo Line', status: 'normal' },
  { lineId: 'tx', lineName: 'Tsukuba Express', status: 'normal' }
]

function mountCard(lines: TrainLineStatus[]) {
  return mount(TrainStatusCard, { props: { lines }, global: { stubs } })
}

function rowOf(wrapper: ReturnType<typeof mountCard>, lineId: string) {
  return wrapper.find(`li[data-line-id="${lineId}"]`)
}

function withStatus(lineId: TrainLineStatus['lineId'], status: TrainLineStatus['status']): TrainLineStatus[] {
  return allNormal.map((line) => (line.lineId === lineId ? { ...line, status } : line))
}

describe('TrainStatusCard', () => {
  it('renders one row per line, in the given order', () => {
    const wrapper = mountCard(allNormal)
    const rows = wrapper.findAll('li')
    expect(rows).toHaveLength(5)
    expect(rows.map((row) => row.attributes('data-line-id'))).toEqual(['ginza', 'hibiya', 'asakusa', 'oedo', 'tx'])
  })

  it('shows each line name in its row', () => {
    const wrapper = mountCard(allNormal)
    expect(rowOf(wrapper, 'ginza').text()).toContain('Ginza Line')
    expect(rowOf(wrapper, 'tx').text()).toContain('Tsukuba Express')
  })

  it('shows the official logo image for lines that have one', () => {
    const wrapper = mountCard(allNormal)
    const expected: Record<string, string> = {
      ginza: '/train-logos/ginza.png',
      hibiya: '/train-logos/hibiya.png',
      asakusa: '/train-logos/asakusa.svg',
      oedo: '/train-logos/oedo.svg'
    }
    for (const [lineId, src] of Object.entries(expected)) {
      const img = rowOf(wrapper, lineId).find('img')
      expect(img.exists(), lineId).toBe(true)
      expect(img.attributes('src'), lineId).toBe(src)
    }
    expect(rowOf(wrapper, 'ginza').find('img').attributes('alt')).toBe('Ginza Line')
  })

  it('shows plain text instead of an image for a line without a logo (tx)', () => {
    const row = rowOf(mountCard(allNormal), 'tx')
    expect(row.find('img').exists()).toBe(false)
    expect(row.findAll('span').some((span) => span.text() === 'TX')).toBe(true)
  })

  it('shows the normal label and no official link for normal lines', () => {
    const wrapper = mountCard(allNormal)
    for (const line of allNormal) {
      const row = rowOf(wrapper, line.lineId)
      expect(row.text(), line.lineId).toContain('Normal')
      expect(row.find('a').exists(), line.lineId).toBe(false)
    }
    expect(wrapper.text()).not.toContain('⚠️')
  })

  it('marks a delayed line with a warning and links to its official page', () => {
    const wrapper = mountCard(withStatus('hibiya', 'delayed'))
    const row = rowOf(wrapper, 'hibiya')
    expect(row.text()).toContain('⚠️')
    expect(row.text()).toContain('Delayed')
    expect(row.text()).not.toContain('Normal')

    const link = row.find('a')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://www.tokyometro.jp/unkou/history/hibiya.html')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
    expect(link.text()).toBe('Check official site')

    // 他の(平常の)路線にはリンクも警告も出ない
    expect(rowOf(wrapper, 'ginza').find('a').exists()).toBe(false)
    expect(rowOf(wrapper, 'ginza').text()).not.toContain('⚠️')
  })

  it('links each abnormal line to its own operator page and shows its status label', () => {
    const cases: Array<[TrainLineStatus['lineId'], TrainLineStatus['status'], string, string]> = [
      ['ginza', 'suspended', 'Suspended', 'https://www.tokyometro.jp/unkou/history/ginza.html'],
      ['asakusa', 'delayed', 'Delayed', 'https://www.kotsu.metro.tokyo.jp/subway/schedule/asakusa.html'],
      ['oedo', 'disrupted', 'Service Alert', 'https://www.kotsu.metro.tokyo.jp/subway/schedule/oedo.html'],
      ['tx', 'delayed', 'Delayed', 'https://www.mir.co.jp/info/']
    ]
    for (const [lineId, status, label, url] of cases) {
      const row = rowOf(mountCard(withStatus(lineId, status)), lineId)
      expect(row.text(), `${lineId} label`).toContain(label)
      expect(row.find('a').attributes('href'), `${lineId} href`).toBe(url)
    }
  })

  it('only renders rows for the lines that are present', () => {
    const wrapper = mountCard(allNormal.slice(0, 2))
    expect(wrapper.findAll('li')).toHaveLength(2)
    expect(rowOf(wrapper, 'oedo').exists()).toBe(false)
  })

  it('renders nothing when there are no lines', () => {
    const wrapper = mountCard([])
    expect(wrapper.find('li').exists()).toBe(false)
    expect(wrapper.text().trim()).toBe('')
  })

  it('shows the data attribution with a link to ODPT', () => {
    const wrapper = mountCard(allNormal)
    const text = wrapper.text()
    expect(text).toContain('Tokyo Metro')
    expect(text).toContain('Bureau of Transportation')
    expect(text).toContain('Metropolitan Intercity Railway')
    expect(text).toContain('CC BY 4.0')
    expect(wrapper.find('a[href="https://www.odpt.org/"]').exists()).toBe(true)
  })

  it('shows Japanese labels when the locale is ja', () => {
    const { setLocale } = useArticleLocale()
    setLocale('ja')
    const wrapper = mountCard(withStatus('hibiya', 'delayed'))
    expect(rowOf(wrapper, 'ginza').text()).toContain('平常')
    expect(rowOf(wrapper, 'hibiya').text()).toContain('遅延')
    expect(rowOf(wrapper, 'hibiya').find('a').text()).toBe('公式サイトで確認')
    // 路線名は英語固定
    expect(rowOf(wrapper, 'hibiya').text()).toContain('Hibiya Line')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run components/TrainStatusCard.test.ts`
Expected: FAIL(旧コンポーネントは`<li>`を全路線分出さず`data-line-id`も無いため、ほぼ全テストが失敗する)

- [ ] **Step 3: コンポーネントを作り直す**

`components/TrainStatusCard.vue`を次の内容に置き換える:

```vue
<script setup lang="ts">
import type { TrainLineStatus, TrainStatusLevel } from '../server/utils/trainStatus'
import { TRAIN_LINE_META } from '../utils/trainLineMeta'

defineProps<{
  lines: TrainLineStatus[]
}>()

const { t } = useUiText()

const statusKeyMap = {
  normal: 'train.statusNormal',
  delayed: 'train.statusDelayed',
  suspended: 'train.statusSuspended',
  disrupted: 'train.statusDisrupted'
} as const satisfies Record<TrainStatusLevel, string>
</script>

<template>
  <UCard v-if="lines.length > 0" :ui="{ body: 'p-4' }">
    <ul class="space-y-2">
      <li v-for="line in lines" :key="line.lineId" :data-line-id="line.lineId" class="flex items-center gap-3 text-sm">
        <span class="flex h-7 w-7 shrink-0 items-center justify-center">
          <img
            v-if="TRAIN_LINE_META[line.lineId].logo"
            :src="TRAIN_LINE_META[line.lineId].logo || undefined"
            :alt="line.lineName"
            width="28"
            height="28"
            class="h-7 w-7"
          />
          <span v-else class="text-xs font-bold text-muted">{{ TRAIN_LINE_META[line.lineId].fallbackLabel }}</span>
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <span class="truncate text-highlighted">{{ line.lineName }}</span>
            <span :class="line.status === 'normal' ? 'text-muted' : 'text-warning font-bold'">
              <template v-if="line.status !== 'normal'">⚠️ </template>{{ t(statusKeyMap[line.status]) }}
            </span>
          </div>
          <a
            v-if="line.status !== 'normal'"
            :href="TRAIN_LINE_META[line.lineId].officialUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs text-primary underline"
          >{{ t('train.viewOfficial') }}</a>
        </div>
      </li>
    </ul>
    <p class="mt-3 text-xs text-muted">
      Data: Tokyo Metro, Bureau of Transportation Tokyo Metropolitan Government (CC BY 4.0),
      Metropolitan Intercity Railway Company, via the Public Transportation Open Data Center
      (<a href="https://www.odpt.org/" target="_blank" rel="noopener noreferrer" class="underline">ODPT</a>).
    </p>
  </UCard>
</template>
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run components/TrainStatusCard.test.ts`
Expected: PASS(11 tests)

もし`⚠️`の位置や余白で`text()`のアサーションが失敗する場合は、テストの期待(`toContain`)に合うようテンプレートの空白を調整する。テストの方を弱めない。

- [ ] **Step 5: 旧i18nキー(`train.allNormal`・`train.lineStatus`)を削除する**

先に参照が残っていないことを確認する:

Run: `grep -rn "train.allNormal\|train.lineStatus" --include=*.ts --include=*.vue --exclude-dir=node_modules --exclude-dir=.nuxt --exclude-dir=.output .`
Expected: `utils/i18n/uiStrings.ts`(型1行+6言語)と`composables/useUiText.test.ts`(既存アサーション)だけがヒットする。**コンポーネントや他のファイルがヒットしたら、削除せずに止めて確認する。**

`utils/i18n/uiStrings.ts`から、次の行をすべて削除する(型のunionの2行 + 6言語ブロックの各2行 = 14行):

- `  | 'train.allNormal'`
- `  | 'train.lineStatus'`
- 各言語ブロックの`'train.allNormal': ...,`と`'train.lineStatus': ...,`

`composables/useUiText.test.ts`の`it('returns train status strings for en and ja', ...)`から、旧キーを使う4行を削除し、テストを次のように整える:

```ts
  it('returns train status strings for en and ja', async () => {
    const { useArticleLocale } = await import('./useArticleLocale')
    vi.stubGlobal('useArticleLocale', useArticleLocale)
    const { useUiText } = await import('./useUiText')

    const { locale, setLocale } = useArticleLocale()
    const { t } = useUiText()
    expect(t('train.statusSuspended')).toBe('Suspended')

    setLocale('ja')
    expect(locale.value).toBe('ja')
    expect(t('train.statusDelayed')).toBe('遅延')
  })
```

- [ ] **Step 6: 単体テスト全体を実行する**

Run: `npx vitest run components composables utils server/utils layouts`
Expected: 全ファイルPASS(ベースラインの33ファイルに、新規`utils/trainLineMeta.test.ts`が加わって34ファイル)。失敗があれば、今回の変更が原因かを切り分ける(ベースラインは全PASS)。

- [ ] **Step 7: コミット(人間が実行)**

提案メッセージ:

```
feat: rebuild train status card with line logos, official links, and attribution
```

---

### Task 5: 設計書の同期と実機確認

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-train-line-logos-design.md`
- Modify: `docs/superpowers/specs/2026-08-16-train-status-widget-design.md`

- [ ] **Step 1: 設計書を実装に合わせて直す**

`docs/superpowers/specs/2026-09-19-train-line-logos-design.md`を、次の3点で修正する(計画の作成中に、設計書の記述と実装方針が食い違った箇所):

1. 「### 2. `components/TrainStatusCard.vue`(作り直し)」の「ロゴ: `lineId`から画像パスへの対応表(コンポーネント内の定数)で引く。…」を、**`utils/trainLineMeta.ts`の`TRAIN_LINE_META`(`logo`・`fallbackLabel`・`officialUrl`)を引く**、に直す。「### 4. 公式運行情報ページへのリンク」冒頭の「対応表を、ロゴの対応表と同じくコンポーネント内の定数として持つ」も同様に`utils/trainLineMeta.ts`に直す。「## アーキテクチャ」のファイル一覧に`utils/trainLineMeta.ts`・`utils/trainLineMeta.test.ts`を追加する。
2. 「### 3. i18n」から`train.credit`を削除する(出典表示は固有名詞・法定表記のため、`lineName`と同様に英語の静的文字列としてコンポーネントに直接書く。i18nキーにしない)。「## テスト方針」の`train.credit`への言及も削除する。
3. 「### 5. 出典表示」の表示文言を、実装した実際の文言に直す: 「Data: Tokyo Metro, Bureau of Transportation Tokyo Metropolitan Government (CC BY 4.0), Metropolitan Intercity Railway Company, via the Public Transportation Open Data Center (ODPT).」(ODPTへのリンク付き)。設計書の旧文言は「(CC BY 4.0)」が東京メトロにもかかるように読める不正確さがあった(実際は東京メトロ・MIRは公共交通オープンデータ基本ライセンス、CC BY 4.0は東京都交通局)。運行情報はMIR(TX)のデータも使うため、MIRも出典に含めた。

- [ ] **Step 2: 旧設計書に置き換わった旨を注記する**

`docs/superpowers/specs/2026-08-16-train-status-widget-design.md`の「### 3. `components/TrainStatusCard.vue`(新規)」の見出し直下に、次の1行を追加する:

```
> 2026-09-19: 表示ロジック(「全路線正常なら一行のみ」「異常な路線だけ列挙」「部分データで異常なしなら非表示」)と`train.allNormal`・`train.lineStatus`キーは、[[2026-09-19-train-line-logos-design.md]]で「路線ごとに1行(ロゴ+路線名+状態)」に置き換わった。
```

- [ ] **Step 3: 開発サーバーで実機確認する**

```bash
cd /home/masa/iDesktop/asakusatoday && npm run dev
```

別ターミナルで`http://localhost:3000/`を開き、次を確認する(`.env`に`ODPT_API_KEY`が必要):

- 天気カードの右(狭い画面では下)に交通カードがあり、5路線が1行ずつ並ぶ。
- 銀座線・日比谷線・浅草線・大江戸線に公式ロゴが出る。TXはロゴの位置に文字「TX」が出る。
- 平常の行は「Normal」が控えめに出て、リンクは出ない。
- 遅延中の路線(取得時点で実際に遅延があれば)の行に「⚠️ Delayed」と「Check official site」リンクが出る。
- カードの下に出典表示が出て、「ODPT」がリンクになっている。
- ダークモード(ページのテーマ切替)でもロゴの周りに白い角が出ない。
- 言語を切り替えると(プロフィール等のロケール切替)、状態の文言とリンク文言が変わり、路線名は英語のまま。

- [ ] **Step 4: 異常時の表示を確実に見たい場合(任意)**

実際に遅延が無い時間帯は、クライアント側のナビゲーションでAPIをモックして見る。サーバー描画の初回ロードはモックできないため、`/map`を開いてからクライアント遷移で`/`に戻る:

```bash
cd /home/masa/iDesktop/asakusatoday && node -e "
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 });
  await p.route('**/api/train-status', (r) => r.fulfill({ json: [
    { lineId: 'ginza', lineName: 'Ginza Line', status: 'normal' },
    { lineId: 'hibiya', lineName: 'Hibiya Line', status: 'delayed' },
    { lineId: 'asakusa', lineName: 'Asakusa Line', status: 'suspended' },
    { lineId: 'oedo', lineName: 'Oedo Line', status: 'normal' },
    { lineId: 'tx', lineName: 'Tsukuba Express', status: 'disrupted' }
  ] }));
  await p.goto('http://localhost:3000/map');
  await p.waitForLoadState('networkidle');
  await p.click('a[href=\"/\"]');
  await p.waitForSelector('li[data-line-id=\"hibiya\"]');
  await p.screenshot({ path: '${TMPDIR:-/tmp}/train-card-abnormal.png' });
  await b.close(); console.log('saved train-card-abnormal.png');
})().catch(e => { console.error(e.message); process.exit(1) })"
```

`train-card-abnormal.png`を開いて、遅延・見合わせ・その他の各行に⚠️と公式リンクが出て、レイアウトが崩れていないことを確認する。

- [ ] **Step 5: 人間による最終確認(エージェントには実施できない項目)**

1. **東京メトロの公式リンク2つ**(`https://www.tokyometro.jp/unkou/history/ginza.html`・`.../hibiya.html`)をブラウザで開いて実在を確認する。実装時のcurlはbot対策で403になり、機械的には確認できなかった。
2. **出典表示の文言**を、ODPT公式のクレジット表示FAQ(https://developer.odpt.org/ja/faq-info#cc-by-credit)と見比べる。FAQはJavaScript描画のためツールでは取得できなかった。文言がFAQの要件に足りなければ、`components/TrainStatusCard.vue`の出典文とテストを直す。
3. **TXロゴの使用承認申請**(MIR 経営企画部 許諾担当、https://www.mir.co.jp/inquiry/copyright.html)。承認後は別作業で`public/train-logos/tx.*`を追加し、`utils/trainLineMeta.ts`の`tx.logo`を設定する(設計書「後続作業」)。
4. 都営・MIRのリンク規定を確認する(設計書「### 4」の未確認事項)。

- [ ] **Step 6: コミット(人間が実行)**

提案メッセージ:

```
docs: sync train line logos spec with implementation
```

---

## Self-Review(計画の作成者が実施済み)

**1. 設計書とのカバレッジ**
- ロゴ素材(メトロ透明PNG・都営SVG・TXなし) → Task 1
- `lineId`→ロゴ・URLの対応表 → Task 2(設計書は「コンポーネント内の定数」だったが、テスト容易性と責務分離のため`utils/trainLineMeta.ts`に分離。Task 5 Step 1で設計書を同期)
- `TrainStatusCard.vue`の作り直し(路線ごと1行・ロゴ・TXは文字・平常/異常の表示・データ欠け・空) → Task 4
- 公式リンク(異常の行だけ、別タブ、`noopener`、路線ごとのURL) → Task 2(URL)・Task 4(表示・テスト)
- i18n(`train.statusNormal`・`train.viewOfficial`追加、旧2キー削除) → Task 3・Task 4 Step 5
- 出典表示 → Task 4(コンポーネントとテスト)、Task 5 Step 5(人間によるFAQ確認)
- 後続作業(TXロゴ申請・東武) → Task 5 Step 5(TX)。東武は設計書の記載のまま今回外。

**2. プレースホルダー確認**: TBD・「適切に処理する」等の曖昧な指示なし。画像加工のスクリプト・コンポーネント・テストはすべて全文を掲載した。

**3. 型・名前の整合**: `TRAIN_LINE_META`・`TrainLineMeta`(`logo`・`fallbackLabel`・`officialUrl`)、`data-line-id`、i18nキー(`train.statusNormal`・`train.statusDelayed`・`train.statusSuspended`・`train.statusDisrupted`・`train.viewOfficial`)、ロゴパス(`/train-logos/{ginza,hibiya}.png`・`{asakusa,oedo}.svg`)は、Task 1・2・4で同一。
