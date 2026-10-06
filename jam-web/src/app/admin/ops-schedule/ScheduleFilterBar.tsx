import { OpsScheduleFilters, type ScheduleFilterOption } from '@/components/admin/ops/OpsScheduleFilters'
import { listOpsPatterns } from '@/lib/admin/opsPatterns/read'
import type { ScheduleView } from '@/lib/admin/opsSchedule/params'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * 일정표 거르기 줄의 선택지 읽기 (티켓 20261006_1539 ③-d). 트라이브(`tribes`의 `id`·`name`)와 패턴(보관하지 않은 패턴)을 읽어 거르기 단추에 넘긴다.
 * 이 줄만 `Suspense`로 따로 읽어 본문을 막지 않는다. 한쪽이라도 못 읽으면 트라이브·패턴 단추를 막고 이유를 알린다 — 종류 거르기는 읽을 것이 없어 그대로 쓴다.
 */

export const SCHEDULE_FILTER_OPTIONS_FAILED_LOG = '[admin/ops-schedule] 거르기 선택지 읽기 오류:'

async function loadOptions(): Promise<{ tribes: ScheduleFilterOption[]; patterns: ScheduleFilterOption[]; failed: boolean }> {
  try {
    const service = createServiceClient()
    const [tribeResult, patterns] = await Promise.all([service.from('tribes').select('id, name').order('name'), listOpsPatterns(service, { includeArchived: false })])
    if (tribeResult.error) throw new Error(`트라이브 조회 실패: ${tribeResult.error.message}`)
    return {
      tribes: (tribeResult.data ?? []).map((tribe) => ({ value: String(tribe.id).toLowerCase(), label: tribe.name })),
      patterns: patterns.map((pattern) => ({ value: pattern.patternNo, label: `${pattern.patternNo} ${pattern.name}` })),
      failed: false,
    }
  } catch (error) {
    console.error(SCHEDULE_FILTER_OPTIONS_FAILED_LOG, error)
    return { tribes: [], patterns: [], failed: true }
  }
}

export async function ScheduleFilterBar({ view }: { view: ScheduleView }) {
  const { tribes, patterns, failed } = await loadOptions()
  return <OpsScheduleFilters tribes={tribes} patterns={patterns} optionsFailed={failed} showLegend={view !== 'week'} />
}
