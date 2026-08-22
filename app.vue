<script setup lang="ts">
const transitionDirection = useState<'forward' | 'back'>('swipeTransitionDirection', () => 'forward')
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage :transition="{ name: `slide-${transitionDirection}` }" />
    </NuxtLayout>
  </UApp>
</template>
