<script setup lang="ts">
defineProps<{
  weatherEmoji: string
  weatherLabel: string
  pop: number
  highTemp: number
}>()
</script>

<template>
  <UCard :ui="{ body: 'p-4' }">
    <div class="flex items-center gap-3">
      <span class="text-3xl">{{ weatherEmoji }}</span>
      <div class="text-sm text-muted">
        <p class="text-highlighted font-bold">{{ weatherLabel }}</p>
        <p>High {{ highTemp }}°C · Rain {{ pop }}%</p>
      </div>
    </div>
  </UCard>
</template>
