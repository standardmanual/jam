/**
 * «JAM! 시작하기» 카드의 실제 3단계 보기 계산 (티켓 20261021_1248 2회, 채원 사전 판정)
 *
 * `real-steps.ts`가 읽은 «했는가» 세 칸과 캡슐 상태, 잠긴 개체 하나를 받아 카드가 그릴 값으로 접는다.
 * 지금 할 차례 행, 잼 모자람, 인벤토리 빈칸 모자람을 여기서 정하고 카드 컴포넌트는 그리기만 한다.
 * DB에 닿지 않는 순수 함수만 있다(서버·클라이언트 어느 쪽에서 가져와도 번들에 서버 모듈이 끌려오지 않는다 — 타입만 가져온다).
 *
 * 규칙:
 * - 세 단계는 순서와 무관하게 각자 독립이다(사용자 결정 2). «지금 할 차례»는 아직 안 한 첫 단계다.
 * - 잼 모자람은 실제로 모자랄 때만 알린다. 여유가 0이어도 미리 경고하지 않는다(가진 잼이 필요한 잼 이상이면 모자라지 않다).
 * - 필요한 잼은 «캡슐에 더 채울 양»(`remaining`)과 «잠긴 개체에 더 채울 양»이다. 이미 채운 양은 빼서, 일부를 채워 둔 유저에게도 사실이다.
 * - 가진 잼은 캡슐 상태의 `balance`다. 캡슐 상태를 읽지 못했으면 잼 모자람을 단정하지 않는다(안내를 생략한다).
 */
import type { CapsuleStatus } from '@/lib/capsule/capsule-contract'
import { capsuleViewStatus } from '@/lib/capsule/capsule-view'
import type { RealStepsProgress } from './real-steps'
import type { LockedOpenTarget } from './locked-target'

/** 실제 단계 키 — 화면 순서와 같다 */
export const REAL_STEP_KEYS = ['sync', 'capsule', 'locked'] as const
export type RealStepKey = (typeof REAL_STEP_KEYS)[number]

export type RealStepRowState = 'done' | 'current' | 'pending'

export interface RealStepRow {
  key: RealStepKey
  state: RealStepRowState
}

/** 잼이 모자랄 때의 값 — `have`가 가진 잼, `need`가 더 필요한 잼 */
export interface JamShortage {
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
      step: 'capsule'
      /** `unknown`은 캡슐 상태를 읽지 못한 경우 — 일반 설명과 «캡슐 열기»만 보인다 */
      stage: 'unknown' | 'filling' | 'ready' | 'noSlots'
      /** 캡슐에 더 채울 잼(`filling`일 때만) */
      need: number | null
      /** 잼이 모자랄 때만 값이 있다(`filling`에서만 가능) */
      shortage: JamShortage | null
      /** 인벤토리 빈칸(`noSlots`이고 빈칸 수를 읽었을 때만) */
      slots: { free: number; needed: number } | null
    }
  | {
      step: 'locked'
      /** 열러 갈 잠긴 개체. 읽지 못했거나 가진 잠긴 개체가 없으면 null */
      target: { itemId: string; need: number } | null
      shortage: JamShortage | null
    }

export interface RealStepsView {
  rows: RealStepRow[]
  doneCount: number
  total: number
  /** 아직 안 한 첫 단계. 세 단계를 모두 마쳤으면 null */
  current: RealCurrentStep | null
  /** Strava 연결 상태 — 잼이 모자랄 때 «동기화» 길이 연결 길인지 동기화 버튼인지 정한다 */
  stravaConnected: boolean
}

export interface RealStepsViewInput {
  steps: RealStepsProgress
  stravaConnected: boolean
  /** 캡슐 상태. 읽지 못했으면 null */
  capsule: CapsuleStatus | null
  /** ③이 지금 할 차례일 때 읽은 잠긴 개체. 아니면(또는 읽지 못했으면) null */
  lockedTarget: LockedOpenTarget | null
}

/** 세 단계의 행 상태. 아직 안 한 첫 단계가 `current`, 그 뒤의 안 한 단계는 `pending`이다. */
export function resolveRealStepRows(steps: RealStepsProgress): RealStepRow[] {
  const doneByKey: Record<RealStepKey, boolean> = {
    sync: steps.sync,
    capsule: steps.capsuleOpened,
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
 * ③ «잠긴 아이템 배지 열기»가 지금 할 차례인가 — 첫 동기화와 캡슐 열기를 마쳤고 잠긴 열기만 남았다.
 * 열러 갈 잠긴 개체는 이때만 읽는다(읽기를 아낀다).
 */
export function needsLockedTarget(steps: RealStepsProgress): boolean {
  return steps.sync && steps.capsuleOpened && !steps.lockedOpened
}

function shortageOf(have: number, need: number): JamShortage | null {
  return need > 0 && have < need ? { have, need } : null
}

function resolveCapsuleStep(capsule: CapsuleStatus | null): Extract<RealCurrentStep, { step: 'capsule' }> {
  if (!capsule) return { step: 'capsule', stage: 'unknown', need: null, shortage: null, slots: null }
  const stage = capsuleViewStatus(capsule)
  if (stage === 'filling') {
    return { step: 'capsule', stage, need: capsule.remaining, shortage: shortageOf(capsule.balance, capsule.remaining), slots: null }
  }
  if (stage === 'noSlots') {
    const slots =
      capsule.freeSlots !== undefined && capsule.neededSlots !== undefined
        ? { free: capsule.freeSlots, needed: capsule.neededSlots }
        : null
    return { step: 'capsule', stage, need: null, shortage: null, slots }
  }
  return { step: 'capsule', stage, need: null, shortage: null, slots: null }
}

function resolveLockedStep(capsule: CapsuleStatus | null, lockedTarget: LockedOpenTarget | null): Extract<RealCurrentStep, { step: 'locked' }> {
  if (!lockedTarget) return { step: 'locked', target: null, shortage: null }
  const need = Math.max(0, lockedTarget.required - lockedTarget.filled)
  // 가진 잼은 캡슐 상태에 실려 온다. 읽지 못했으면 모자라다고 단정하지 않는다.
  const shortage = capsule ? shortageOf(capsule.balance, need) : null
  return { step: 'locked', target: { itemId: lockedTarget.itemId, need }, shortage }
}

/** 카드가 그릴 실제 3단계 보기. 세 단계를 모두 마쳤으면 `current`가 null이다. */
export function resolveRealStepsView(input: RealStepsViewInput): RealStepsView {
  const { steps, stravaConnected, capsule, lockedTarget } = input
  const rows = resolveRealStepRows(steps)
  const doneCount = rows.filter((row) => row.state === 'done').length
  const currentKey = rows.find((row) => row.state === 'current')?.key ?? null

  let current: RealCurrentStep | null = null
  if (currentKey === 'sync') current = { step: 'sync', stravaConnected }
  else if (currentKey === 'capsule') current = resolveCapsuleStep(capsule)
  else if (currentKey === 'locked') current = resolveLockedStep(capsule, lockedTarget)

  return { rows, doneCount, total: REAL_STEP_KEYS.length, current, stravaConnected }
}

/** 세 단계를 모두 마쳤는가 */
export function isRealViewDone(view: RealStepsView): boolean {
  return view.doneCount === view.total
}
