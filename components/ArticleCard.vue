<script setup lang="ts">
defineProps<{
  id: number
  title: string
  publishedAt: string
  imageUrl?: string | null
}>()
</script>

<template>
  <NuxtLink :to="`/articles/${id}`" class="block h-full no-underline">
    <UCard class="h-full transition hover:ring-2 hover:ring-secondary" :ui="{ body: 'p-4', header: 'p-0' }">
      <template v-if="imageUrl" #header>
        <img :src="imageUrl" :alt="title" class="aspect-video w-full object-cover">
      </template>
      <h2 class="line-clamp-2 font-bold text-highlighted">{{ title }}</h2>
      <time class="text-sm text-muted">{{ publishedAt }}</time>
    </UCard>
  </NuxtLink>
</template>
