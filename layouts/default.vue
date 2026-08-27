<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { SUPPORTED_LOCALES, type TranslationLocale } from '../server/utils/articles'
import { safeJsonLd } from '../utils/seo'

const rootEl = ref<HTMLElement | null>(null)
let rootStyleObserver: MutationObserver | null = null

const route = useRoute()
const hidesAdBanner = computed(() => route.path.startsWith('/admin') || route.path.startsWith('/map'))

const { locale, setLocale, loadStoredLocale } = useArticleLocale()
const { t } = useUiText()

const config = useRuntimeConfig()
useHead({
  script: [
    {
      type: 'application/ld+json',
      innerHTML: safeJsonLd({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'ASAKUSA TODAY',
        url: config.public.siteUrl
      })
    }
  ]
})

const localeLabels: Record<TranslationLocale, string> = {
  ja: '日本語',
  en: 'English',
  ko: '한국어',
  'zh-Hant': '繁體中文',
  'zh-Hans': '简体中文',
  pt: 'Português'
}

const { data: user } = useFetch('/api/user/me', { key: 'current-user' })

async function logout(): Promise<void> {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}

const userMenuItems = computed(() => [
  [
    { label: t('nav.profile'), to: '/profile' },
    { label: t('nav.favorites'), to: '/favorites' },
    { label: t('nav.map'), to: '/map' }
  ],
  [{ label: t('nav.logOut'), onSelect: logout }]
])

onMounted(() => {
  loadStoredLocale()
  const el = rootEl.value
  if (el) {
    // AdSense's ad-fill script sometimes forces `height: auto !important;
    // min-height: 0px !important;` directly onto this element while
    // measuring the page for ad placement, collapsing the whole app shell
    // (main's `flex-1` has nothing to grow into once its flex parent's
    // height is cleared). We never set an inline style on this element
    // ourselves, so any inline height/min-height here is external
    // interference — strip it and let the `h-dvh` utility class win back.
    rootStyleObserver = new MutationObserver(() => {
      if (el.style.height || el.style.minHeight) {
        el.style.removeProperty('height')
        el.style.removeProperty('min-height')
      }
    })
    rootStyleObserver.observe(el, { attributes: true, attributeFilter: ['style'] })
  }
})

onUnmounted(() => {
  rootStyleObserver?.disconnect()
  rootStyleObserver = null
})

function onLocaleChange(event: Event): void {
  setLocale((event.target as HTMLSelectElement).value as TranslationLocale)
}
</script>

<template>
  <div ref="rootEl" class="h-dvh flex flex-col overflow-x-hidden bg-washi text-ink-black">
    <header class="border-b border-default">
      <div class="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between">
        <NuxtLink to="/" class="flex min-w-0 items-center gap-2 text-xl font-bold text-primary no-underline">
          <img src="/favicon.png" alt="" class="h-10 w-10 shrink-0 rounded-full" width="40" height="40" />
          <span class="truncate">ASAKUSA TODAY</span>
        </NuxtLink>
        <div class="flex shrink-0 items-center gap-3">
          <UDropdownMenu v-if="user" :items="userMenuItems" :content="{ align: 'end' }">
            <button
              type="button"
              class="h-9 w-9 rounded-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="User menu"
            >
              <UserAvatar :seed="user.avatar_seed" :size="36" />
            </button>
          </UDropdownMenu>
          <NuxtLink v-else to="/login" class="text-sm text-primary no-underline">{{ t('nav.logIn') }}</NuxtLink>
        </div>
      </div>
    </header>
    <main class="flex-1 min-h-0 flex flex-col relative overflow-hidden">
      <slot />
    </main>
    <AdBanner v-if="!hidesAdBanner" />
    <footer class="border-t border-default">
      <div class="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between text-sm text-muted">
        <span>© ASAKUSA TODAY</span>
        <select
          class="rounded border border-default bg-default px-2 py-1 text-sm"
          :value="locale"
          @change="onLocaleChange"
        >
          <option v-for="l in SUPPORTED_LOCALES" :key="l" :value="l">{{ localeLabels[l] }}</option>
        </select>
      </div>
    </footer>
  </div>
</template>
