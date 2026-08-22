import type { TranslationLocale } from '../../server/utils/articles'

export type UiStringKey =
  | 'nav.logIn'
  | 'nav.logOut'
  | 'nav.profile'
  | 'nav.map'
  | 'login.title'
  | 'login.createAccount'
  | 'login.loginExisting'
  | 'createAccount.title'
  | 'createAccount.disclosure'
  | 'createAccount.understand'
  | 'createAccount.submit'
  | 'createAccount.savePrompt'
  | 'createAccount.saved'
  | 'createAccount.continue'
  | 'importAccount.title'
  | 'importAccount.placeholder'
  | 'importAccount.submit'
  | 'common.loginFailed'
  | 'profile.username'
  | 'profile.joined'
  | 'profile.gender'
  | 'profile.birthYear'
  | 'profile.nationality'
  | 'profile.walletAddress'
  | 'profile.notSet'
  | 'profile.editProfile'
  | 'profile.logOut'
  | 'profile.regenerateAvatar'
  | 'profile.save'
  | 'profile.cancel'
  | 'profile.usernameTaken'
  | 'profile.genericError'
  | 'profile.usernameHint'
  | 'profile.genderMale'
  | 'profile.genderFemale'
  | 'profile.genderOther'
  | 'profile.genderPreferNotToSay'
  | 'profile.nationalityPlaceholder'
  | 'index.newsTitle'
  | 'index.noArticles'
  | 'article.notFound'
  | 'article.source'
  | 'article.sources'
  | 'weather.summary'
  | 'map.enableLocation'
  | 'map.recenterAria'

export const UI_STRINGS: Record<TranslationLocale, Record<UiStringKey, string>> = {
  en: {
    'nav.logIn': 'Log in',
    'nav.logOut': 'Log out',
    'nav.profile': 'Profile',
    'nav.map': 'Map',
    'login.title': 'Log in',
    'login.createAccount': 'Create new account',
    'login.loginExisting': 'Log in with existing account',
    'createAccount.title': 'Create new account',
    'createAccount.disclosure':
      'This private key is the only proof of your account. It is never stored on the server. If you lose it, it cannot be recovered. Never share it with anyone.',
    'createAccount.understand': 'I understand',
    'createAccount.submit': 'Create account',
    'createAccount.savePrompt': 'Make sure to save this private key. It cannot be shown again.',
    'createAccount.saved': 'I saved my private key',
    'createAccount.continue': 'Continue',
    'importAccount.title': 'Log in with existing account',
    'importAccount.placeholder': 'Paste your private key',
    'importAccount.submit': 'Log in',
    'common.loginFailed': 'Login failed.',
    'profile.username': 'Username',
    'profile.joined': 'Joined',
    'profile.gender': 'Gender',
    'profile.birthYear': 'Birth year',
    'profile.nationality': 'Nationality',
    'profile.walletAddress': 'Wallet address',
    'profile.notSet': 'Not set',
    'profile.editProfile': 'Edit profile',
    'profile.logOut': 'Log out',
    'profile.regenerateAvatar': 'Regenerate avatar',
    'profile.save': 'Save',
    'profile.cancel': 'Cancel',
    'profile.usernameTaken': 'This username is already taken.',
    'profile.genericError': 'Something went wrong. Please try again.',
    'profile.usernameHint': 'Use 3-32 letters, numbers, _ or -',
    'profile.genderMale': 'Male',
    'profile.genderFemale': 'Female',
    'profile.genderOther': 'Other',
    'profile.genderPreferNotToSay': 'Prefer not to say',
    'profile.nationalityPlaceholder': 'Select a country',
    'index.newsTitle': 'NEWS',
    'index.noArticles': 'No articles yet.',
    'article.notFound': 'Article not found',
    'article.source': 'Source:',
    'article.sources': 'Sources:',
    'weather.summary': 'High {temp}°C · Rain {pop}%',
    'map.enableLocation': 'Enable location access to see your position on the map.',
    'map.recenterAria': 'Recenter on my location'
  },
  ja: {
    'nav.logIn': 'ログイン',
    'nav.logOut': 'ログアウト',
    'nav.profile': 'プロフィール',
    'nav.map': 'マップ',
    'login.title': 'ログイン',
    'login.createAccount': '新規アカウント作成',
    'login.loginExisting': '既存アカウントでログイン',
    'createAccount.title': '新規アカウント作成',
    'createAccount.disclosure':
      'この秘密鍵はあなたのアカウントの唯一の証明です。サーバーには保存されません。紛失すると二度と復元できません。誰にも教えないでください。',
    'createAccount.understand': '内容を理解しました',
    'createAccount.submit': 'アカウントを新規作成',
    'createAccount.savePrompt': 'この秘密鍵を必ず保存してください。再表示はできません。',
    'createAccount.saved': '秘密鍵を保存しました',
    'createAccount.continue': '続ける',
    'importAccount.title': '既存アカウントでログイン',
    'importAccount.placeholder': '秘密鍵を貼り付け',
    'importAccount.submit': 'ログイン',
    'common.loginFailed': 'ログインに失敗しました',
    'profile.username': 'ユーザー名',
    'profile.joined': '登録日',
    'profile.gender': '性別',
    'profile.birthYear': '生年',
    'profile.nationality': '国籍',
    'profile.walletAddress': 'ウォレットアドレス',
    'profile.notSet': '未設定',
    'profile.editProfile': 'プロフィールを編集',
    'profile.logOut': 'ログアウト',
    'profile.regenerateAvatar': 'アバターを再生成',
    'profile.save': '保存',
    'profile.cancel': 'キャンセル',
    'profile.usernameTaken': 'このユーザー名はすでに使用されています。',
    'profile.genericError': '問題が発生しました。もう一度お試しください。',
    'profile.usernameHint': '3〜32文字の半角英数字、_、-が使用できます',
    'profile.genderMale': '男性',
    'profile.genderFemale': '女性',
    'profile.genderOther': 'その他',
    'profile.genderPreferNotToSay': '回答しない',
    'profile.nationalityPlaceholder': '国を選択',
    'index.newsTitle': 'ニュース',
    'index.noArticles': 'まだ記事がありません。',
    'article.notFound': '記事が見つかりません',
    'article.source': '出典:',
    'article.sources': '出典:',
    'weather.summary': '最高気温 {temp}°C・降水確率 {pop}%',
    'map.enableLocation': '位置情報へのアクセスを許可すると、地図上に現在地が表示されます。',
    'map.recenterAria': '現在地に戻す'
  },
  ko: {
    'nav.logIn': '로그인',
    'nav.logOut': '로그아웃',
    'nav.profile': '프로필',
    'nav.map': '지도',
    'login.title': '로그인',
    'login.createAccount': '새 계정 만들기',
    'login.loginExisting': '기존 계정으로 로그인',
    'createAccount.title': '새 계정 만들기',
    'createAccount.disclosure':
      '이 개인 키는 계정을 증명하는 유일한 수단입니다. 서버에는 저장되지 않습니다. 분실하면 복구할 수 없습니다. 누구에게도 알려주지 마세요.',
    'createAccount.understand': '내용을 이해했습니다',
    'createAccount.submit': '계정 생성',
    'createAccount.savePrompt': '이 개인 키를 반드시 저장하세요. 다시 표시되지 않습니다.',
    'createAccount.saved': '개인 키를 저장했습니다',
    'createAccount.continue': '계속',
    'importAccount.title': '기존 계정으로 로그인',
    'importAccount.placeholder': '개인 키를 붙여넣으세요',
    'importAccount.submit': '로그인',
    'common.loginFailed': '로그인에 실패했습니다.',
    'profile.username': '사용자 이름',
    'profile.joined': '가입일',
    'profile.gender': '성별',
    'profile.birthYear': '출생 연도',
    'profile.nationality': '국적',
    'profile.walletAddress': '지갑 주소',
    'profile.notSet': '설정되지 않음',
    'profile.editProfile': '프로필 수정',
    'profile.logOut': '로그아웃',
    'profile.regenerateAvatar': '아바타 재생성',
    'profile.save': '저장',
    'profile.cancel': '취소',
    'profile.usernameTaken': '이미 사용 중인 사용자 이름입니다.',
    'profile.genericError': '문제가 발생했습니다. 다시 시도해 주세요.',
    'profile.usernameHint': '3~32자의 영문, 숫자, _ 또는 -를 사용하세요',
    'profile.genderMale': '남성',
    'profile.genderFemale': '여성',
    'profile.genderOther': '기타',
    'profile.genderPreferNotToSay': '응답하지 않음',
    'profile.nationalityPlaceholder': '국가 선택',
    'index.newsTitle': '뉴스',
    'index.noArticles': '아직 기사가 없습니다.',
    'article.notFound': '기사를 찾을 수 없습니다',
    'article.source': '출처:',
    'article.sources': '출처:',
    'weather.summary': '최고 기온 {temp}°C · 강수확률 {pop}%',
    'map.enableLocation': '위치 정보 접근을 허용하면 지도에서 현재 위치를 확인할 수 있습니다.',
    'map.recenterAria': '내 위치로 이동'
  },
  'zh-Hant': {
    'nav.logIn': '登入',
    'nav.logOut': '登出',
    'nav.profile': '個人資料',
    'nav.map': '地圖',
    'login.title': '登入',
    'login.createAccount': '建立新帳戶',
    'login.loginExisting': '使用現有帳戶登入',
    'createAccount.title': '建立新帳戶',
    'createAccount.disclosure':
      '此私鑰是您帳戶的唯一證明，伺服器不會儲存。遺失後將無法復原，請勿告訴任何人。',
    'createAccount.understand': '我已了解',
    'createAccount.submit': '建立帳戶',
    'createAccount.savePrompt': '請務必保存此私鑰，之後將無法再次顯示。',
    'createAccount.saved': '我已保存私鑰',
    'createAccount.continue': '繼續',
    'importAccount.title': '使用現有帳戶登入',
    'importAccount.placeholder': '貼上您的私鑰',
    'importAccount.submit': '登入',
    'common.loginFailed': '登入失敗。',
    'profile.username': '使用者名稱',
    'profile.joined': '加入日期',
    'profile.gender': '性別',
    'profile.birthYear': '出生年份',
    'profile.nationality': '國籍',
    'profile.walletAddress': '錢包地址',
    'profile.notSet': '未設定',
    'profile.editProfile': '編輯個人資料',
    'profile.logOut': '登出',
    'profile.regenerateAvatar': '重新產生頭像',
    'profile.save': '儲存',
    'profile.cancel': '取消',
    'profile.usernameTaken': '此使用者名稱已被使用。',
    'profile.genericError': '發生錯誤，請再試一次。',
    'profile.usernameHint': '請使用3-32個英數字、_或-',
    'profile.genderMale': '男性',
    'profile.genderFemale': '女性',
    'profile.genderOther': '其他',
    'profile.genderPreferNotToSay': '不願透露',
    'profile.nationalityPlaceholder': '選擇國家',
    'index.newsTitle': '新聞',
    'index.noArticles': '尚無文章。',
    'article.notFound': '找不到文章',
    'article.source': '來源：',
    'article.sources': '來源：',
    'weather.summary': '最高氣溫 {temp}°C・降雨機率 {pop}%',
    'map.enableLocation': '允許存取位置資訊即可在地圖上顯示您的位置。',
    'map.recenterAria': '回到目前位置'
  },
  'zh-Hans': {
    'nav.logIn': '登录',
    'nav.logOut': '登出',
    'nav.profile': '个人资料',
    'nav.map': '地图',
    'login.title': '登录',
    'login.createAccount': '创建新账户',
    'login.loginExisting': '使用现有账户登录',
    'createAccount.title': '创建新账户',
    'createAccount.disclosure':
      '此私钥是您账户的唯一证明，服务器不会保存。丢失后将无法恢复，请勿告诉任何人。',
    'createAccount.understand': '我已了解',
    'createAccount.submit': '创建账户',
    'createAccount.savePrompt': '请务必保存此私钥，之后将无法再次显示。',
    'createAccount.saved': '我已保存私钥',
    'createAccount.continue': '继续',
    'importAccount.title': '使用现有账户登录',
    'importAccount.placeholder': '粘贴您的私钥',
    'importAccount.submit': '登录',
    'common.loginFailed': '登录失败。',
    'profile.username': '用户名',
    'profile.joined': '加入日期',
    'profile.gender': '性别',
    'profile.birthYear': '出生年份',
    'profile.nationality': '国籍',
    'profile.walletAddress': '钱包地址',
    'profile.notSet': '未设置',
    'profile.editProfile': '编辑个人资料',
    'profile.logOut': '登出',
    'profile.regenerateAvatar': '重新生成头像',
    'profile.save': '保存',
    'profile.cancel': '取消',
    'profile.usernameTaken': '此用户名已被使用。',
    'profile.genericError': '发生错误，请重试。',
    'profile.usernameHint': '请使用3-32个英数字、_或-',
    'profile.genderMale': '男性',
    'profile.genderFemale': '女性',
    'profile.genderOther': '其他',
    'profile.genderPreferNotToSay': '不愿透露',
    'profile.nationalityPlaceholder': '选择国家',
    'index.newsTitle': '新闻',
    'index.noArticles': '暂无文章。',
    'article.notFound': '未找到文章',
    'article.source': '来源：',
    'article.sources': '来源：',
    'weather.summary': '最高气温 {temp}°C・降雨概率 {pop}%',
    'map.enableLocation': '允许访问位置信息即可在地图上显示您的位置。',
    'map.recenterAria': '回到当前位置'
  },
  pt: {
    'nav.logIn': 'Entrar',
    'nav.logOut': 'Sair',
    'nav.profile': 'Perfil',
    'nav.map': 'Mapa',
    'login.title': 'Entrar',
    'login.createAccount': 'Criar nova conta',
    'login.loginExisting': 'Entrar com uma conta existente',
    'createAccount.title': 'Criar nova conta',
    'createAccount.disclosure':
      'Esta chave privada é a única prova da sua conta. Ela nunca é armazenada no servidor. Se você perdê-la, não será possível recuperá-la. Nunca a compartilhe com ninguém.',
    'createAccount.understand': 'Eu entendi',
    'createAccount.submit': 'Criar conta',
    'createAccount.savePrompt': 'Certifique-se de salvar esta chave privada. Ela não poderá ser exibida novamente.',
    'createAccount.saved': 'Eu salvei minha chave privada',
    'createAccount.continue': 'Continuar',
    'importAccount.title': 'Entrar com uma conta existente',
    'importAccount.placeholder': 'Cole sua chave privada',
    'importAccount.submit': 'Entrar',
    'common.loginFailed': 'Falha ao entrar.',
    'profile.username': 'Nome de usuário',
    'profile.joined': 'Ingressou em',
    'profile.gender': 'Gênero',
    'profile.birthYear': 'Ano de nascimento',
    'profile.nationality': 'Nacionalidade',
    'profile.walletAddress': 'Endereço da carteira',
    'profile.notSet': 'Não definido',
    'profile.editProfile': 'Editar perfil',
    'profile.logOut': 'Sair',
    'profile.regenerateAvatar': 'Gerar novo avatar',
    'profile.save': 'Salvar',
    'profile.cancel': 'Cancelar',
    'profile.usernameTaken': 'Este nome de usuário já está em uso.',
    'profile.genericError': 'Algo deu errado. Tente novamente.',
    'profile.usernameHint': 'Use de 3 a 32 letras, números, _ ou -',
    'profile.genderMale': 'Masculino',
    'profile.genderFemale': 'Feminino',
    'profile.genderOther': 'Outro',
    'profile.genderPreferNotToSay': 'Prefiro não dizer',
    'profile.nationalityPlaceholder': 'Selecione um país',
    'index.newsTitle': 'NOTÍCIAS',
    'index.noArticles': 'Ainda não há artigos.',
    'article.notFound': 'Artigo não encontrado',
    'article.source': 'Fonte:',
    'article.sources': 'Fontes:',
    'weather.summary': 'Máxima {temp}°C · Chuva {pop}%',
    'map.enableLocation': 'Ative o acesso à localização para ver sua posição no mapa.',
    'map.recenterAria': 'Centralizar na minha localização'
  }
}
