/**
 * 앰비언트 드랍 대상 읽기의 공용 조회·판정 — 매일 배포(`index.ts`)와 날짜 예약(`scheduleTargets.ts`)이 함께 쓴다
 * (티켓 20261001_2130).
 *
 * 두 경로가 지점·활성 시스템 드랍 수 조회와 배지 유효기간 판정을 따로 적으면 한쪽만 고쳐졌을 때 판정이 어긋난다.
 * 그래서 조건을 이 파일에만 둔다. 조회가 실패하면 던진다 — 호출부가 정한 방식(예약은 fail-closed, 매일 배포는 폴백)으로 처리한다.
 *
 * 순수 모듈이다. 예약 등록 핸들러가 `scheduleTargets.ts`를 거쳐 끌어오므로 서버 전용 모듈을 값으로 가져오지 않는다
 * (`@/lib/db/fetchAllRows`와 같은 계약).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { fetchAllRows, fetchAllRowsIn } from '@/lib/db/fetchAllRows'

type ServiceClient = ReturnType<typeof createServiceClient>

export interface ActiveSystemDropRow {
  poi_id: string
  id: string
}

/**
 * 페이징 조회 함수 묶음. 기본값은 `@/lib/db/fetchAllRows`의 실제 함수다.
 * 매일 배포(`index.ts`)는 `@/lib/notifications/batch/shared`가 다시 내보내는 같은 함수를 넘긴다 —
 * 그 모듈을 바꿔 끼우는 기존 시험이 이 조회에도 그대로 적용되게 하려는 것이다.
 */
export interface TargetReaders {
  fetchAllRows: typeof fetchAllRows
  fetchAllRowsIn: typeof fetchAllRowsIn
}

const DEFAULT_READERS: TargetReaders = { fetchAllRows, fetchAllRowsIn }

export type BadgeValidity = 'ok' | 'not_yet' | 'expired'

/**
 * 활성(`is_active`) 지점 id. `category`가 있으면 그 종류만, 없으면(「전체」) 무필터.
 * 운영 종료 지점은 새로 놓을 대상에서 뺀다(티켓 20260830_1620) — 이미 놓인 시스템 드랍은 건드리지 않는다.
 */
export async function fetchActivePoiIds(
  supabase: ServiceClient,
  category: string | null | undefined,
  readers: Pick<TargetReaders, 'fetchAllRows'> = DEFAULT_READERS
): Promise<string[]> {
  const rows = await readers.fetchAllRows<{ id: string }>('poi', 'id', () => {
    let q = supabase.from('poi').select('id').eq('is_active', true)
    if (category) q = q.eq('category', category)
    return q
  })
  return rows.map((r) => r.id)
}

/**
 * 활성 시스템 드랍(`poi_drops.source='system'`, `is_available=true`) 행.
 * `poiIds`를 주면 그 지점만(`.in('poi_id', chunk)`), 없으면 전체를 읽는다.
 *
 * poi_id는 POI별 카운트용이라 중복이 정상이다 — 유니크 tie-break가 아니다. poi_drops의 PK는 id
 * (migrations/004_phase7_user_drops.sql:5)이므로 select에 포함시켜 `orderBy: 'id'`로 안정 정렬한다.
 */
export async function fetchActiveSystemDrops(
  supabase: ServiceClient,
  poiIds?: readonly string[],
  readers: TargetReaders = DEFAULT_READERS
): Promise<ActiveSystemDropRow[]> {
  if (poiIds) {
    return readers.fetchAllRowsIn<ActiveSystemDropRow, string>('poi_drops(active system)', 'id', poiIds, (chunk) =>
      supabase.from('poi_drops').select('poi_id, id').eq('source', 'system').eq('is_available', true).in('poi_id', chunk)
    )
  }
  return readers.fetchAllRows<ActiveSystemDropRow>('poi_drops(active system)', 'id', () =>
    supabase.from('poi_drops').select('poi_id, id').eq('source', 'system').eq('is_available', true)
  )
}

/** 지점별 활성 시스템 드랍 수 */
export function countActiveByPoi(rows: readonly { poi_id: string }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.poi_id, (counts.get(row.poi_id) ?? 0) + 1)
  return counts
}

/**
 * 배지 유효기간 판정 — `valid_from <= 기준 <= valid_until`. 기준 시각은 ms이고, 비교도 시각(ms)으로 한다.
 * 문자열 비교는 `+00:00`과 `Z` 같은 표기 차이로 같은 순간을 다르게 판정할 수 있어 쓰지 않는다.
 */
export function badgeValidityAt(
  b: { valid_from: string | null; valid_until: string | null },
  atMs: number
): BadgeValidity {
  if (b.valid_from && new Date(b.valid_from).getTime() > atMs) return 'not_yet'
  if (b.valid_until && new Date(b.valid_until).getTime() < atMs) return 'expired'
  return 'ok'
}
