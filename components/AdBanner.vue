<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

declare global {
  interface Window {
    adsbygoogle: unknown[]
  }
}

const isDesktop = ref(false)
const mounted = ref(false)

onMounted(async () => {
  // Decide the breakpoint once on mount instead of shipping both mobile and
  // desktop <ins> tags and hiding one with CSS: AdSense measures the hidden
  // container's width as 0 ("No slot size for availableWidth=0"), and
  // hiding a rendered ad unit with display:none also risks violating
  // AdSense policy. Rendering only the applicable <ins> avoids both.
  isDesktop.value = window.matchMedia('(min-width: 768px)').matches
  mounted.value = true
  await nextTick()
  try {
    ;(window.adsbygoogle = window.adsbygoogle || []).push({})
  } catch {
    // AdSense script blocked or not yet loaded
  }
})
</script>

<template>
  <div class="border-t border-default bg-default">
    <div class="max-w-5xl mx-auto px-4 py-2">
      <div class="ad-slot">
        <ins
          v-if="mounted"
          class="adsbygoogle"
          style="display: block"
          data-ad-client="ca-pub-4995620565805965"
          :data-ad-slot="isDesktop ? '3896175647' : '4197382370'"
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
  height: calc(var(--footer-height, 3rem) * 1.5) !important;
}

@media (min-width: 768px) {
  .ad-slot {
    height: calc(var(--footer-height, 3rem) * 2) !important;
  }
}
</style>
