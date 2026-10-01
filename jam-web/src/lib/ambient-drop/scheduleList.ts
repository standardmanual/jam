/**
 * 앰비언트 드랍 날짜 예약 — 목록 읽기와 화면용 변환 (서버, 티켓 20261001_2052)
 *
 * 예약 행(`ambient_drop_schedules`)을 어드민 화면이 읽는 모양(`scheduleView.ts`)으로 바꾼다. 실행이 실패하면
 * DB 오류 원문이 행의 `result.error`에 저장되는데(`scheduleRun.ts`), 이 파일이 만드는 응답에는 **원문을 싣지
 * 않는다** — 접두어·사유로 분류한 `failureKind`만 보낸다. 어떤 함수도 DB에 쓰지 않는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { fetchAllRowsIn, type PagedQuery } from '@/lib/notifications/batch/shared'
import type { AmbientDropScheduleRow } from '@/types/database'
import { ambientDropScheduleState } from './scheduleSpec'
import { SCHEDULE_EXCLUDE_REASON_LABEL } from './scheduleTargets'
import type {
  AmbientDropScheduleListItem,
  AmbientDropScheduleNames,
  ScheduleFailureKind,
  ScheduleOutcomeView,
} from './scheduleView'

type ServiceClient = ReturnType<typeof createServiceClient>

/** 목록 기본 개수 — 최근 예약부터 */
export const SCHEDULE_LIST_LIMIT = 50

const LIST_FAILED = '예약 목록을 불러오지 못했어요. 서버에서 목록을 읽는 중 오류가 났어요. 잠시 후 새로고침해 주세요.'

export type ListAmbientDropSchedulesResult =
  | { ok: true; schedules: AmbientDropScheduleListItem[]; names: AmbientDropScheduleNames }
  | { ok: false; status: 500; error: string }

function readCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function readEntries(value: unknown): { reason: unknown }[] {
  return Array.isArray(value) ? value.filter((e): e is { reason: unknown } => typeof e === 'object' && e !== null) : []
}

/** 빠진 대상을 사유별로 세어 「운영이 끝난 지점 1건, …」로 줄인다. 없으면 null */
function summarizeExcluded(excluded: unknown): string | null {
  if (typeof excluded !== 'object' || excluded === null) return null
  const record = excluded as Record<string, unknown>
  const counts = new Map<string, number>()
  for (const entry of [...readEntries(record.pois), ...readEntries(record.badges), ...readEntries(record.collections)]) {
    const label =
      typeof entry.reason === 'string' && entry.reason in SCHEDULE_EXCLUDE_REASON_LABEL
        ? SCHEDULE_EXCLUDE_REASON_LABEL[entry.reason as keyof typeof SCHEDULE_EXCLUDE_REASON_LABEL]
        : '그 밖의 대상'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  return [...counts.entries()].map(([label, n]) => `${label} ${n}건`).join(', ')
}

/** 실패 원인을 갈래로만 남긴다 — 사유 `insert_failed`, 접두어 `대상 조회 실패`, 그 밖의 오류 원문 */
function classifyFailure(reason: string | null, error: unknown): ScheduleFailureKind | null {
  if (reason === 'insert_failed') return 'insert'
  if (typeof error !== 'string' || error === '') return null
  return error.startsWith('대상 조회 실패') ? 'target_lookup' : 'unexpected'
}

/**
 * 예약 행의 `result` JSON을 화면용으로 줄인다. 객체가 아니면 null이다. **`error` 원문은 버린다.**
 * 값은 DB의 JSON이라 믿지 않고 하나씩 읽는다.
 */
export function toScheduleOutcomeView(result: unknown): ScheduleOutcomeView | null {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) return null
  const r = result as Record<string, unknown>
  const reason = typeof r.reason === 'string' ? r.reason : null
  return {
    requested: readCount(r.requested),
    spawned: readCount(r.spawned),
    failed: readCount(r.failed),
    reason,
    failureKind: classifyFailure(reason, r.error),
    overlappedPoiCount: readCount(r.overlappedPoiCount),
    excludedSummary: summarizeExcluded(r.excluded),
  }
}

/** 예약 행 1건을 화면용 항목으로 바꾼다. 파생 상태(`missed`·`stalled`)는 `now` 기준이다 */
export function toScheduleListItem(row: AmbientDropScheduleRow, now: Date): AmbientDropScheduleListItem {
  return {
    id: row.id,
    title: row.title,
    scheduledAt: row.scheduled_at,
    status: row.status,
    state: ambientDropScheduleState(row, now),
    poiMode: row.poi_mode,
    poiIds: row.poi_ids,
    poiCategory: row.poi_category,
    perPoiCount: row.per_poi_count,
    totalCount: row.total_count,
    itemMode: row.item_mode,
    badgeIds: row.badge_ids,
    collectionIds: row.collection_ids,
    createdBy: row.created_by,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    canceledAt: row.canceled_at,
    outcome: toScheduleOutcomeView(row.result),
  }
}

/** `id,name` 두 열만 읽어 id → 이름 맵을 만든다. 실패하면 로그만 남기고 빈 맵이다(목록은 이름 없이도 보인다) */
async function readNames(
  label: string,
  ids: string[],
  query: (chunk: string[]) => PagedQuery<{ id: string; name: string }>
): Promise<Record<string, string>> {
  try {
    const rows = await fetchAllRowsIn<{ id: string; name: string }, string>(label, 'id', ids, query)
    return Object.fromEntries(rows.map((r) => [r.id, r.name]))
  } catch (err) {
    console.error('[ambient-drop-schedule] 목록 이름 조회 실패:', err)
    return {}
  }
}

/**
 * 최근 예약을 예정 시각 내림차순으로 `limit`건 읽는다. 읽기에 실패하면 500이다.
 * 목록에 나온 지점·아이템·컬렉션의 이름은 따로 읽어 `names`에 담는다.
 */
export async function listAmbientDropSchedules(
  supabase: ServiceClient,
  now: Date,
  limit: number = SCHEDULE_LIST_LIMIT
): Promise<ListAmbientDropSchedulesResult> {
  const { data, error } = await supabase
    .from('ambient_drop_schedules')
    .select('*')
    .order('scheduled_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('[ambient-drop-schedule] 예약 목록 읽기 실패:', error.message)
    return { ok: false, status: 500, error: LIST_FAILED }
  }

  const rows = (data ?? []) as AmbientDropScheduleRow[]
  const poiIds = [...new Set(rows.flatMap((r) => r.poi_ids))]
  const badgeIds = [...new Set(rows.flatMap((r) => r.badge_ids))]
  const collectionIds = [...new Set(rows.flatMap((r) => r.collection_ids))]

  const [pois, badges, collections] = await Promise.all([
    readNames('poi(예약 목록 이름)', poiIds, (chunk) => supabase.from('poi').select('id, name').in('id', chunk)),
    readNames('badges(예약 목록 이름)', badgeIds, (chunk) => supabase.from('badges').select('id, name').in('id', chunk)),
    readNames('item_books(예약 목록 이름)', collectionIds, (chunk) =>
      supabase.from('item_books').select('id, name').in('id', chunk)
    ),
  ])

  return {
    ok: true,
    schedules: rows.map((row) => toScheduleListItem(row, now)),
    names: { pois, badges, collections },
  }
}
