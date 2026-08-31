<script setup lang="ts">
import { computed } from 'vue'
import type { TrainLineStatus, TrainStatusLevel } from '../server/utils/trainStatus'

const props = defineProps<{
  lines: TrainLineStatus[]
}>()

const { t } = useUiText()

const TOTAL_LINE_COUNT = 5

const statusKeyMap: Record<Exclude<TrainStatusLevel, 'normal'>, 'train.statusDelayed' | 'train.statusSuspended' | 'train.statusDisrupted'> = {
  delayed: 'train.statusDelayed',
  suspended: 'train.statusSuspended',
  disrupted: 'train.statusDisrupted'
}

const disruptedLines = computed(() => props.lines.filter((line) => line.status !== 'normal'))

const allNormal = computed(
  () => props.lines.length === TOTAL_LINE_COUNT && disruptedLines.value.length === 0
)

const shouldRender = computed(() => allNormal.value || disruptedLines.value.length > 0)
</script>

<template>
  <UCard v-if="shouldRender" :ui="{ body: 'p-4' }">
    <p v-if="allNormal" class="text-sm text-muted">{{ t('train.allNormal') }}</p>
    <ul v-else class="text-sm text-muted space-y-1">
      <li v-for="line in disruptedLines" :key="line.lineId">
        {{ t('train.lineStatus', { line: line.lineName, status: t(statusKeyMap[line.status as Exclude<TrainStatusLevel, 'normal'>]) }) }}
      </li>
    </ul>
  </UCard>
</template>
