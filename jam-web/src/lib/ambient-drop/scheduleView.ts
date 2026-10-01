/**
 * 앰비언트 드랍 날짜 예약 — 어드민 화면용 순수 모듈 (티켓 20261001_2052)
 *
 * 목록 API 응답의 모양(`AmbientDropScheduleListItem`)과 화면이 그대로 쓰는 규칙(상태 라벨·버튼 열림 여부·
 * 결과 사유 문장·시각 표기)을 모은다. 클라이언트 컴포넌트가 불러도 되는 파일이라 서버 모듈은 `import type`만 한다
 * (`scheduleTargets`·`scheduleList`는 `next/headers`를 끌고 온다).
 *
 * 취소는 DB 상태(`status`), 시각 수정은 파생 상태(`state`)를 따른다. DB가 `scheduled`인데 예정 시각 + 3시간이
 * 지나 「놓침」으로 읽히는 예약은 취소만 열린다(티켓 20261001_2132).
 */
import { formatKstYmdHm } from '@/lib/admin/kst-format'
import type { AmbientDropItemMode, AmbientDropPoiMode, AmbientDropScheduleStatus } from '@/types/database'
import type { AmbientDropScheduleState } from './scheduleSpec'

/** 실행이 실패한 이유의 갈래 — DB 오류 원문 대신 이 분류만 화면에 보낸다 */
export type ScheduleFailureKind = 'target_lookup' | 'insert' | 'unexpected'

/** 예약 행 `result`를 화면용으로 줄인 것. 오류 원문(`error`)은 담지 않는다 */
export interface ScheduleOutcomeView {
  requested: number
  spawned: number
  failed: number
  /** 건너뜀·놓침 사유(`no_eligible_poi` 등). 없으면 null */
  reason: string | null
  failureKind: ScheduleFailureKind | null
  /** 이미 드랍이 있는데 겹쳐 놓은 지점 수 */
  overlappedPoiCount: number
  /** 실행 때 빠진 대상 요약(「운영이 끝난 지점 1건, …」). 없으면 null */
  excludedSummary: string | null
}

export interface AmbientDropScheduleListItem {
  id: string
  title: string | null
  scheduledAt: string
  /** DB 상태 */
  status: AmbientDropScheduleStatus
  /** 파생 상태(`missed`·`stalled` 포함) */
  state: AmbientDropScheduleState
  poiMode: AmbientDropPoiMode
  poiIds: string[]
  poiCategory: string | null
  perPoiCount: number | null
  totalCount: number | null
  itemMode: AmbientDropItemMode
  badgeIds: string[]
  collectionIds: string[]
  createdBy: string | null
  createdAt: string
  finishedAt: string | null
  canceledAt: string | null
  outcome: ScheduleOutcomeView | null
}

/** id → 이름. 이름을 읽지 못한 id는 빠져 있다 */
export interface AmbientDropScheduleNames {
  pois: Record<string, string>
  badges: Record<string, string>
  collections: Record<string, string>
}

/** 등록 전 미리 확인 결과 — DB에 쓰지 않고 예정 시각 기준으로 계산한다 */
export interface AmbientDropSchedulePreview {
  scheduledAt: string
  requested: number
  poiMode: AmbientDropPoiMode
  eligiblePoiCount: number
  /** 지점 직접 모드에서 이미 드랍이 있는데 겹쳐 놓일 지점 수. 종류+개수 모드는 항상 0 */
  overlappedPoiCount: number
  overlapNotice: string | null
  candidateBadgeCount: number
  /** 있으면 이 내용으로는 등록할 수 없다 */
  problem: string | null
}

export const SCHEDULE_STATE_LABEL: Record<AmbientDropScheduleState, string> = {
  scheduled: '예약됨',
  running: '실행 중',
  stalled: '멈춤',
  done: '완료',
  skipped: '건너뜀',
  failed: '실패',
  canceled: '취소',
  missed: '놓침',
}

const STATE_BADGE_CLASS: Record<AmbientDropScheduleState, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  running: 'bg-amber-100 text-amber-800',
  stalled: 'bg-red-100 text-red-700',
  done: 'bg-emerald-100 text-emerald-700',
  skipped: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-100 text-red-700',
  canceled: 'bg-gray-100 text-gray-500',
  missed: 'bg-orange-100 text-orange-700',
}

/** 상태 배지의 색 클래스(배경·글자). 모양 클래스는 화면이 붙인다 */
export function scheduleStateBadgeClass(state: AmbientDropScheduleState): string {
  return STATE_BADGE_CLASS[state]
}

const BLOCKED_RUNNING = '드랍하는 중인 예약이라 바꿀 수 없어요.'
const BLOCKED_EXECUTED = '이미 실행된 예약이에요. 다시 드랍하려면 새 예약을 등록해 주세요.'
const BLOCKED_CANCELED = '취소한 예약이에요.'
const BLOCKED_MISSED = '드랍 시각에서 3시간이 지나 놓친 예약이에요. 다시 드랍하려면 새 예약을 등록해 주세요.'

export interface ScheduleActions {
  canCancel: boolean
  canReschedule: boolean
  /** 버튼이 하나라도 막혔을 때 그 이유. 둘 다 열려 있으면 null */
  blockedReason: string | null
}

/** 버튼 규칙 — 취소는 DB 상태, 시각 수정은 파생 상태를 따른다 */
export function scheduleActions(item: {
  status: AmbientDropScheduleStatus
  state: AmbientDropScheduleState
}): ScheduleActions {
  const canCancel = item.status === 'scheduled'
  const canReschedule = item.status === 'scheduled' && item.state === 'scheduled'
  if (canCancel && canReschedule) return { canCancel, canReschedule, blockedReason: null }

  let blockedReason: string
  switch (item.state) {
    case 'running':
    case 'stalled':
      blockedReason = BLOCKED_RUNNING
      break
    case 'canceled':
      blockedReason = BLOCKED_CANCELED
      break
    case 'missed':
      blockedReason = BLOCKED_MISSED
      break
    default:
      blockedReason = BLOCKED_EXECUTED
  }
  return { canCancel, canReschedule, blockedReason }
}

/** 예약이 놓으려는 드랍 수 — 지점 직접은 지점 수 × 지점당 개수, 종류+개수는 총 개수 */
export function scheduleRequestedCount(
  spec:
    | { poiMode: 'list'; poiIds: readonly string[]; perPoiCount: number | null }
    | { poiMode: 'category'; totalCount: number | null }
): number {
  return spec.poiMode === 'list' ? spec.poiIds.length * (spec.perPoiCount ?? 0) : (spec.totalCount ?? 0)
}

/** 「2026.10.05 09:00」 형식(한국 시각) */
export function formatScheduleAt(iso: string): string {
  return formatKstYmdHm(iso)
}

const SKIPPED_BY_REASON: Record<string, string> = {
  no_eligible_poi: '드랍하지 않았어요. 실행 시각에 드랍할 수 있는 지점이 없었어요. 지점을 바꿔 새 예약을 등록해 주세요.',
  no_candidate_badges: '드랍하지 않았어요. 실행 시각에 유효한 아이템이 없었어요. 아이템을 바꿔 새 예약을 등록해 주세요.',
  no_eligible_collection:
    '드랍하지 않았어요. 실행 시각에 노출 중인 컬렉션이 없었어요. 컬렉션을 바꿔 새 예약을 등록해 주세요.',
}

const SKIPPED_OTHER = '드랍하지 않았어요. 실행 시각에 놓을 대상이 없었어요. 내용을 바꿔 새 예약을 등록해 주세요.'

const FAILED_BY_KIND: Record<ScheduleFailureKind, string> = {
  target_lookup: '드랍하지 못했어요. 실행 때 지점·아이템 정보를 읽지 못했어요. 잠시 뒤 같은 내용으로 새 예약을 등록해 주세요.',
  insert: '드랍하지 못했어요. 지점에 드랍을 만드는 중 오류가 났어요. 같은 일이 반복되면 개발팀에 알려 주세요.',
  unexpected: '드랍하지 못했어요. 실행 중 예기치 못한 오류가 났어요. 개발팀에 알리고 새 예약을 등록해 주세요.',
}

/**
 * 결과를 운영자가 읽는 해요체 문장으로 바꾼다. 아직 실행 전(`scheduled`)이면 null이다.
 * DB 오류 원문은 이 문장에 들어가지 않는다 — `failureKind`로 분류한 문장만 쓴다.
 */
export function describeScheduleOutcome(item: {
  state: AmbientDropScheduleState
  outcome: ScheduleOutcomeView | null
}): string | null {
  const { state, outcome } = item
  switch (state) {
    case 'scheduled':
      return null
    case 'running':
      return '드랍하는 중이에요. 끝나면 결과가 여기에 보여요.'
    case 'stalled':
      return '실행이 30분 넘게 끝나지 않았어요. 실행 도중 멈췄을 수 있어요. 개발팀에 확인을 요청해 주세요.'
    case 'canceled':
      return '취소한 예약이에요. 드랍하지 않았어요.'
    case 'missed':
      return '드랍하지 않았어요. 드랍 시각에서 3시간이 지나도록 실행되지 않았어요. 다시 드랍하려면 새 예약을 등록해 주세요.'
    case 'skipped':
      return (outcome?.reason && SKIPPED_BY_REASON[outcome.reason]) || SKIPPED_OTHER
    case 'failed':
      return FAILED_BY_KIND[outcome?.failureKind ?? 'unexpected']
    case 'done': {
      if (!outcome) return '드랍을 마쳤어요. 결과 요약이 남아 있지 않아요.'
      let text = `${outcome.spawned}개를 드랍했어요(요청 ${outcome.requested}개).`
      if (outcome.failed > 0) text += ` ${outcome.failed}개는 만들지 못했어요.`
      if (outcome.overlappedPoiCount > 0) text += ` 이미 드랍이 있던 지점 ${outcome.overlappedPoiCount}곳에 겹쳐 드랍했어요.`
      if (outcome.excludedSummary) text += ` 실행 때 빠진 대상: ${outcome.excludedSummary}.`
      return text
    }
  }
}
