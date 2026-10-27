/**
 * 운영 상황판의 화면 상태 다섯 가지 (티켓 20261026_2023 1회차, 어드민 상황판 PRD §3.1, 순수 함수).
 *
 * 안쪽 항목 상태 10개는 그대로 두고 화면에서만 묶는다. 서버·클라이언트가 같이 불러오므로 서버 전용 모듈을 가져오지 않는다.
 */
import { OPS_ITEM_STATUSES, type OpsItemStatus } from '@/lib/admin/opsInbox/constants'

/** 화면 상태 다섯 가지. 순서가 곧 화면 순서다. */
export const SCREEN_STATES = ['decide', 'progress', 'live', 'problem', 'done'] as const
export type ScreenState = (typeof SCREEN_STATES)[number]

/** 화면 글자(두 단어 이내). */
export const SCREEN_STATE_LABELS: Record<ScreenState, string> = {
  decide: '결정 필요',
  progress: '진행 중',
  live: '게재 중',
  problem: '문제',
  done: '끝남',
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set(OPS_ITEM_STATUSES)

const SCREEN_STATE_OF_STATUS: Record<OpsItemStatus, ScreenState> = {
  arrived: 'decide',
  reviewing: 'decide',
  approved: 'progress',
  preparing: 'progress',
  scheduled: 'progress',
  live: 'live',
  failed: 'problem',
  ended: 'done',
  rejected: 'done',
  cancelled: 'done',
}

/** 칸 안에 작게 쓰는 세부. 세부가 없는 상태(도착·검토중·게재중·실패)는 목록에 없다. */
const SCREEN_DETAIL_OF_STATUS: Partial<Record<OpsItemStatus, string>> = {
  approved: '승인됨',
  preparing: '준비중',
  scheduled: '예약됨',
  ended: '종료',
  rejected: '반려',
  cancelled: '취소',
}

/** 항목 상태 → 화면 상태. 10개 밖 값은 null이다. */
export function screenStateOfItemStatus(status: string): ScreenState | null {
  if (!KNOWN_STATUSES.has(status)) return null
  return SCREEN_STATE_OF_STATUS[status as OpsItemStatus]
}

/** 항목 상태 → 칸 안에 작게 쓰는 세부. 세부가 없거나 10개 밖 값이면 null이다. */
export function screenDetailOfItemStatus(status: string): string | null {
  if (!KNOWN_STATUSES.has(status)) return null
  return SCREEN_DETAIL_OF_STATUS[status as OpsItemStatus] ?? null
}

/** 내 차례에 뜨는 화면 상태인가(결정 필요·문제만 참). */
export function isMyTurnState(state: ScreenState): boolean {
  return state === 'decide' || state === 'problem'
}
