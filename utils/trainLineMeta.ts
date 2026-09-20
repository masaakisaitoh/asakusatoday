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
