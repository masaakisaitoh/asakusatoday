<script setup lang="ts">
import { computed } from 'vue'

useSeoMeta({ title: 'Source Management', robots: 'noindex, nofollow' })
const route = useRoute()
const router = useRouter()

const page = computed({
  get: () => Number(route.query.page) || 1,
  set: (value: number) => {
    router.push({ path: '/admin/sources', query: { ...route.query, page: value } })
  }
})

const { data, error } = await useFetch('/api/admin/sources', {
  query: { page },
  watch: [page]
})
</script>

<template>
  <div class="h-full overflow-y-auto max-w-3xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold text-primary mb-6">Source Management</h1>
    <p v-if="error" class="text-muted">You do not have access to this page.</p>
    <template v-else>
      <p v-if="data && data.sources.length === 0" class="text-muted">No sources yet.</p>
      <UCard v-for="source in data?.sources" :key="source.id" class="mb-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-sm text-muted">{{ source.site_name }}</span>
          <span class="text-sm text-muted">·</span>
          <span class="text-sm text-muted">{{ source.category }}</span>
          <UBadge :color="source.processed_at ? 'success' : 'neutral'" variant="subtle">
            {{ source.processed_at ? `Processed: ${source.processed_at}` : 'Unprocessed' }}
          </UBadge>
        </div>
        <a
          :href="source.url"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary break-all underline"
        >{{ source.url }}</a>
        <p class="text-sm text-muted mt-2">Fetched: {{ source.fetched_at }}</p>
      </UCard>
      <div v-if="data && data.total > data.pageSize" class="flex justify-center mt-8">
        <UPagination v-model:page="page" :total="data.total" :items-per-page="data.pageSize" />
      </div>
    </template>
  </div>
</template>
