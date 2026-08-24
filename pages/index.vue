<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WeatherForecast } from '../server/utils/weather'
import { useSwipe } from '../composables/useSwipe'

const route = useRoute()
const router = useRouter()
const { locale } = useArticleLocale()
const { t, categoryLabel } = useUiText()

const config = useRuntimeConfig()
useSeoMeta({
  title: 'Local News from Asakusa',
  ogUrl: `${config.public.siteUrl}/`
})

const pageRoot = ref<HTMLElement | null>(null)
const transitionDirection = useState<'forward' | 'back'>('swipeTransitionDirection', () => 'forward')

useSwipe(pageRoot, {
  onSwipeLeft: () => {
    transitionDirection.value = 'forward'
    navigateTo('/map')
  }
})

const page = computed({
  get: () => Number(route.query.page) || 1,
  set: (value: number) => {
    router.push({ path: '/', query: { ...route.query, page: value } })
  }
})

const categoryFilter = computed(() => (typeof route.query.category === 'string' ? route.query.category : undefined))

const { data } = await useFetch('/api/articles', {
  query: { page, lang: locale, category: categoryFilter },
  watch: [page, locale, categoryFilter]
})

const { data: weather } = await useFetch<WeatherForecast | null>('/api/weather')
</script>

<template>
  <div ref="pageRoot" data-swipe-target class="h-full overflow-y-auto max-w-5xl mx-auto px-4 py-8">
    <WeatherCard
      v-if="weather"
      :weather-emoji="weather.weatherEmoji"
      :weather-label="weather.weatherLabel"
      :pop="weather.pop"
      :high-temp="weather.highTemp"
      class="mb-6"
    />
    <h1 class="text-2xl font-bold text-primary" :class="categoryFilter ? 'mb-2' : 'mb-6'">
      {{ t('index.newsTitle') }}
    </h1>
    <div v-if="categoryFilter" class="mb-6 flex items-center gap-2">
      <UBadge color="secondary" variant="subtle" size="sm">{{ categoryLabel(categoryFilter) }}</UBadge>
      <NuxtLink to="/" class="text-sm text-primary underline">{{ t('index.clearFilter') }}</NuxtLink>
    </div>
    <p v-if="data && data.articles.length === 0" class="text-muted">
      {{ t('index.noArticles') }}
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <ArticleCard
        v-for="article in data?.articles"
        :id="article.id"
        :key="article.id"
        :title="article.title"
        :image-url="article.image_url"
        :published-at="article.published_at ?? ''"
        :category="article.category"
      />
    </div>
    <div v-if="data && data.total > data.pageSize" class="flex justify-center mt-8">
      <UPagination v-model:page="page" :total="data.total" :items-per-page="data.pageSize" />
    </div>
  </div>
</template>
