/**
 * 운영 묶음 상태 계산 (티켓 20260930_1817, 순수 함수).
 *
 * 묶음 상태는 저장하지 않고 항목 상태에서 계산한다(PRD §7, 상위 티켓 20260930_1455 가정 7). 이 파일은
 * 클라이언트(화면)도 불러오므로 서버 전용 모듈을 끌어오지 않는다.
 *
 * 규칙(PRD §7.2가 같은 내용을 사람의 말로 적는다):
 * 1. 반려·취소·실패 항목은 단계 계산에서 뺀다. 10개 밖 상태 값도 뺀다.
 * 2. 남은 항목이 결정 전(도착·검토중)이면: 전부 도착일 때만 「도착」, 아니면 「검토」.
 * 3. 남은 항목이 모두 결정된 뒤에는 승인됨·준비중이 하나라도 있으면 「준비」, 없고 게재중이 있으면 「게재」,
 *    없고 예약됨이 있으면 「예약」, 전부 종료면 「종료」.
 * 4. 실패 항목이 있으면 단계와 별개로 「일부 실패」를 붙인다(`partialFailure`).
 * 5. 가정 7이 정하지 않은 빈틈: 남은 항목이 없으면 실패가 있을 때 「실패」, 없고 취소가 있을 때 「취소」(반려와
 *    섞여도), 나머지는 「반려」다. 계산에 쓸 항목이 하나도 없으면(항목 0개, 또는 전부 10개 밖 값) 「도착」이다.
 *    이때 `partialFailure`는 꺼진다(전부 실패이면 「일부」가 아니다).
 */
import { OPS_ITEM_STATUSES, type OpsItemStatus } from '@/lib/admin/opsInbox/constants'

/** 단계 표시줄의 6단계(PRD §4·§7.1). */
export const OPS_STAGES = ['arrived', 'review', 'prepare', 'scheduled', 'live', 'ended'] as const
export type OpsStage = (typeof OPS_STAGES)[number]

/** 묶음 단계: 표시줄 6단계, 또는 표시줄 밖의 세 상태(전부 반려·취소·실패인 묶음). */
export type OpsBundleStage = OpsStage | 'rejected' | 'cancelled' | 'failed'

export interface OpsBundleStatus {
  stage: OpsBundleStage
  /** 실패 항목이 있고 묶음 전체가 「실패」는 아닐 때 참이다. */
  partialFailure: boolean
  /** 도착·검토중이 아닌 항목 수(10개 밖 상태 값은 세지 않는다). S2 「결정 3/12」. */
  decidedCount: number
  /** 표시줄 밖 상태의 항목 수. 표시줄 아래 칩 줄이 쓴다. */
  offBar: { rejected: number; cancelled: number; failed: number }
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set(OPS_ITEM_STATUSES)

const STAGE_OF_STATUS: Record<OpsItemStatus, OpsStage | null> = {
  arrived: 'arrived',
  reviewing: 'review',
  approved: 'prepare',
  preparing: 'prepare',
  scheduled: 'scheduled',
  live: 'live',
  ended: 'ended',
  rejected: null,
  cancelled: null,
  failed: null,
}

/** 항목 상태 → 표시줄 단계(PRD §7.1). 반려·취소·실패와 10개 밖 값은 null이다. */
export function stageOfItemStatus(status: string): OpsStage | null {
  if (!KNOWN_STATUSES.has(status)) return null
  return STAGE_OF_STATUS[status as OpsItemStatus]
}

export function computeBundleStatus(statuses: readonly string[]): OpsBundleStatus {
  const count: Record<OpsItemStatus, number> = {
    arrived: 0,
    reviewing: 0,
    approved: 0,
    preparing: 0,
    scheduled: 0,
    live: 0,
    ended: 0,
    rejected: 0,
    cancelled: 0,
    failed: 0,
  }
  let known = 0
  for (const status of statuses) {
    if (!KNOWN_STATUSES.has(status)) continue
    count[status as OpsItemStatus] += 1
    known += 1
  }

  const offBar = { rejected: count.rejected, cancelled: count.cancelled, failed: count.failed }
  const decidedCount = known - count.arrived - count.reviewing
  const remaining = known - count.rejected - count.cancelled - count.failed

  const finish = (stage: OpsBundleStage): OpsBundleStatus => ({
    stage,
    partialFailure: count.failed > 0 && stage !== 'failed',
    decidedCount,
    offBar,
  })

  // 계산에 쓸 항목이 하나도 없다: 항목 0개이거나 전부 10개 밖 값이다.
  if (known === 0) return finish('arrived')

  // 남은 항목이 없다: 전부 반려·취소·실패다.
  if (remaining === 0) {
    if (count.failed > 0) return finish('failed')
    if (count.cancelled > 0) return finish('cancelled')
    return finish('rejected')
  }

  // 결정 전 항목이 남아 있다.
  if (count.arrived + count.reviewing > 0) {
    return finish(count.arrived === remaining ? 'arrived' : 'review')
  }

  // 남은 항목이 모두 결정됐다.
  if (count.approved + count.preparing > 0) return finish('prepare')
  if (count.live > 0) return finish('live')
  if (count.scheduled > 0) return finish('scheduled')
  return finish('ended')
}

// ── 받은 기획함 상태 탭 ───────────────────────────────────────────────────────────────────────────

/** S2 상태 탭 4개. 묶음 단계로 나눈다(결정할 것=도착·검토, 진행 중=준비·예약·게재, 끝남·멈춤=종료·반려·취소·실패). */
export const OPS_INBOX_TABS = ['all', 'decide', 'progress', 'closed'] as const
export type OpsInboxTab = (typeof OPS_INBOX_TABS)[number]

/** 묶음 단계가 속한 탭. `all`은 모든 묶음이 속하므로 돌려주지 않는다. */
export function tabOfBundleStage(stage: OpsBundleStage): Exclude<OpsInboxTab, 'all'> {
  switch (stage) {
    case 'arrived':
    case 'review':
      return 'decide'
    case 'prepare':
    case 'scheduled':
    case 'live':
      return 'progress'
    default:
      return 'closed'
  }
}
