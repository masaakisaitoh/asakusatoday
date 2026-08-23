<script setup lang="ts">
const route = useRoute()
const { locale } = useArticleLocale()
const { t, categoryLabel } = useUiText()
const { data: article, error } = await useFetch(`/api/articles/${route.params.id}`, {
  query: { lang: locale },
  watch: [locale]
})

if (error.value) {
  throw createError({ statusCode: error.value.statusCode || 404, statusMessage: t('article.notFound') })
}
</script>

<template>
  <div v-if="article" class="h-full overflow-y-auto max-w-2xl mx-auto px-4 py-6">
    <UCard :ui="{ body: 'p-4 sm:p-6', header: 'p-0' }">
      <template v-if="article.image_url" #header>
        <img :src="article.image_url" :alt="article.title" class="w-full aspect-video object-cover">
      </template>
      <UBadge
        color="secondary"
        variant="subtle"
        size="sm"
        class="mb-2 cursor-pointer hover:brightness-95"
        @click="navigateTo({ path: '/', query: { category: article.category } })"
      >
        {{ categoryLabel(article.category) }}
      </UBadge>
      <h1 class="text-3xl font-bold text-highlighted mb-2">{{ article.title }}</h1>
      <time class="text-sm text-muted">{{ article.published_at }}</time>
      <p class="mt-6 leading-relaxed whitespace-pre-wrap">{{ article.body }}</p>
      <p class="mt-8 pt-4 border-t border-default text-sm text-muted">
        <template v-if="article.sources.length > 1">{{ t('article.sources') + ' ' }}</template>
        <template v-else>{{ t('article.source') + ' ' }}</template>
        <template v-for="(source, index) in article.sources" :key="source.url">
          <a :href="source.url" target="_blank" rel="noopener" class="text-primary underline">{{ source.siteName }}</a><span v-if="index < article.sources.length - 1">, </span>
        </template>
      </p>
    </UCard>
  </div>
</template>
