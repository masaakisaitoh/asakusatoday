<script setup lang="ts">
const { data: drafts, error, refresh } = await useFetch('/api/admin/drafts')

async function publish(id: number) {
  await $fetch(`/api/admin/drafts/${id}/publish`, { method: 'POST' })
  await refresh()
}

async function reject(id: number) {
  await $fetch(`/api/admin/drafts/${id}/reject`, { method: 'POST' })
  await refresh()
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold text-primary mb-6">Draft Review</h1>
    <p v-if="error" class="text-muted">You do not have access to this page.</p>
    <template v-else>
      <p v-if="drafts && drafts.length === 0" class="text-muted">No drafts to review.</p>
      <UCard v-for="draft in drafts" :key="draft.id" class="mb-4">
        <h2 class="text-lg font-bold text-highlighted mb-2">{{ draft.title }}</h2>
        <p class="mb-4 whitespace-pre-wrap">{{ draft.body }}</p>
        <p class="text-sm text-muted mb-4">
          Sources:
          <template v-for="(source, index) in draft.sources" :key="source.url">
            <a :href="source.url" target="_blank" rel="noopener" class="text-primary underline">{{ source.siteName }}</a><span v-if="index < draft.sources.length - 1">, </span>
          </template>
        </p>
        <div class="flex gap-2">
          <UButton color="secondary" @click="publish(draft.id)">Approve</UButton>
          <UButton variant="outline" @click="reject(draft.id)">Reject</UButton>
        </div>
      </UCard>
    </template>
  </div>
</template>
