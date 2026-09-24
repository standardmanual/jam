/**
 * 미션 목록 쿼리 단일화(티켓 20260924_0946) — 목록 페이지(`admin/missions/page.tsx`)·전체 선택용
 * ID 조회(`api/admin/missions/ids`)가 같은 필터·정렬 규칙을 쓰도록
 * `parseMissionListParams`(URL → 타입) + `applyMissionListQuery`(타입 → 쿼리)로 나눈다.
 * `admin/poi`의 `poi-list-query.ts`와 같은 구조다.
 *
 * 상태(예정·진행·종료)는 저장된 값이 아니라 날짜에서 계산한다. 기준 시각(`now`)은 호출부가
 * 요청마다 한 번 정해 넘기고, 필터 조건과 행에 실어 보내는 상태가 같은 시각을 쓴다.
 */
import type { MissionRow, MissionType } from '@/types/database'
import { activeMissionsQueryFilter } from '@/lib/missions/checker'
import { MISSION_TYPES } from './badge-labels'
import { sanitizeSearchTerm } from './search-term'

/** 목록 표에 실제로 쓰는 컬럼만 select — 상세 폼 전용 컬럼은 넣지 않는다 */
export const MISSION_LIST_COLUMNS =
  'id, title, mission_type, condition_json, starts_at, ends_at, max_completions, exposure_mode, exposure_at, gate_axis, gated_badge_id, reward_badge_ids, reward_points'

export type MissionListRow = Pick<
  MissionRow,
  | 'id'
  | 'title'
  | 'mission_type'
  | 'condition_json'
  | 'starts_at'
  | 'ends_at'
  | 'max_completions'
  | 'exposure_mode'
  | 'exposure_at'
  | 'gate_axis'
  | 'gated_badge_id'
  | 'reward_badge_ids'
  | 'reward_points'
>

/** 연쇄 필터의 선택지를 만들 때 필요한 최소 컬럼 */
export const MISSION_TYPE_SUMMARY_COLUMNS = 'mission_type, gate_axis, gated_badge_id'
export type MissionTypeSummaryRow = Pick<MissionRow, 'mission_type' | 'gate_axis' | 'gated_badge_id'>

export type MissionStatus = 'upcoming' | 'active' | 'ended'

/**
 * 시작·종료일에서 상태를 계산한다. 진행 판정은 `isMissionActive`(checker.ts)와 같은 기준
 * (`starts_at <= now`, `ends_at`이 null이거나 `>= now`)이다.
 */
export function missionStatusOf(mission: Pick<MissionRow, 'starts_at' | 'ends_at'>, now: Date): MissionStatus {
  if (mission.ends_at !== null && new Date(mission.ends_at) < now) return 'ended'
  if (new Date(mission.starts_at) > now) return 'upcoming'
  return 'active'
}

/** 게이트 미션 = `gate_axis` 또는 `gated_badge_id`가 있는 미션 */
export function isGateMission(mission: Pick<MissionRow, 'gate_axis' | 'gated_badge_id'>): boolean {
  return mission.gate_axis !== null || mission.gated_badge_id !== null
}

export type MissionKindFilter = 'normal' | 'gate' | 'all'
export type MissionStateFilter = 'upcoming' | 'active' | 'ended' | 'all'
export type MissionRewardFilter = 'badge' | 'points' | 'none' | 'all'

const MISSION_LIST_SORTS = [
  'created_desc',
  'created_asc',
  'starts_desc',
  'starts_asc',
  'ends_desc',
  'ends_asc',
  'title_asc',
  'title_desc',
] as const
export type MissionListSort = (typeof MISSION_LIST_SORTS)[number]

const DEFAULT_SORT: MissionListSort = 'created_desc'

function isMissionListSort(value: string | undefined): value is MissionListSort {
  return !!value && (MISSION_LIST_SORTS as readonly string[]).includes(value)
}

export interface MissionListParams {
  /** {@link sanitizeSearchTerm}을 거친 제목 검색어 — 빈 문자열이면 검색하지 않는다 */
  q: string
  kind: MissionKindFilter
  /** 미션 유형(`mission_type`) — 'all'이면 거르지 않는다 */
  missionType: string | 'all'
  reward: MissionRewardFilter
  state: MissionStateFilter
  sort: MissionListSort
}

/** URL(또는 API 쿼리) 파라미터 → 타입이 있는 목록 조건. 목록·ID 조회가 모두 이 함수를 거친다. */
export function parseMissionListParams(raw: Record<string, string | undefined>): MissionListParams {
  return {
    q: sanitizeSearchTerm(raw.q ?? ''),
    kind: raw.kind === 'normal' || raw.kind === 'gate' ? raw.kind : 'all',
    missionType: raw.mission_type?.trim() || 'all',
    reward: raw.reward === 'badge' || raw.reward === 'points' || raw.reward === 'none' ? raw.reward : 'all',
    state: raw.state === 'upcoming' || raw.state === 'active' || raw.state === 'ended' ? raw.state : 'all',
    sort: isMissionListSort(raw.sort) ? raw.sort : DEFAULT_SORT,
  }
}

const SORT_COLUMN: Record<MissionListSort, { column: string; ascending: boolean; nullsFirst?: boolean }> = {
  created_desc: { column: 'created_at', ascending: false },
  created_asc: { column: 'created_at', ascending: true },
  starts_desc: { column: 'starts_at', ascending: false },
  starts_asc: { column: 'starts_at', ascending: true },
  // 종료일이 없는 상시 미션은 어느 방향이든 맨 뒤로 보낸다
  ends_desc: { column: 'ends_at', ascending: false, nullsFirst: false },
  ends_asc: { column: 'ends_at', ascending: true, nullsFirst: false },
  title_asc: { column: 'title', ascending: true },
  title_desc: { column: 'title', ascending: false },
}

export interface MissionListQueryResult<T> {
  data: T[] | null
  count: number | null
  error: { message: string } | null
}

/** Supabase 쿼리 빌더가 구조적으로 그대로 들어맞는 최소 인터페이스 */
export interface MissionListQuery<T> {
  ilike(column: string, pattern: string): MissionListQuery<T>
  eq(column: string, value: string | boolean | number): MissionListQuery<T>
  gt(column: string, value: string | number): MissionListQuery<T>
  lt(column: string, value: string | number): MissionListQuery<T>
  lte(column: string, value: string | number): MissionListQuery<T>
  is(column: string, value: null): MissionListQuery<T>
  not(column: string, operator: string, value: unknown): MissionListQuery<T>
  or(filters: string): MissionListQuery<T>
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): MissionListQuery<T>
  range(from: number, to: number): PromiseLike<MissionListQueryResult<T>>
}

/**
 * 검색·필터·정렬을 쿼리에 적용한다. `.select()`까지 호출한 쿼리를 넘기면 `.range()`를 부를 수
 * 있는 상태로 돌려준다. 여러 번 붙는 `.or()`는 서로 AND로 묶인다(PostgREST 쿼리 파라미터가
 * 각각 따로 붙는다). 보조 정렬로 `id`를 항상 붙인다(동순위 페이징 안정성).
 */
export function applyMissionListQuery<T>(
  query: MissionListQuery<T>,
  params: MissionListParams,
  now: Date
): MissionListQuery<T> {
  let next = query
  const nowIso = now.toISOString()

  if (params.q) next = next.ilike('title', `%${params.q}%`)

  if (params.kind === 'gate') {
    next = next.or('gate_axis.not.is.null,gated_badge_id.not.is.null')
  } else if (params.kind === 'normal') {
    next = next.is('gate_axis', null).is('gated_badge_id', null)
  }

  if (params.missionType !== 'all') next = next.eq('mission_type', params.missionType)

  if (params.reward === 'badge') {
    next = next.not('reward_badge_ids', 'eq', '{}')
  } else if (params.reward === 'points') {
    next = next.gt('reward_points', 0)
  } else if (params.reward === 'none') {
    next = next.eq('reward_badge_ids', '{}').or('reward_points.is.null,reward_points.eq.0')
  }

  if (params.state === 'active') {
    const filter = activeMissionsQueryFilter(nowIso)
    next = next.lte('starts_at', filter.startsAtLte).or(filter.endsAtOrExpr)
  } else if (params.state === 'upcoming') {
    next = next.gt('starts_at', nowIso)
  } else if (params.state === 'ended') {
    next = next.lt('ends_at', nowIso)
  }

  const { column, ascending, nullsFirst } = SORT_COLUMN[params.sort]
  next = next.order(column, nullsFirst === undefined ? { ascending } : { ascending, nullsFirst })
  next = next.order('id', { ascending: true })

  return next
}

/**
 * 연쇄 필터 "미션 유형" 선택지 — 고른 구분(일반/게이트)에 실제로 존재하는 유형만 돌려준다.
 * 구분이 'all'이면 전체 미션에서 모은다. 저작 폼 순서(`MISSION_TYPES`)를 따르고, 목록에 없는
 * 값이 데이터에 있으면(옛 유형 등) 뒤에 붙인다.
 */
export function missionTypesForKind(rows: MissionTypeSummaryRow[], kind: MissionKindFilter): string[] {
  const present = new Set<string>()
  for (const row of rows) {
    if (kind === 'gate' && !isGateMission(row)) continue
    if (kind === 'normal' && isGateMission(row)) continue
    present.add(row.mission_type)
  }
  const known: string[] = (MISSION_TYPES as MissionType[]).filter((type) => present.has(type))
  const unknown = [...present].filter((type) => !known.includes(type)).sort()
  return [...known, ...unknown]
}
