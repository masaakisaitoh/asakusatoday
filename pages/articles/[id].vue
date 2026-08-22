<script setup lang="ts">
const route = useRoute()
const { locale } = useArticleLocale()
const { t } = useUiText()
const { data: article, error } = await useFetch(`/api/articles/${route.params.id}`, {
  query: { lang: locale },
  watch: [locale]
})

if (error.value) {
  throw createError({ statusCode: error.value.statusCode || 404, statusMessage: t('article.notFound') })
}
</script>

<template>
  <div v-if="article" class="max-w-2xl mx-auto px-4 py-8">
    <img
      v-if="article.image_url"
      :src="article.image_url"
      :alt="article.title"
      class="w-full aspect-video object-cover rounded-lg mb-6"
    >
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
  </div>
</template>
