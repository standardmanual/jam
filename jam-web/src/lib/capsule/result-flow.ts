/**
 * 합친 연출의 흐름 상태 — 레이아웃의 `CapsuleResultProvider`가 쓰는 순수 함수 모음 (티켓 20261028_1740 3회, 채원 사전 판정)
 *
 * 서버가 내려준 보지 않은 결과(`CapsuleUnseenResult`) 하나가 «기다림 → 오버레이 → 닫는 중 → (획득한 배지 보기) → 끝» 순서로 한 번 지나간다.
 * 화면 훅이 없어 상태 전이와 판정을 시험으로 고정할 수 있다. 상태는 바꾸지 않고 새 값을 돌려주며, 바뀐 것이 없으면 **같은 값**을 돌려준다
 * (렌더 중에 «바뀌었나»를 참조 비교로 가르기 때문이다).
 *
 * - 같은 `ids`는 한 번만 띄운다(`handled`). 새 `ids`는 새 결과로 한 번 띄운다. 연출 도중 새 결과가 와도 끊지 않고 끝난 뒤에 다룬다(레벨 트리거).
 * - 이벤트가 없는 결과는 띄우지 않는다(처리한 것으로만 센다).
 * - 게이지 붙들기: 기다림·오버레이 동안. «닫기»나 «획득한 배지 보기»를 누르는 순간(닫는 중부터) 풀린다.
 * - 챕터 오름 카드 대기: 결과가 끝날 때까지(보상 화면 포함).
 *
 * 클라이언트에서도 가져오므로 서버 전용 모듈을 가져오지 않는다(`capsule-boundary.test.ts`).
 */
import { readCelebratedChapter, writeCelebratedChapter, type StorageLike } from '@/lib/chapter/celebrate'
import type { CapsuleUnseenResult } from './capsule-contract'
import type { OverlayOrigin } from './result-overlay-model'

export type ResultStage = 'waiting' | 'overlay' | 'closing' | 'rewards'

export interface ResultSession {
  /** 같은 결과인지 가르는 값(`ids`를 정렬해 이은 것) */
  key: string
  result: CapsuleUnseenResult
  stage: ResultStage
  /** «획득한 배지 보기»를 골랐는가 — 오버레이가 닫힌 뒤 보상 화면을 연다 */
  viaRewards: boolean
  /** 오버레이가 번져 나갈 자리(뷰포트 기준). 띄우는 순간 정해진다 */
  origin: OverlayOrigin | null
}

export interface ResultFlowState {
  session: ResultSession | null
  /** 이미 다룬 결과의 key */
  handled: readonly string[]
}

export function createFlowState(): ResultFlowState {
  return { session: null, handled: [] }
}

/** `ids` 순서가 달라도 같은 결과로 본다 */
export function resultKey(result: CapsuleUnseenResult): string {
  return [...result.ids].sort().join(',')
}

/**
 * 레이아웃이 내려준 결과를 받는다. 결과가 없거나, 연출이 진행 중이거나, 이미 다룬 결과면 상태를 그대로 둔다.
 * 새 결과면 «기다림»으로 시작한다(다른 오버레이가 열려 있는지는 화면이 판단한다).
 */
export function receiveResult(state: ResultFlowState, result: CapsuleUnseenResult | null): ResultFlowState {
  if (!result || state.session) return state
  const key = resultKey(result)
  if (state.handled.includes(key)) return state
  const handled = [...state.handled, key]
  if (result.events.length === 0) return { session: null, handled }
  return { session: { key, result, stage: 'waiting', viaRewards: false, origin: null }, handled }
}

function withSession(state: ResultFlowState, from: ResultStage, change: (session: ResultSession) => ResultSession): ResultFlowState {
  if (!state.session || state.session.stage !== from) return state
  return { ...state, session: change(state.session) }
}

/** 기다림 → 오버레이 */
export function startOverlay(state: ResultFlowState, origin: OverlayOrigin): ResultFlowState {
  return withSession(state, 'waiting', (s) => ({ ...s, stage: 'overlay', origin }))
}

/** «획득한 배지 보기»를 골랐다(닫기 시작 직전에 불린다) */
export function markViaRewards(state: ResultFlowState): ResultFlowState {
  return withSession(state, 'overlay', (s) => (s.viaRewards ? s : { ...s, viaRewards: true }))
}

/** 오버레이가 닫히기 시작한다 → 게이지 붙들기가 풀린다 */
export function beginClosing(state: ResultFlowState): ResultFlowState {
  return withSession(state, 'overlay', (s) => ({ ...s, stage: 'closing' }))
}

/** 디졸브가 끝났다 → 보상 화면 또는 끝 */
export function finishClosing(state: ResultFlowState): ResultFlowState {
  if (!state.session || state.session.stage !== 'closing') return state
  if (state.session.viaRewards) return { ...state, session: { ...state.session, stage: 'rewards' } }
  return { ...state, session: null }
}

/** 보상 화면을 닫았다(또는 보여 줄 것이 없어 건너뛴다) → 끝 */
export function finishSession(state: ResultFlowState): ResultFlowState {
  return state.session ? { ...state, session: null } : state
}

/** 결과가 있고 연출이 아직 끝나지 않았다 */
export function isResultPending(state: ResultFlowState): boolean {
  return state.session !== null
}

/** 게이지를 2% 원에 붙들어야 한다 */
export function isGaugeHeld(state: ResultFlowState): boolean {
  const stage = state.session?.stage
  return stage === 'waiting' || stage === 'overlay'
}

/** 오버레이를 그려야 한다(닫히는 디졸브 동안 포함) */
export function isOverlayMounted(state: ResultFlowState): boolean {
  const stage = state.session?.stage
  return stage === 'overlay' || stage === 'closing'
}

export interface RectLike {
  top: number
  left: number
  width: number
  height: number
}

/**
 * 오버레이가 번져 나갈 자리. 게이지의 채움이 화면 안에 보이면 그 자리, 없거나 화면 밖이면 화면 가운데의 지름 `circle` 원이다.
 * `circle`은 게이지 채움 오른쪽 끝 원의 지름(`gaugeCircleDiameter`)이다. 좌표는 뷰포트 기준이다.
 */
export function pickResultOrigin(fill: RectLike | null, viewport: { width: number; height: number }, circle: number): OverlayOrigin {
  if (
    fill &&
    fill.width > 0 &&
    fill.height > 0 &&
    fill.top + fill.height > 0 &&
    fill.top < viewport.height &&
    fill.left + fill.width > 0 &&
    fill.left < viewport.width
  ) {
    return { top: fill.top, left: fill.left, width: fill.width, height: fill.height, circle }
  }
  return {
    top: (viewport.height - circle) / 2,
    left: (viewport.width - circle) / 2,
    width: circle,
    height: circle,
    circle,
  }
}

/**
 * 합친 연출이 보여 줄 챕터를 기기에 «마지막으로 축하한 챕터»로 저장한다 — 같은 오름이 챕터 오름 카드로 또 뜨지 않게 한다.
 * 저장값이 이미 같거나 더 높으면 낮추지 않는다(더 높은 챕터의 카드를 다시 불러내지 않기 위해서다). 저장이 막혀 있으면 false이고, 연출은 그래도 띄운다.
 */
export function rememberShownChapter(storage: StorageLike | null, userId: string, chapterNo: number): boolean {
  const read = readCelebratedChapter(storage, userId)
  if (!read.ok) return false
  if (read.value !== null && read.value >= chapterNo) return false
  return writeCelebratedChapter(storage, userId, chapterNo)
}
