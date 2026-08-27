<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { truncateForDescription, safeJsonLd, toIso8601 } from '../../utils/seo'

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

const { data: user } = useFetch('/api/user/me', { key: 'current-user' })

const favorited = ref(article.value?.is_favorited ?? false)
const favoriteCount = ref(article.value?.favorite_count ?? 0)
watch(article, (value) => {
  if (value) {
    favorited.value = value.is_favorited
    favoriteCount.value = value.favorite_count
  }
})

const config = useRuntimeConfig()
const description = computed(() =>
  article.value ? truncateForDescription(article.value.body) : undefined
)
const canonicalUrl = computed(() => `${config.public.siteUrl}/articles/${route.params.id}`)
const ogImage = computed(() => article.value?.image_url || `${config.public.siteUrl}/logo.png`)

useSeoMeta({
  title: () => article.value?.title,
  description,
  ogTitle: () => article.value?.title,
  ogDescription: description,
  ogType: 'article',
  ogUrl: canonicalUrl,
  ogImage
})

useHead({
  link: [{ rel: 'canonical', href: canonicalUrl }],
  script: () =>
    article.value
      ? [
          {
            type: 'application/ld+json',
            innerHTML: safeJsonLd({
              '@context': 'https://schema.org',
              '@type': 'NewsArticle',
              headline: article.value.title,
              image: [ogImage.value],
              datePublished: toIso8601(article.value.published_at),
              author: { '@type': 'Organization', name: 'ASAKUSA TODAY' },
              publisher: {
                '@type': 'Organization',
                name: 'ASAKUSA TODAY',
                logo: { '@type': 'ImageObject', url: `${config.public.siteUrl}/favicon.png` }
              }
            })
          }
        ]
      : []
})

const togglingFavorite = ref(false)

async function toggleFavorite(): Promise<void> {
  if (!user.value) {
    await navigateTo('/login')
    return
  }
  togglingFavorite.value = true
  try {
    const result = await $fetch(`/api/articles/${route.params.id}/favorite`, { method: 'POST' })
    favorited.value = result.favorited
    favoriteCount.value = result.favorite_count
  } catch (e: any) {
    if (e?.statusCode === 401) {
      await navigateTo('/login')
    }
  } finally {
    togglingFavorite.value = false
  }
}
</script>

<template>
  <div v-if="article" class="h-full w-full overflow-y-auto max-w-2xl mx-auto px-4 py-6">
    <UCard :ui="{ body: 'p-4 sm:p-6', header: 'p-0' }">
      <template v-if="article.image_url" #header>
        <img :src="article.image_url" :alt="article.title" class="w-full aspect-video object-cover">
      </template>
      <div class="flex items-center justify-between mb-2">
        <UBadge
          color="secondary"
          variant="subtle"
          size="sm"
          class="cursor-pointer hover:brightness-95"
          @click="navigateTo({ path: '/', query: { category: article.category } })"
        >
          {{ categoryLabel(article.category) }}
        </UBadge>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="p-2 min-h-11 min-w-11 flex items-center justify-center disabled:opacity-50"
            :aria-label="favorited ? t('article.removeFavorite') : t('article.addFavorite')"
            :aria-pressed="favorited"
            :disabled="togglingFavorite"
            @click="toggleFavorite"
          >
            <svg
              viewBox="0 0 24 24"
              class="h-6 w-6"
              :class="favorited ? 'fill-primary stroke-primary' : 'fill-none stroke-current text-muted'"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M12 21s-6.72-4.35-9.33-8.28C1.05 10.36 1.53 7.02 4.24 5.32c2.2-1.38 5-.86 6.53 1.13L12 8.1l1.23-1.65c1.53-1.99 4.33-2.51 6.53-1.13 2.71 1.7 3.19 5.04 1.57 7.4C18.72 16.65 12 21 12 21z"
              />
            </svg>
          </button>
          <span class="text-sm text-muted">{{ favoriteCount }}</span>
        </div>
      </div>
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
