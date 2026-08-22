<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { SUPPORTED_LOCALES, type TranslationLocale } from '../server/utils/articles'

const { locale, setLocale, loadStoredLocale } = useArticleLocale()
const { t } = useUiText()

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
    { label: t('nav.map'), to: '/map' }
  ],
  [{ label: t('nav.logOut'), onSelect: logout }]
])

onMounted(() => {
  loadStoredLocale()
})

function onLocaleChange(event: Event): void {
  setLocale((event.target as HTMLSelectElement).value as TranslationLocale)
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-washi text-ink-black">
    <header class="border-b border-default">
      <div class="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <NuxtLink to="/" class="flex items-center gap-2 text-xl font-bold text-primary no-underline">
          <img src="/favicon.png" alt="" class="h-10 w-10 rounded-full" width="40" height="40" />
          <span>ASAKUSA TODAY</span>
        </NuxtLink>
        <div class="flex items-center gap-3">
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
    <footer class="border-t border-default">
      <div class="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between text-sm text-muted">
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
