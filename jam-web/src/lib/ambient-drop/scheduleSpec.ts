/**
 * 앰비언트 드랍 날짜 예약 — 입력 검증·상태 파생·행 변환 (순수 함수, 티켓 20261001_2051)
 *
 * 예약은 「어디에」(지점)와 「무엇을」(아이템)을 각각 두 방식 중 하나로 정한다. 한 예약 안에서 섞지 않는다.
 *
 * | 축 | 모드 | 칸 |
 * |---|---|---|
 * | 지점 | `list` 지점 직접 선택 | `poi_ids`(1개 이상) + `per_poi_count`(지점마다 몇 개) |
 * | 지점 | `category` 지점 종류+개수 | `poi_category`(없으면 전체 종류) + `total_count`(총 몇 개) |
 * | 아이템 | `items` 배지 직접 선택 | `badge_ids` |
 * | 아이템 | `collections` 컬렉션 선택 | `collection_ids` |
 *
 * 입력은 평평한 키(`scheduled_at`·`title`·아래 6개 키)이고 모드는 키로 정한다. 운영툴 자원 연결(티켓
 * 20260930_1500)이 항목의 `resource`에 같은 키를 쓴다 — 그 키 목록이 `DROP_SCHEDULE_RESOURCE_KEYS`이고,
 * 밸런스 규칙 R8의 키(`ops_rules`의 `economy_keys`)와 겹치지 않아야 한다(`schedule-r8-keys.test.ts`).
 *
 * 로직 문서: docs/service/badge-engine/BADGE_ENGINE_UNIFIED.md §3.12 「날짜 예약 배포」
 */
import { isUuid } from '@/lib/admin/uuid'
import { KST_OFFSET_MS } from '@/lib/notifications/kst'
import type {
  AmbientDropItemMode,
  AmbientDropPoiMode,
  AmbientDropScheduleRow,
  AmbientDropScheduleStatus,
} from '@/types/database'

/** 예약 1건이 한 번에 놓을 수 있는 드랍 수의 상한 — 임시값. 위반은 400 */
export const AMBIENT_SCHEDULE_MAX_TOTAL = 100

/** 예정 시각에서 이만큼 지나도록 실행되지 않으면 놓치고(`missed`) 놓지 않는다 — 임시값(3시간) */
export const AMBIENT_SCHEDULE_LATE_WINDOW_MS = 3 * 60 * 60 * 1000

/** `running`이 이만큼 남아 있으면 멈춘 것(`stalled`)으로 읽는다 — 임시값(30분) */
export const AMBIENT_SCHEDULE_STALLED_AFTER_MS = 30 * 60 * 1000

/** 제목 길이 상한(DB CHECK와 같다) */
export const AMBIENT_SCHEDULE_TITLE_MAX = 100

/**
 * 예약 입력의 자원 키 6개. 운영툴 항목의 `resource` 키로 쓰이고, 밸런스 규칙 R8이 읽는 경제 수치 키와
 * 겹치면 안 된다. 칸을 더하면 R8 키 23개(`supabase/migrations/207_ops_rules.sql`)와 다시 대조한다.
 */
export const DROP_SCHEDULE_RESOURCE_KEYS = [
  'poi_ids',
  'poi_category',
  'badge_ids',
  'collection_ids',
  'per_poi_count',
  'total_count',
] as const

export type AmbientDropPoiSpec =
  | { poiMode: 'list'; poiIds: string[]; perPoiCount: number }
  | { poiMode: 'category'; poiCategory: string | null; totalCount: number }

export type AmbientDropItemSpec =
  | { itemMode: 'items'; badgeIds: string[] }
  | { itemMode: 'collections'; collectionIds: string[] }

/** 예약이 무엇을 어디에 놓는지 — 시각·이름은 제외한 순수한 내용 */
export type AmbientDropScheduleSpec = AmbientDropPoiSpec & AmbientDropItemSpec

export type ParseAmbientDropScheduleResult =
  | {
      ok: true
      /** 정규화한 예정 시각(ISO). `allowNow`로 「지금」이 들어오면 null */
      scheduledAt: string | null
      spec: AmbientDropScheduleSpec
      title: string | null
    }
  | { ok: false; error: string }

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const HOUR_MS = 60 * 60 * 1000

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

/** 값이 없음(undefined·null)이면 true */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null
}

/** UUID 배열 칸을 읽는다 — 없으면 빈 배열, 중복은 처음 것만 남긴다 */
function readUuidList(value: unknown, label: string): { ok: true; value: string[] } | { ok: false; error: string } {
  if (isAbsent(value)) return { ok: true, value: [] }
  if (!Array.isArray(value)) {
    return fail(`${label} 형식이 올바르지 않아요. 목록(배열)으로 보내야 해요. ${label}을 다시 선택해 주세요.`)
  }
  const seen = new Set<string>()
  for (const raw of value) {
    const id = typeof raw === 'string' ? raw.trim() : ''
    if (!isUuid(id)) {
      return fail(`${label}에 올바르지 않은 ID가 있어요. ID 형식이 아닌 값이 섞여 있어요. ${label}을 다시 선택해 주세요.`)
    }
    seen.add(id.toLowerCase())
  }
  return { ok: true, value: [...seen] }
}

/** 개수 칸을 읽는다 — 없으면 null, 있으면 1 이상의 정수 */
function readCount(value: unknown, label: string): { ok: true; value: number | null } | { ok: false; error: string } {
  if (isAbsent(value)) return { ok: true, value: null }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    return fail(`${label}가 올바르지 않아요. 1 이상의 정수만 쓸 수 있어요. ${label}를 다시 입력해 주세요.`)
  }
  return { ok: true, value }
}

/**
 * 예정 시각을 읽는다 — 시간대가 붙은 ISO 8601, 달력에 있는 날짜, KST 정시, 지금보다 뒤.
 * 통과하면 `toISOString()`으로 정규화한 값을 돌려준다.
 */
export function parseScheduledAt(
  value: unknown,
  now: Date
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string' || !ISO_WITH_ZONE.test(value.trim())) {
    return fail(
      '놓을 시각 형식이 올바르지 않아요. 시간대가 포함된 날짜와 시각이어야 해요(예: 2026-10-05T09:00:00+09:00). 시각을 다시 선택해 주세요.'
    )
  }
  const trimmed = value.trim()
  const at = new Date(trimmed)
  // `new Date`는 2월 31일을 3월 3일로 조용히 넘겨 읽는다 — 예약이 모르는 사이 밀리지 않도록 달력에 있는 날짜인지 따로 본다.
  const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed) ?? []
  const calendarDay = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (
    Number.isNaN(at.getTime()) ||
    calendarDay.getUTCMonth() !== Number(month) - 1 ||
    calendarDay.getUTCDate() !== Number(day)
  ) {
    return fail('놓을 시각을 읽을 수 없어요. 존재하지 않는 날짜예요. 날짜와 시각을 다시 선택해 주세요.')
  }
  if (!isKstHour(at)) {
    return fail('놓을 시각이 정시가 아니에요. 예약은 한국 시각 정시에만 실행돼요. 분을 00으로 맞춰 다시 선택해 주세요.')
  }
  if (at.getTime() <= now.getTime()) {
    return fail('놓을 시각이 이미 지났어요. 예약은 지금보다 늦은 시각에만 등록할 수 있어요. 더 늦은 시각을 골라 주세요.')
  }
  return { ok: true, value: at.toISOString() }
}

/** KST로 옮겼을 때 분·초·밀리초가 0인가. KST는 UTC+9 고정이라 시각 경계가 UTC 정시와 같다 */
export function isKstHour(at: Date): boolean {
  return (at.getTime() + KST_OFFSET_MS) % HOUR_MS === 0
}

/**
 * 예약 입력 검증. 등록(`createAmbientDropSchedule`)과 운영툴 자원 연결(1500)이 같은 함수를 쓴다.
 *
 * - `allowNow`: `scheduled_at`이 없거나 `"now"`이면 `scheduledAt: null`로 통과한다(「지금」 1회 배포, 티켓 20261001_2053).
 * - `ends_at`이 들어오면 400이다 — 드랍 일정은 놓은 뒤 내리지 않아 종료 시각이 없다.
 * - `rarity_*` 같은 모르는 키는 무시한다(예약에는 등급 비율을 두지 않는다).
 */
export function parseAmbientDropScheduleInput(
  body: unknown,
  now: Date,
  opts: { allowNow?: boolean } = {}
): ParseAmbientDropScheduleResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return fail('예약 내용을 읽지 못했어요. 요청 본문이 올바른 형태가 아니에요. 입력한 값을 확인하고 다시 저장해 주세요.')
  }
  const input = body as Record<string, unknown>

  if (!isAbsent(input.ends_at)) {
    return fail(
      '종료 시각은 정할 수 없어요. 드랍 일정은 놓은 뒤 내리지 않아서 종료 시각이 없어요. 종료 시각을 빼고 다시 저장해 주세요.'
    )
  }

  // 이름
  let title: string | null = null
  if (!isAbsent(input.title)) {
    if (typeof input.title !== 'string') {
      return fail('이름 형식이 올바르지 않아요. 이름은 글자로만 쓸 수 있어요. 이름을 다시 입력해 주세요.')
    }
    const trimmed = input.title.trim()
    if (trimmed.length > AMBIENT_SCHEDULE_TITLE_MAX) {
      return fail(`이름이 너무 길어요. 이름은 ${AMBIENT_SCHEDULE_TITLE_MAX}자까지 쓸 수 있어요. ${AMBIENT_SCHEDULE_TITLE_MAX}자 이하로 줄여 주세요.`)
    }
    title = trimmed === '' ? null : trimmed
  }

  // 시각
  let scheduledAt: string | null
  const rawAt = input.scheduled_at
  const isNow = rawAt === undefined || rawAt === null || rawAt === '' || rawAt === 'now'
  if (isNow) {
    if (!opts.allowNow) {
      return fail('놓을 시각이 없어요. 예약에는 놓을 날짜와 시각이 필요해요. 한국 시각 정시를 골라 주세요.')
    }
    scheduledAt = null
  } else {
    const parsed = parseScheduledAt(rawAt, now)
    if (!parsed.ok) return parsed
    scheduledAt = parsed.value
  }

  // 칸 읽기
  const poiIds = readUuidList(input.poi_ids, '장소 목록')
  if (!poiIds.ok) return poiIds
  const badgeIds = readUuidList(input.badge_ids, '아이템 목록')
  if (!badgeIds.ok) return badgeIds
  const collectionIds = readUuidList(input.collection_ids, '컬렉션 목록')
  if (!collectionIds.ok) return collectionIds
  const perPoiCount = readCount(input.per_poi_count, '장소당 개수')
  if (!perPoiCount.ok) return perPoiCount
  const totalCount = readCount(input.total_count, '총 개수')
  if (!totalCount.ok) return totalCount

  let poiCategory: string | null = null
  if (!isAbsent(input.poi_category)) {
    if (typeof input.poi_category !== 'string') {
      return fail('장소 종류 형식이 올바르지 않아요. 종류는 글자로만 쓸 수 있어요. 장소 종류를 다시 선택해 주세요.')
    }
    poiCategory = input.poi_category.trim() === '' ? null : input.poi_category.trim()
  }

  // 지점 모드: poi_ids가 있으면 지점 직접, 없으면 종류+개수
  let poiSpec: AmbientDropPoiSpec
  if (poiIds.value.length > 0) {
    if (totalCount.value !== null || poiCategory !== null) {
      return fail(
        '장소를 정하는 방식이 섞여 있어요. 장소를 직접 골랐는데 장소 종류나 총 개수도 들어 있어요. 장소 직접 선택과 종류+개수 중 하나만 남겨 주세요.'
      )
    }
    if (perPoiCount.value === null) {
      return fail('장소당 개수가 없어요. 장소를 직접 고르면 장소마다 놓을 개수가 필요해요. 장소당 개수를 입력해 주세요.')
    }
    const total = poiIds.value.length * perPoiCount.value
    if (total > AMBIENT_SCHEDULE_MAX_TOTAL) {
      return fail(
        `한 예약에 놓을 수 있는 드랍은 ${AMBIENT_SCHEDULE_MAX_TOTAL}개까지예요. 장소 ${poiIds.value.length}곳에 ${perPoiCount.value}개씩이면 ${total}개라 상한을 넘어요. 장소 수나 장소당 개수를 줄여 주세요.`
      )
    }
    poiSpec = { poiMode: 'list', poiIds: poiIds.value, perPoiCount: perPoiCount.value }
  } else {
    if (perPoiCount.value !== null) {
      return fail(
        '장소를 정하는 방식이 섞여 있어요. 장소당 개수가 있는데 고른 장소가 없어요. 장소를 고르거나 장소당 개수를 빼고 총 개수를 입력해 주세요.'
      )
    }
    if (totalCount.value === null) {
      return fail('총 개수가 없어요. 장소 종류로 정하면 놓을 총 개수가 필요해요. 총 개수를 입력해 주세요.')
    }
    if (totalCount.value > AMBIENT_SCHEDULE_MAX_TOTAL) {
      return fail(
        `한 예약에 놓을 수 있는 드랍은 ${AMBIENT_SCHEDULE_MAX_TOTAL}개까지예요. 총 개수 ${totalCount.value}개는 상한을 넘어요. ${AMBIENT_SCHEDULE_MAX_TOTAL}개 이하로 줄여 주세요.`
      )
    }
    poiSpec = { poiMode: 'category', poiCategory, totalCount: totalCount.value }
  }

  // 아이템 모드: badge_ids와 collection_ids 중 정확히 하나만 비어 있지 않아야 한다
  let itemSpec: AmbientDropItemSpec
  if (badgeIds.value.length > 0 && collectionIds.value.length > 0) {
    return fail(
      '놓을 것을 정하는 방식이 섞여 있어요. 아이템과 컬렉션이 함께 들어 있어요. 아이템 직접 선택과 컬렉션 선택 중 하나만 남겨 주세요.'
    )
  }
  if (badgeIds.value.length > 0) {
    itemSpec = { itemMode: 'items', badgeIds: badgeIds.value }
  } else if (collectionIds.value.length > 0) {
    itemSpec = { itemMode: 'collections', collectionIds: collectionIds.value }
  } else {
    return fail('놓을 것이 없어요. 아이템이나 컬렉션을 하나 이상 골라야 해요. 아이템 또는 컬렉션을 선택해 주세요.')
  }

  return { ok: true, scheduledAt, spec: { ...poiSpec, ...itemSpec }, title }
}

/** 화면·읽기용 예약 상태 — DB 상태에 시간 경과로 파생되는 `stalled`가 더해진다 */
export type AmbientDropScheduleState = AmbientDropScheduleStatus | 'stalled'

type ScheduleStateInput = Pick<AmbientDropScheduleRow, 'status' | 'scheduled_at' | 'claimed_at'>

/**
 * DB 상태를 읽고 시간 경과로 달라지는 상태를 파생한다(1500·1502-④가 읽는다).
 * - `scheduled`인데 예정 시각 + 3시간이 지났으면 `missed`(cron이 아직 표시하지 못했어도 놓치는 것으로 읽는다)
 * - `running`인데 선점 시각 + 30분이 지났으면 `stalled`(실행기가 도중에 멈춘 것으로 의심)
 * 경계는 지난 뒤부터다 — 정확히 3시간(30분)일 때는 아직 `scheduled`(`running`)다.
 */
export function ambientDropScheduleState(row: ScheduleStateInput, now: Date): AmbientDropScheduleState {
  if (row.status === 'scheduled') {
    const lateAt = new Date(row.scheduled_at).getTime() + AMBIENT_SCHEDULE_LATE_WINDOW_MS
    return now.getTime() > lateAt ? 'missed' : 'scheduled'
  }
  if (row.status === 'running' && row.claimed_at) {
    const stalledAt = new Date(row.claimed_at).getTime() + AMBIENT_SCHEDULE_STALLED_AFTER_MS
    return now.getTime() > stalledAt ? 'stalled' : 'running'
  }
  return row.status
}

type SpecRowInput = Pick<
  AmbientDropScheduleRow,
  'poi_mode' | 'poi_ids' | 'poi_category' | 'per_poi_count' | 'total_count' | 'item_mode' | 'badge_ids' | 'collection_ids'
>

/** 저장된 행에서 예약 내용을 꺼낸다. DB CHECK가 막는 모순(지점 직접인데 개수 없음 등)이 보이면 던진다 */
export function specFromRow(row: SpecRowInput): AmbientDropScheduleSpec {
  let poiSpec: AmbientDropPoiSpec
  if (row.poi_mode === 'list') {
    if (row.per_poi_count === null) throw new Error('예약 행이 올바르지 않아요: 장소 직접 선택인데 per_poi_count가 없어요')
    poiSpec = { poiMode: 'list', poiIds: row.poi_ids, perPoiCount: row.per_poi_count }
  } else {
    if (row.total_count === null) throw new Error('예약 행이 올바르지 않아요: 장소 종류 선택인데 total_count가 없어요')
    poiSpec = { poiMode: 'category', poiCategory: row.poi_category, totalCount: row.total_count }
  }
  const itemSpec: AmbientDropItemSpec =
    row.item_mode === 'items'
      ? { itemMode: 'items', badgeIds: row.badge_ids }
      : { itemMode: 'collections', collectionIds: row.collection_ids }
  return { ...poiSpec, ...itemSpec }
}

/**
 * 예약 내용을 INSERT 페이로드로 바꾼다 — 쓰지 않는 모드의 칸은 비워 DB CHECK와 맞춘다.
 * `id`를 주면 그 ID로 만든다(운영툴 예약 등록이 만들기 전에 ID를 먼저 적는다, 티켓 20261002_2306). 안 주면 `id` 칸 없이 DB가 정한다.
 */
export function rowFromSpec(
  spec: AmbientDropScheduleSpec,
  scheduledAt: string,
  createdBy: string | null,
  title: string | null = null,
  id?: string
): {
  id?: string
  title: string | null
  scheduled_at: string
  poi_mode: AmbientDropPoiMode
  poi_ids: string[]
  poi_category: string | null
  item_mode: AmbientDropItemMode
  badge_ids: string[]
  collection_ids: string[]
  per_poi_count: number | null
  total_count: number | null
  created_by: string | null
} {
  return {
    ...(id === undefined ? {} : { id }),
    title,
    scheduled_at: scheduledAt,
    poi_mode: spec.poiMode,
    poi_ids: spec.poiMode === 'list' ? spec.poiIds : [],
    poi_category: spec.poiMode === 'category' ? spec.poiCategory : null,
    item_mode: spec.itemMode,
    badge_ids: spec.itemMode === 'items' ? spec.badgeIds : [],
    collection_ids: spec.itemMode === 'collections' ? spec.collectionIds : [],
    per_poi_count: spec.poiMode === 'list' ? spec.perPoiCount : null,
    total_count: spec.poiMode === 'category' ? spec.totalCount : null,
    created_by: createdBy,
  }
}
