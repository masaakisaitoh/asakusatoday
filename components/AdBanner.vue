<script setup lang="ts">
import { onMounted } from 'vue'

declare global {
  interface Window {
    adsbygoogle: unknown[]
  }
}

onMounted(() => {
  try {
    ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    ;(window.adsbygoogle = window.adsbygoogle || []).push({})
  } catch {
    // AdSense script blocked or not yet loaded
  }
})
</script>

<template>
  <div class="border-t border-default bg-default">
    <div class="max-w-5xl mx-auto px-4 py-2">
      <div class="block md:hidden">
        <ins
          class="adsbygoogle"
          style="display: block"
          data-ad-client="ca-pub-4995620565805965"
          data-ad-slot="4197382370"
          data-ad-format="auto"
          data-full-width-responsive="true"
        ></ins>
      </div>
      <div class="hidden md:block">
        <ins
          class="adsbygoogle"
          style="display: block"
          data-ad-client="ca-pub-4995620565805965"
          data-ad-slot="3896175647"
          data-ad-format="auto"
          data-full-width-responsive="true"
        ></ins>
      </div>
    </div>
  </div>
</template>
