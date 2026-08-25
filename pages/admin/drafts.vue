<script setup lang="ts">
import { computed } from 'vue'

useSeoMeta({ title: 'Draft Review', robots: 'noindex, nofollow' })
const route = useRoute()
const router = useRouter()

const page = computed({
  get: () => Number(route.query.page) || 1,
  set: (value: number) => {
    router.push({ path: '/admin/drafts', query: { ...route.query, page: value } })
  }
})

const { data, error, refresh } = await useFetch('/api/admin/drafts', {
  query: { page },
  watch: [page]
})

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
  <div class="h-full overflow-y-auto max-w-3xl mx-auto px-4 py-8">
    <AdminNav />
    <h1 class="text-2xl font-bold text-primary mb-6">Draft Review</h1>
    <p v-if="error" class="text-muted">You do not have access to this page.</p>
    <template v-else>
      <p v-if="data && data.articles.length === 0" class="text-muted">No drafts to review.</p>
      <UCard v-for="draft in data?.articles" :key="draft.id" class="mb-4">
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
      <div v-if="data && data.total > data.pageSize" class="flex justify-center mt-8">
        <UPagination v-model:page="page" :total="data.total" :items-per-page="data.pageSize" />
      </div>
    </template>
  </div>
</template>
