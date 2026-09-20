<script setup lang="ts">
import type { TrainLineStatus, TrainStatusLevel } from '../server/utils/trainStatus'
import { TRAIN_LINE_META } from '../utils/trainLineMeta'

defineProps<{
  lines: TrainLineStatus[]
}>()

const { t } = useUiText()

const statusKeyMap = {
  normal: 'train.statusNormal',
  delayed: 'train.statusDelayed',
  suspended: 'train.statusSuspended',
  disrupted: 'train.statusDisrupted'
} as const satisfies Record<TrainStatusLevel, string>
</script>

<template>
  <UCard v-if="lines.length > 0" :ui="{ body: 'p-4' }">
    <ul class="space-y-2">
      <li v-for="line in lines" :key="line.lineId" :data-line-id="line.lineId" class="flex items-center gap-3 text-sm">
        <span class="flex h-7 w-7 shrink-0 items-center justify-center">
          <img
            v-if="TRAIN_LINE_META[line.lineId].logo"
            :src="TRAIN_LINE_META[line.lineId].logo || undefined"
            :alt="line.lineName"
            width="28"
            height="28"
            class="h-7 w-7"
          />
          <span v-else class="text-xs font-bold text-muted">{{ TRAIN_LINE_META[line.lineId].fallbackLabel }}</span>
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <span class="truncate text-highlighted">{{ line.lineName }}</span>
            <span :class="line.status === 'normal' ? 'text-muted' : 'text-warning-700 dark:text-warning-400 font-bold'">
              <template v-if="line.status !== 'normal'">⚠️ </template>{{ t(statusKeyMap[line.status]) }}
            </span>
          </div>
          <a
            v-if="line.status !== 'normal'"
            :href="TRAIN_LINE_META[line.lineId].officialUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs text-primary underline"
          >{{ t('train.viewOfficial') }}</a>
        </div>
      </li>
    </ul>
    <p class="mt-3 text-xs text-muted">
      Data and line symbols: Tokyo Metro, Bureau of Transportation Tokyo Metropolitan Government (CC BY 4.0), Metropolitan Intercity Railway Company,
      via the Public Transportation Open Data Center
      (<a href="https://www.odpt.org/" target="_blank" rel="noopener noreferrer" class="underline">ODPT</a>).
      Line symbols have been cropped and resized from the originals.
    </p>
  </UCard>
</template>
