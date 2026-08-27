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
      <div class="ad-slot ad-slot--mobile block md:hidden">
        <ins
          class="adsbygoogle"
          style="display: block"
          data-ad-client="ca-pub-4995620565805965"
          data-ad-slot="4197382370"
          data-ad-format="auto"
          data-full-width-responsive="true"
        ></ins>
      </div>
      <div class="ad-slot ad-slot--desktop hidden md:block">
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

<style scoped>
/* AdSense's fill script sets inline styles on this container once a real ad
   creative loads (only happens in production; ads are blocked in local dev),
   overriding plain-priority overflow-hidden/height and letting the unit grow
   past its intended fixed size. `!important` here beats any non-important
   inline style AdSense injects afterward. */
.ad-slot {
  overflow: hidden !important;
}

.ad-slot--mobile {
  height: calc(var(--footer-height, 3rem) * 1.5) !important;
}

.ad-slot--desktop {
  height: calc(var(--footer-height, 3rem) * 2) !important;
}
</style>
