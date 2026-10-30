/**
 * «JAM! 시작하기» 카드의 실제 2단계 보기 계산 (티켓 20261021_1248 2회, 채원 사전 판정 · 2단계·포인트 기준으로 바뀜 20261028_1738 1회)
 *
 * `real-steps.ts`가 읽은 «했는가» 두 칸과 잠긴 개체 하나, 가진 포인트를 받아 카드가 그릴 값으로 접는다.
 * 지금 할 차례 행과 포인트 모자람을 여기서 정하고 카드 컴포넌트는 그리기만 한다.
 * DB에 닿지 않는 순수 함수만 있다(서버·클라이언트 어느 쪽에서 가져와도 번들에 서버 모듈이 끌려오지 않는다 — 타입만 가져온다).
 *
 * 규칙:
 * - 두 단계는 순서와 무관하게 각자 독립이다(사용자 결정 2). «지금 할 차례»는 아직 안 한 첫 단계다.
 * - 포인트 모자람은 실제로 모자랄 때만 알린다. 여유가 0이어도 미리 경고하지 않는다(가진 포인트가 필요 포인트 이상이면 모자라지 않다).
 * - 필요 포인트가 0이면 모자랄 수 없다. 가진 포인트를 읽지 못했으면(null) 모자람을 단정하지 않는다(안내를 생략한다).
 * - 열러 갈 개체를 모르면(읽지 못했거나 없음) 일반 길(`/inventory`)이고 모자람도 알리지 않는다.
 */
import type { RealStepsProgress } from './real-steps'
import type { LockedOpenTarget } from './locked-target'

/** 실제 단계 키 — 화면 순서와 같다 */
export const REAL_STEP_KEYS = ['sync', 'locked'] as const
export type RealStepKey = (typeof REAL_STEP_KEYS)[number]

export type RealStepRowState = 'done' | 'current' | 'pending'

export interface RealStepRow {
  key: RealStepKey
  state: RealStepRowState
}

/** 포인트가 모자랄 때의 값 — `have`가 가진 포인트, `need`가 필요한 포인트 */
export interface PointShortage {
  have: number
  need: number
}

/** 지금 할 차례 행이 보여 줄 것 */
export type RealCurrentStep =
  | {
      step: 'sync'
      /** Strava가 연결돼 있는가. 아니면 연결 길(`/api/strava/auth`)로 보낸다 */
      stravaConnected: boolean
    }
  | {
      step: 'locked'
      /** 열러 갈 잠긴 개체. 읽지 못했거나 가진 잠긴 개체가 없거나 필요 포인트가 비어 있으면 null. `need`는 열기까지 드는 포인트(0이면 포인트 없이 열린다) */
      target: { itemId: string; need: number } | null
      /** 가진 포인트가 필요 포인트보다 적을 때만 값이 있다 */
      shortage: PointShortage | null
    }

export interface RealStepsView {
  rows: RealStepRow[]
  doneCount: number
  total: number
  /** 아직 안 한 첫 단계. 두 단계를 모두 마쳤으면 null */
  current: RealCurrentStep | null
  /** Strava 연결 상태 */
  stravaConnected: boolean
}

export interface RealStepsViewInput {
  steps: RealStepsProgress
  stravaConnected: boolean
  /** ②가 지금 할 차례일 때 읽은 잠긴 개체. 아니면(또는 읽지 못했으면) null */
  lockedTarget: LockedOpenTarget | null
  /** 가진 포인트. 필요 포인트가 0보다 클 때만 읽고, 읽지 못했으면 null */
  pointBalance: number | null
}

/** 두 단계의 행 상태. 아직 안 한 첫 단계가 `current`, 그 뒤의 안 한 단계는 `pending`이다. */
export function resolveRealStepRows(steps: RealStepsProgress): RealStepRow[] {
  const doneByKey: Record<RealStepKey, boolean> = {
    sync: steps.sync,
    locked: steps.lockedOpened,
  }
  let currentTaken = false
  return REAL_STEP_KEYS.map((key) => {
    if (doneByKey[key]) return { key, state: 'done' as const }
    if (!currentTaken) {
      currentTaken = true
      return { key, state: 'current' as const }
    }
    return { key, state: 'pending' as const }
  })
}

/**
 * ② «잠긴 아이템 배지 열기»가 지금 할 차례인가 — 첫 동기화를 마쳤고 잠긴 열기가 남았다.
 * 열러 갈 잠긴 개체는 이때만 읽는다(읽기를 아낀다).
 */
export function needsLockedTarget(steps: RealStepsProgress): boolean {
  return steps.sync && !steps.lockedOpened
}

/**
 * 가진 포인트를 읽어야 하는가 — 열러 갈 개체를 알고 그 필요 포인트가 0보다 클 때만이다.
 * 0이면 모자랄 수 없고, 개체를 모르면 비교할 값이 없다.
 */
export function needsPointBalance(lockedTarget: LockedOpenTarget | null): boolean {
  return lockedTarget !== null && lockedTarget.pointsRequired > 0
}

function resolveLockedStep(lockedTarget: LockedOpenTarget | null, pointBalance: number | null): Extract<RealCurrentStep, { step: 'locked' }> {
  if (!lockedTarget) return { step: 'locked', target: null, shortage: null }
  const need = lockedTarget.pointsRequired
  const shortage = need > 0 && pointBalance !== null && pointBalance < need ? { have: pointBalance, need } : null
  return { step: 'locked', target: { itemId: lockedTarget.itemId, need }, shortage }
}

/** 카드가 그릴 실제 2단계 보기. 두 단계를 모두 마쳤으면 `current`가 null이다. */
export function resolveRealStepsView(input: RealStepsViewInput): RealStepsView {
  const { steps, stravaConnected, lockedTarget, pointBalance } = input
  const rows = resolveRealStepRows(steps)
  const doneCount = rows.filter((row) => row.state === 'done').length
  const currentKey = rows.find((row) => row.state === 'current')?.key ?? null

  let current: RealCurrentStep | null = null
  if (currentKey === 'sync') current = { step: 'sync', stravaConnected }
  else if (currentKey === 'locked') current = resolveLockedStep(lockedTarget, pointBalance)

  return { rows, doneCount, total: REAL_STEP_KEYS.length, current, stravaConnected }
}

/** 두 단계를 모두 마쳤는가 */
export function isRealViewDone(view: RealStepsView): boolean {
  return view.doneCount === view.total
}
