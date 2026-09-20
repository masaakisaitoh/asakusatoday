# ASAKUSA TODAY — 交通情報カードへの路線ロゴ追加

## 位置づけ

[[2026-08-16-train-status-widget-design.md]]で導入した`TrainStatusCard.vue`に、各路線の公式路線シンボル(ロゴ)を表示する。あわせて、これまで未対応だったODPTデータの出典表示(クレジット)を追加する。

## 経緯・スコープ判断

依頼:「交通情報のところに、天気情報のようにロゴを表示したい。各路線図のロゴマークを」。

ロゴの出し方は(a)CSSで描く汎用バッジ、(b)公式ロゴ画像、(c)汎用の電車アイコン1つ、の3案を比較し、(b)公式ロゴ画像を採用した。2026-09-19に各社のロゴ利用ルールを調査した結果は以下のとおり。

| 路線 | 入手元 | 利用条件 | 判定 |
|---|---|---|---|
| 銀座線(G)・日比谷線(H) | ODPT「東京メトロ 画像情報(鉄道関連)」のZIP(`LineSymbol.zip`内の`G.jpg`・`H.jpg`、132×131px)。ダウンロードにはODPT APIキーが必要 | ZIP同梱の「東京メトロ画像データ利用条件」: 変形・回転をしない(縦横等倍の拡縮のみ可)、配色を変えない、判別できない小ささにしない、東京メトロと提携・協賛していると誤認される使用をしない。「周辺部分を透明にしたもの」「影をつけたもの」は加工として認められている。申請は不要 | 使用可 |
| 浅草線(A)・大江戸線(E) | ODPT「東京都交通局 画像情報(鉄道関連)」の「都営地下鉄 路線シンボルデータ」PDF(ベクター、公開URL。`https://api-public.odpt.org/api/v4/files/Toei/Image/odpt_Image-Toei_都営地下鉄_路線シンボルデータ.pdf`)。A・I・S・Eの4路線のシンボルを含む | CC BY 4.0(クレジット表示が必要。提供者名は「東京都交通局 / Bureau of Transportation, Tokyo Metropolitan Government」) | 使用可 |
| つくばエクスプレス | ODPTに路線シンボルの配布なし | TXロゴは首都圏新都市鉄道の登録商標。使用には「使用承認申請書」の提出と審査(1週間程度、使用期間は原則1年以内で更新には再申請)が必要 | 今回は対象外(後述) |

- 出典: https://ckan.odpt.org/dataset/r_image-tokyometro , https://ckan.odpt.org/dataset/r_image-toei , https://www.mir.co.jp/inquiry/copyright.html , https://www.tokyometro.jp/support/trademark/index.html
- 東京メトロの利用条件PDF(`東京メトロ画像データ利用条件.pdf`)は、上記ZIPをODPT APIキーでダウンロードして全文を確認済み。

**今回のスコープ**: 銀座線・日比谷線・浅草線・大江戸線の4路線にロゴを表示する。TXは公式ロゴの使用承認を得るまでロゴなし(後述)。あわせて、遅延・運転見合わせ等の異常を表示している路線には、各社の公式運行情報ページへのリンクを付ける(追加要望、2026-09-19)。

**スコープ外**

- TXロゴの表示(MIRへの使用承認申請は人間が行う。承認後に別作業として追加する)。
- 東武スカイツリーライン(ODPTの運行情報が「チャレンジ限定ライセンス」のままで、一般サイトでは使えない。2026-09-19再確認、APIも空配列`[]`)。
- 運行情報の詳細本文。

## 方針

- ロゴ画像は素材を加工せずそのまま使う。許される加工は「周辺を透明にする」「縦横等倍の拡縮」のみ。配色・形は変えない。
- TXは公式ロゴの代わりに自作バッジを作らない(登録商標に似せた表示をしない)。ロゴの場所には装飾なしの文字「TX」を置き、列を揃える。
- 路線名("Ginza Line"等)は[[2026-08-16-train-status-widget-design.md]]の合意どおり英語の静的文字列のまま。

## アーキテクチャ

サーバー側(`server/utils/trainStatus.ts`・`/api/train-status`)は変更しない。変更は表示側とi18n、静的ファイルのみ。

```
public/train-logos/{ginza,hibiya,asakusa,oedo}.(png|svg)   ← 新規(静的ファイル)
utils/trainLineMeta.ts                                      ← 新規(lineId → ロゴ・フォールバック文字・公式URLの対応表)
utils/trainLineMeta.test.ts                                 ← 新規
components/TrainStatusCard.vue                              ← 作り直し
utils/i18n/uiStrings.ts                                     ← キーの追加・削除
components/TrainStatusCard.test.ts                          ← 更新
```

## コンポーネント

### 1. ロゴ素材(`public/train-logos/`)

- `ginza`・`hibiya`: 東京メトロ公式の`G.jpg`・`H.jpg`。**四隅が白**で、ダークモードのカード上で白い角が見えるため、規約が認める「周辺部分を透明にする加工」で四隅を透明にしたPNGにする。円の色・形・文字は変えない。
- `asakusa`・`oedo`: 都営の路線シンボルデータPDF(ベクター)から、A(浅草線)・E(大江戸線)の円形シンボルだけを切り出す。まずSVG化を試み、うまくいかなければ高解像度PNG(表示サイズの3倍以上)にする。CC BY 4.0のため、加工・再配布は出典表示を条件に許される。
- 実装時、切り出した画像が公式シンボルと同じ見た目であることを目視確認する。

### 2. `components/TrainStatusCard.vue`(作り直し)

- props: `{ lines: TrainLineStatus[] }`(変更なし)。
- 表示: `lines`の各路線を1行で縦に並べる。`[ロゴ 28px] 路線名 …… 状態`。
  - ロゴ: `utils/trainLineMeta.ts`の`TRAIN_LINE_META`(`lineId`ごとに`logo`・`fallbackLabel`・`officialUrl`を持つ)を引く。`logo`が`null`の路線(TX)は画像の代わりに、同じ幅(28px)の枠に`fallbackLabel`(装飾なしの文字「TX」)を置く。対応表をコンポーネントの外(`utils/`)に置くのは、単体でテストしやすくし、表示と対応データの責務を分けるため。
  - 状態: `normal`は控えめな文字で`t('train.statusNormal')`、それ以外(`delayed`/`suspended`/`disrupted`)は⚠と警告色で既存の`train.statusDelayed`等を表示する。
  - 公式リンク: 状態が`normal`以外の行にだけ、路線名の下に小さく`t('train.viewOfficial')`(「公式サイトで確認」)のリンクを出す。リンク先は`TRAIN_LINE_META`の`officialUrl`(次節の対応表)。`<a target="_blank" rel="noopener noreferrer">`で別タブで開く。`normal`の行にはリンクを出さない。
  - 画像の`alt`は路線名(`lineName`)。
- 表示順: `lines`の並びのまま(サーバーが東京メトロ → 都営 → MIRの順で結合しているため、銀座・日比谷・浅草・大江戸・TXの順になる)。
- `lines`が空のときはカードごと描画しない。取得できた路線だけを表示する(旧仕様の「全5路線そろって全正常のときだけ文言を出す」「部分データで異常なしなら非表示」は廃止)。
- カード下部に出典表示を小さく1行(次節)。

### 3. i18n(`utils/i18n/uiStrings.ts`)

- 追加: `train.statusNormal`(英語 "Normal"、他5言語(ja/ko/zh-Hant/zh-Hans/pt)分の翻訳)、`train.viewOfficial`(英語 "Check official site"、同6言語分)。
- 出典表示の文言はi18nキーにしない。提供者名・ライセンス名を含む固有名詞・法定表記のため、`lineName`と同様に英語の静的文字列としてコンポーネントに直接書く(翻訳すると表記が揺れる)。
- 削除: `train.allNormal`、`train.lineStatus`(全路線を行で出すため不要になる)。`uiStrings.ts`と`useUiText.test.ts`に該当キーへの参照があれば併せて更新する。

### 4. 公式運行情報ページへのリンク

異常表示の行から飛ばす先(`lineId` → URL の対応表を、ロゴの対応表と同じく`utils/trainLineMeta.ts`の`TRAIN_LINE_META`(`officialUrl`)として持つ)。2026-09-19に、各社サイトの検索結果・HTTP応答で実在を確認した。

| lineId | リンク先 | 確認 |
|---|---|---|
| `ginza` | https://www.tokyometro.jp/unkou/history/ginza.html (「運行情報：銀座線」) | 検索結果に実在。curlはbot対策で403(ブラウザからの閲覧は問題ない想定。実装後に人間がブラウザで開いて確認する) |
| `hibiya` | https://www.tokyometro.jp/unkou/history/hibiya.html (「運行情報：日比谷線」) | 同上 |
| `asakusa` | https://www.kotsu.metro.tokyo.jp/subway/schedule/asakusa.html | HTTP 200 |
| `oedo` | https://www.kotsu.metro.tokyo.jp/subway/schedule/oedo.html | HTTP 200 |
| `tx` | https://www.mir.co.jp/info/ (「運行情報詳細」) | HTTP 200 |

- TXにもリンクは付ける(ロゴは未対応でも、公式ページへの通常のリンクは商標の使用にあたらない)。
- 東京メトロの利用規約(https://www.tokyometro.jp/terms/index.html)では、リンクの事前許可・連絡は不要。ただし**フレーム内での表示は禁止**のため、リンクは別タブで開く通常の`<a>`のみとし、iframe等では表示しない。「東京メトロのページを表示することで商行為を行うことを目的としたサイト」からのリンクは禁止とあるため、通常の外部リンクとしてのみ使い、広告等と一体に見える配置にしない。
- 都営・MIRのリンク規定は今回未確認(通常の外部リンクのため問題は小さいと見ているが、後続作業で確認する)。

### 5. 出典表示

- 表示文言(英語の静的文字列。固有名詞・法定表記のため翻訳せず、i18nキーにもせずコンポーネントに直接書く): 「Data and line symbols: Tokyo Metro, Bureau of Transportation Tokyo Metropolitan Government (CC BY 4.0), Metropolitan Intercity Railway Company, via the Public Transportation Open Data Center (ODPT). Line symbols have been cropped and resized from the originals.」。「ODPT」の部分は https://www.odpt.org/ へのリンク(`target="_blank"`・`rel="noopener noreferrer"`)にする。
- 文言は当初案(「Train status & line symbols: Tokyo Metro, Bureau of Transportation Tokyo Metropolitan Government (CC BY 4.0), via Open Data Challenge for Public Transportation ODPT.」)から次の3点を直した(あわせて、次項の「改変した旨の表示」も加えた)。
  - ライセンスの帰属: 旧文言は「(CC BY 4.0)」が東京メトロにもかかるように読める不正確さがあった。実際は、東京メトロ・首都圏新都市鉄道(MIR)は「公共交通オープンデータ基本ライセンス」、CC BY 4.0は東京都交通局のみ。そこで「(CC BY 4.0)」を東京都交通局の直後にだけ置き、東京メトロとMIRにはライセンス名を付けない。
  - MIRの追加: 運行情報は首都圏新都市鉄道(TX)のデータも使うため、提供者としてMIRを出典に含めた。
  - あわせて、ODPTの正式名称を「Public Transportation Open Data Center (ODPT)」に改めた。
- 改変した旨の表示: 都営シンボル(`asakusa.svg`・`oedo.svg`)は公式のCC BY 4.0のPDFから切り出し・組み直したもの、東京メトロのシンボルは周辺を透明にしてトリミングしたものである。CC BY 4.0の「改変した旨の表示」(§3(a)(1)(B))を満たすため、出典表示に路線シンボルを含めること(「Data and line symbols:」)と、「Line symbols have been cropped and resized from the originals.」の一文を加えた。「(CC BY 4.0)」は従来どおり東京都交通局の直後にだけ置く。
- なお、これは[[2026-08-16-train-status-widget-design.md]]の導入時点から未対応だった(2026-09-19時点で、サイトのどこにもODPT・東京メトロ・東京都交通局の出典表示が無いことを確認)ため、今回のロゴ追加とあわせて解消する。
- ODPT公式のクレジット表示FAQ(https://developer.odpt.org/ja/faq-info#cc-by-credit)はJavaScript描画のためツールでは取得できなかった。CC BY 4.0の一般要件(提供者名・ライセンス名・ライセンスへの言及)を満たす文言で実装し、**実装後に人間がFAQ原文と見比べて文言を確認する**。
- 東京メトロの画像データ利用条件は、上記に加えて「東京メトロと提携・協賛していると誤認されない」ことを求める。出典表示は「データの出典」であり提携を示す文言にしない。

## データフロー

変更なし。`pages/index.vue`が`/api/train-status`の結果を`TrainStatusCard`にpropsで渡す。ロゴは`/train-logos/*`の静的ファイルとしてブラウザが取得する。

## エラーハンドリング

- ロゴ画像の読み込みに失敗しても、路線名と状態の文字は表示される(`alt`が路線名のため)。
- `lines`が空、または`/api/train-status`が`null`の場合の動作は従来どおり(カード非表示)。

## テスト方針

`components/TrainStatusCard.test.ts`を更新する。

- 4路線+TXの`lines`を渡したとき、5行が描画され、ginza/hibiya/asakusa/oedoの行に対応する`<img>`(`/train-logos/...`)が出て、TXの行には`<img>`が無く文字「TX」が出る。
- `normal`の路線は`train.statusNormal`の文言が出る。
- 異常な路線(`delayed`等)の行に⚠と該当ステータス文言が出る。
- 異常な路線の行にだけ公式サイトへのリンク(`<a>`)が出て、`href`が路線ごとの正しいURL、`target="_blank"`・`rel`に`noopener`が付いている。`normal`の行にはリンクが無い。
- 一部の路線しか`lines`に無いとき、ある路線の行だけが出る(旧仕様のようにカードが消えない)。
- `lines`が空のときは何も描画されない。
- 出典表示が描画される。
- 6言語すべてで`train.statusNormal`・`train.viewOfficial`が定義されている(`useUiText.test.ts`の既存の網羅テストがあればそれに任せる)。出典表示は固定の英語文字列でi18nキーではないため、この対象に含めない。
- `utils/trainLineMeta.test.ts`: `TRAIN_LINE_META`が5路線すべてのエントリを持つこと、`logo`が`null`でなければ`/train-logos/`配下で`public/`に実在するファイルを指すこと、`officialUrl`が各社公式ドメインのhttps URLであること、`fallbackLabel`が空でないことをテストする。

`pages/index.vue`側は既存の`tests/smoke.test.ts`が壊れていないことを確認する程度とする。

## 後続作業(今回外)

1. **TXロゴ**: 首都圏新都市鉄道(経営企画部 許諾担当)へ使用承認申請書を提出する(https://www.mir.co.jp/inquiry/copyright.html 、様式: https://www.mir.co.jp/inquiry/pdf/license_logo_201904.pdf)。承認後、`public/train-logos/tx.*`を追加し、`utils/trainLineMeta.ts`の`TRAIN_LINE_META.tx.logo`にそのパスを設定する。承認は原則1年ごとの更新が必要。
2. **東武スカイツリーライン**: ODPTの東武「運行情報」が一般利用可能なライセンスになったら、[[2026-08-16-train-status-widget-design.md]]の手順(`RAILWAY_MAP`・`OPERATORS`・`TOTAL_LINE_COUNT`等)で追加し、東武のロゴ利用条件も別途確認する。
