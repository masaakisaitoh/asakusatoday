export type SourceCategory =
  | 'disaster-prevention'
  | 'asakusa-area'
  | 'asakusa-culture'
  | 'kappabashi-area'
  | 'shitaya-area'
  | 'shin-okachimachi-area'
  | 'kuramae-area'
  | 'oshiage-area'
  | 'asakusabashi-area'
  | 'akihabara-area'
  | 'ueno-okachimachi-area'
  | 'ueno-okachimachi-culture'
  | 'ameyoko-area'
  | 'ryogoku-area'
  | 'minowa-area'
  | 'yanesen-area'

export type SourceSite =
  | { type: 'page'; url: string; siteName: string; category: SourceCategory }
  | { type: 'list'; url: string; siteName: string; category: SourceCategory; articleLinkPattern: RegExp }

export const SOURCE_SITES: SourceSite[] = [
  { type: 'page', url: 'https://www.city.taito.lg.jp/', siteName: 'www.city.taito.lg.jp', category: 'disaster-prevention' },

  { type: 'list', url: 'https://e-asakusa.jp/', siteName: 'e-asakusa.jp', category: 'asakusa-area', articleLinkPattern: /\/(event|photos)\/\d+/ },
  { type: 'list', url: 'https://www.senso-ji.jp/', siteName: 'www.senso-ji.jp', category: 'asakusa-area', articleLinkPattern: /\/news\/\d{8}_\d+\.html/ },
  { type: 'list', url: 'https://asakusajinja.jp/', siteName: 'asakusajinja.jp', category: 'asakusa-area', articleLinkPattern: /\/\d{4}\/\d{2}\/\d{2}\// },
  { type: 'page', url: 'https://asakusa-tawara.com/', siteName: 'asakusa-tawara.com', category: 'asakusa-area' },
  { type: 'page', url: 'https://www.asakusa-nakamise.jp/', siteName: 'www.asakusa-nakamise.jp', category: 'asakusa-area' },
  { type: 'list', url: 'https://www.asakusa-shinnaka.com/', siteName: 'www.asakusa-shinnaka.com', category: 'asakusa-area', articleLinkPattern: /\/info\/oshirase\/\d+\// },
  { type: 'list', url: 'https://senzokudori.com/', siteName: 'senzokudori.com', category: 'asakusa-area', articleLinkPattern: /\/(news|event)\/\d+\// },
  { type: 'list', url: 'https://orange-st.jp/', siteName: 'orange-st.jp', category: 'asakusa-area', articleLinkPattern: /\/\d{4}\/\d{2}\/\d{2}\// },
  { type: 'list', url: 'https://yanagikouji.com/', siteName: 'yanagikouji.com', category: 'asakusa-area', articleLinkPattern: /\/\d{4}\/\d{2}\/\d{2}\// },
  { type: 'page', url: 'http://tanuki-dori.com/', siteName: 'tanuki-dori.com', category: 'asakusa-area' },
  { type: 'list', url: 'https://asakusa-kokusaidori.jp/', siteName: 'asakusa-kokusaidori.jp', category: 'asakusa-area', articleLinkPattern: /\/news\/news-\d+\// },
  { type: 'page', url: 'https://www.denbouin-dori.com/', siteName: 'www.denbouin-dori.com', category: 'asakusa-area' },
  { type: 'list', url: 'https://asakusanioideyo.com/', siteName: 'asakusanioideyo.com', category: 'asakusa-area', articleLinkPattern: /\/news\/\d+\// },
  { type: 'list', url: 'https://www.asakusa-samba.org/', siteName: 'www.asakusa-samba.org', category: 'asakusa-area', articleLinkPattern: /\/\d{4}\/\d{2}\/\d{2}\// },
  { type: 'page', url: 'https://www.sumidagawa-hanabi.com/', siteName: 'www.sumidagawa-hanabi.com', category: 'asakusa-area' },
  { type: 'list', url: 'https://asakusa.keizai.biz/', siteName: 'asakusa.keizai.biz', category: 'asakusa-area', articleLinkPattern: /\/headline\/\d+\// },

  { type: 'page', url: 'https://www.asakusaengei.com/', siteName: 'www.asakusaengei.com', category: 'asakusa-culture' },
  { type: 'page', url: 'https://www.asakusatoyokan.com/', siteName: 'www.asakusatoyokan.com', category: 'asakusa-culture' },

  { type: 'list', url: 'https://www.kappabashi.or.jp/', siteName: 'www.kappabashi.or.jp', category: 'kappabashi-area', articleLinkPattern: /\/news\/\d+\// },
  { type: 'page', url: 'https://www.asakusakappawest.com/', siteName: 'www.asakusakappawest.com', category: 'kappabashi-area' },

  { type: 'list', url: 'https://shitayajinja.or.jp/', siteName: 'shitayajinja.or.jp', category: 'shitaya-area', articleLinkPattern: /\/news\/[^/]+\/?$/ },

  { type: 'page', url: 'https://satakeshotengai.com/', siteName: 'satakeshotengai.com', category: 'shin-okachimachi-area' },

  { type: 'list', url: 'https://kuramaejinja.tokyo/', siteName: 'kuramaejinja.tokyo', category: 'kuramae-area', articleLinkPattern: /\/news\/[^/]+\/?$/ },

  { type: 'list', url: 'https://www.tokyo-skytree.jp/', siteName: 'www.tokyo-skytree.jp', category: 'oshiage-area', articleLinkPattern: /\/news\/info\/\d+\// },
  { type: 'list', url: 'https://www.tokyo-solamachi.jp/', siteName: 'www.tokyo-solamachi.jp', category: 'oshiage-area', articleLinkPattern: /\/news\/\d+/ },
  { type: 'list', url: 'https://sumidapark.jp/', siteName: 'sumidapark.jp', category: 'oshiage-area', articleLinkPattern: /^\/\d+\/$/ },
  { type: 'list', url: 'https://www.tabashio.jp/', siteName: 'www.tabashio.jp', category: 'oshiage-area', articleLinkPattern: /\/exhibition\/\d{4}\/\d{4}[a-z]{3}\/index\.html/ },
  { type: 'list', url: 'https://sumida.keizai.biz/', siteName: 'sumida.keizai.biz', category: 'oshiage-area', articleLinkPattern: /\/headline\/\d+\// },

  { type: 'list', url: 'https://asakusabashi.tokyo/', siteName: 'asakusabashi.tokyo', category: 'asakusabashi-area', articleLinkPattern: /\/event\/event\d{4}_\d+\// },

  { type: 'page', url: 'https://www.kandamyoujin.or.jp/', siteName: 'www.kandamyoujin.or.jp', category: 'akihabara-area' },

  { type: 'list', url: 'https://www.tnm.jp/', siteName: 'www.tnm.jp', category: 'ueno-okachimachi-area', articleLinkPattern: /\/modules\/rblog\/index\.php\/1\/\d{4}\/\d{2}\/\d{2}\/[\w-]+\// },
  { type: 'page', url: 'https://www.nmwa.go.jp/jp/', siteName: 'www.nmwa.go.jp', category: 'ueno-okachimachi-area' },
  { type: 'page', url: 'https://www.ueno-mori.org/', siteName: 'www.ueno-mori.org', category: 'ueno-okachimachi-area' },
  { type: 'list', url: 'https://www.tobikan.jp/', siteName: 'www.tobikan.jp', category: 'ueno-okachimachi-area', articleLinkPattern: /\/information\/\d{8}_\d+\.html/ },
  { type: 'page', url: 'https://www.kahaku.go.jp/', siteName: 'www.kahaku.go.jp', category: 'ueno-okachimachi-area' },
  { type: 'list', url: 'https://www.tokyo-zoo.net/ueno/', siteName: 'www.tokyo-zoo.net', category: 'ueno-okachimachi-area', articleLinkPattern: /\/ueno\/(news|blog)\/\d+\/index\.html/ },
  { type: 'list', url: 'https://www.t-bunka.jp/', siteName: 'www.t-bunka.jp', category: 'ueno-okachimachi-area', articleLinkPattern: /\/info\/\d+\// },
  { type: 'page', url: 'https://www.kensetsu.metro.tokyo.lg.jp/jimusho/toubuk/ueno/event', siteName: 'www.kensetsu.metro.tokyo.lg.jp', category: 'ueno-okachimachi-area' },

  { type: 'page', url: 'https://www.rakugo-kyokai.jp/joseki/suzumoto', siteName: 'www.rakugo-kyokai.jp', category: 'ueno-okachimachi-culture' },

  { type: 'page', url: 'https://www.ameyoko.net/', siteName: 'www.ameyoko.net', category: 'ameyoko-area' },
  { type: 'page', url: 'https://www.ameyoko-plaza.com/', siteName: 'www.ameyoko-plaza.com', category: 'ameyoko-area' },
  { type: 'page', url: 'https://ameyoko-center.jp/', siteName: 'ameyoko-center.jp', category: 'ameyoko-area' },
  { type: 'list', url: 'https://www.ueno-ameyoko.jp/', siteName: 'www.ueno-ameyoko.jp', category: 'ameyoko-area', articleLinkPattern: /\/news\/news_[\w-]+\// },
  { type: 'list', url: 'https://ameyokoinfo.com/news', siteName: 'ameyokoinfo.com', category: 'ameyoko-area', articleLinkPattern: /\/(info|event|feature)\/contents\.html\?l=1&id=\d+/ },

  { type: 'page', url: 'https://www.sumo.or.jp/', siteName: 'www.sumo.or.jp', category: 'ryogoku-area' },
  { type: 'page', url: 'https://www.edo-tokyo-museum.or.jp/', siteName: 'www.edo-tokyo-museum.or.jp', category: 'ryogoku-area' },
  { type: 'list', url: 'https://hokusai-museum.jp/', siteName: 'hokusai-museum.jp', category: 'ryogoku-area', articleLinkPattern: /\/modules\/(Topic\/topics|Event\/events)\/view\/\d+/ },
  { type: 'page', url: 'https://www.touken.or.jp/museum/', siteName: 'www.touken.or.jp', category: 'ryogoku-area' },
  { type: 'list', url: 'https://kokugikan-st.com/', siteName: 'kokugikan-st.com', category: 'ryogoku-area', articleLinkPattern: /\/event\/post-\d+/ },

  { type: 'list', url: 'https://joyfulminowa.com/', siteName: 'joyfulminowa.com', category: 'minowa-area', articleLinkPattern: /\/(event-info|blog-post)\/\d+\// },
  { type: 'list', url: 'https://www.taitogeibun.net/ichiyo/', siteName: 'www.taitogeibun.net', category: 'minowa-area', articleLinkPattern: /\/ichiyo\/oshirase\/news\/\d+\// },

  { type: 'page', url: 'https://www.yanakaginza.com/', siteName: 'www.yanakaginza.com', category: 'yanesen-area' }
]
