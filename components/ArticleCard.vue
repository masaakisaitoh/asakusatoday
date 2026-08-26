<script setup lang="ts">
const { categoryLabel } = useUiText()

const props = defineProps<{
  id: number
  title: string
  publishedAt: string
  category: string
  imageUrl?: string | null
}>()

function goToCategory(): void {
  navigateTo({ path: '/', query: { category: props.category } })
}
</script>

<template>
  <NuxtLink :to="`/articles/${id}`" class="block h-full min-w-0 no-underline">
    <UCard class="h-full transition hover:ring-2 hover:ring-secondary" :ui="{ body: 'p-3', header: 'p-0' }">
      <template v-if="imageUrl" #header>
        <img :src="imageUrl" :alt="title" class="aspect-video w-full object-cover">
      </template>
      <UBadge
        color="secondary"
        variant="subtle"
        size="sm"
        class="mb-2 cursor-pointer hover:brightness-95"
        @click.stop.prevent="goToCategory"
      >
        {{ categoryLabel(category) }}
      </UBadge>
      <h2 class="line-clamp-2 wrap-anywhere font-bold text-highlighted">{{ title }}</h2>
      <time class="text-sm text-muted">{{ publishedAt }}</time>
    </UCard>
  </NuxtLink>
</template>
