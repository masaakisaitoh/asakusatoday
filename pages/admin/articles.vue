<script setup lang="ts">
import { computed, ref } from 'vue'

useSeoMeta({ title: 'Article Management', robots: 'noindex, nofollow' })
const route = useRoute()
const router = useRouter()

const page = computed({
  get: () => Number(route.query.page) || 1,
  set: (value: number) => {
    router.push({ path: '/admin/articles', query: { ...route.query, page: value } })
  }
})

const { data, error, refresh } = await useFetch('/api/admin/articles', {
  query: { page },
  watch: [page]
})

const pendingDeleteId = ref<number | null>(null)
const deleteModalOpen = computed({
  get: () => pendingDeleteId.value !== null,
  set: (value: boolean) => {
    if (!value) pendingDeleteId.value = null
  }
})

function requestDelete(id: number) {
  pendingDeleteId.value = id
}

const deleting = ref(false)
async function confirmDelete() {
  if (pendingDeleteId.value === null || deleting.value) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/articles/${pendingDeleteId.value}`, { method: 'DELETE' })
  } finally {
    deleting.value = false
    pendingDeleteId.value = null
    await refresh()
  }
}
</script>

<template>
  <div class="h-full w-full overflow-y-auto max-w-3xl mx-auto px-4 py-8">
    <AdminNav />
    <h1 class="text-2xl font-bold text-primary mb-6">Article Management</h1>
    <p v-if="error" class="text-muted">You do not have access to this page.</p>
    <template v-else>
      <p v-if="data && data.articles.length === 0" class="text-muted">No articles yet.</p>
      <UCard v-for="article in data?.articles" :key="article.id" class="mb-4">
        <div class="flex items-center gap-2 mb-2">
          <UBadge :color="article.status === 'published' ? 'success' : 'neutral'" variant="subtle">
            {{ article.status }}
          </UBadge>
          <span class="text-sm text-muted">{{ article.category }}</span>
        </div>
        <h2 class="text-lg font-bold text-highlighted mb-2">{{ article.title }}</h2>
        <p class="text-sm text-muted mb-4">
          Created: {{ article.created_at }}<span v-if="article.published_at"> · Published: {{ article.published_at }}</span>
        </p>
        <UButton v-if="article.status === 'published'" color="error" variant="outline" @click="requestDelete(article.id)">
          Delete
        </UButton>
      </UCard>
      <div v-if="data && data.total > data.pageSize" class="flex justify-center mt-8">
        <UPagination v-model:page="page" :total="data.total" :items-per-page="data.pageSize" />
      </div>
    </template>

    <UModal v-model:open="deleteModalOpen" title="Delete article?" description="This cannot be undone.">
      <template #footer="{ close }">
        <UButton color="neutral" variant="outline" @click="close">Cancel</UButton>
        <UButton color="error" :loading="deleting" @click="confirmDelete">Delete</UButton>
      </template>
    </UModal>
  </div>
</template>
