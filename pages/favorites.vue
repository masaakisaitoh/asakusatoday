<script setup lang="ts">
import { computed } from 'vue'

const route = useRoute()
const router = useRouter()
const { locale } = useArticleLocale()
const { t } = useUiText()

const page = computed({
  get: () => Number(route.query.page) || 1,
  set: (value: number) => {
    router.push({ path: '/favorites', query: { ...route.query, page: value } })
  }
})

const { data, error } = await useFetch('/api/favorites', {
  query: { page, lang: locale },
  watch: [page, locale]
})

if (error.value) {
  await navigateTo('/login')
}
</script>

<template>
  <div class="h-full overflow-y-auto max-w-5xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold text-primary mb-6">{{ t('favorites.title') }}</h1>
    <p v-if="data && data.articles.length === 0" class="text-muted">
      {{ t('favorites.empty') }}
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
