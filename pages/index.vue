<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WeatherForecast } from '../server/utils/weather'
import { useSwipe } from '../composables/useSwipe'

const route = useRoute()
const router = useRouter()
const { locale } = useArticleLocale()

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
    router.push({ path: '/', query: { page: value } })
  }
})

const { data } = await useFetch('/api/articles', {
  query: { page, lang: locale },
  watch: [page, locale]
})

const { data: weather } = await useFetch<WeatherForecast | null>('/api/weather')
</script>

<template>
  <div ref="pageRoot" data-swipe-target class="max-w-5xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold text-primary mb-6">NEWS</h1>
    <WeatherCard
      v-if="weather"
      :weather-emoji="weather.weatherEmoji"
      :weather-label="weather.weatherLabel"
      :pop="weather.pop"
      :high-temp="weather.highTemp"
      class="mb-6"
    />
    <p v-if="data && data.articles.length === 0" class="text-muted">
      No articles yet.
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <ArticleCard
        v-for="article in data?.articles"
        :id="article.id"
        :key="article.id"
        :title="article.title"
        :image-url="article.image_url"
        :published-at="article.published_at ?? ''"
      />
    </div>
    <div v-if="data && data.total > data.pageSize" class="flex justify-center mt-8">
      <UPagination v-model:page="page" :total="data.total" :items-per-page="data.pageSize" />
    </div>
  </div>
</template>
