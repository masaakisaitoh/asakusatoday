<script setup lang="ts">
const links = [
  { to: '/admin/drafts', label: 'Drafts' },
  { to: '/admin/articles', label: 'Articles' },
  { to: '/admin/sources', label: 'Sources' }
]
</script>

<template>
  <nav class="flex gap-4 mb-6 text-sm">
    <NuxtLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      class="text-muted hover:text-primary"
      active-class="text-primary font-bold"
    >
      {{ link.label }}
    </NuxtLink>
  </nav>
</template>
