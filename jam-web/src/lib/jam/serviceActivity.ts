/**
 * 서비스 활동 잼 지급 — `awardServiceJam` (티켓 20261028_1735 2회, 상위 20261028_1730)
 *
 * 배지 받기·컬렉션 완성·믹스 성공 같은 서비스 활동이 일어나면 DB 함수 `jam_apply_service_activity`(마이그레이션 303)로 지갑에 잼을 넣는다.
 * 값(종류별 고정값)과 하루·주간 상한은 DB 설정 행이 갖고 있어 코드에 두지 않는다. 호출부는 «무슨 종류가, 어떤 원천으로»만 넘긴다.
 *
 * 지급 즉시 채움: 지급량이 0보다 크고 이미 지급한 키의 재전송이 아닐 때만 곧바로 캡슐 자동 채움(`runSyncCapsuleAutoFill` — 채움·열기 또는 보류·소멸·단계 알림·
 * «보지 않은 캡슐 결과» 기록)을 잇는다. 지갑 잔액은 사용자에게 보이는 개념이 아니라 서버 안의 임시 보관이라서다. 응답 뒤에 JAM! 행동 지표를 판정한다 —
 * 잼 조건 주 키 4개(`jamTriggersForServiceJam()`, 서비스 활동 잼이 잼 조건에 합산된다, 티켓 20261028_1736)는 항상, 열린 캡슐이 있거나 챕터가 올랐으면
 * `jamTriggersForCapsuleOpen()` + `chapter_reached`도 더한다. 자동 채움은 챕터 배지 판정을 건너뛰고 돌기 때문에(`skipRiseBadgeEvaluation`) 여기서 이어서 읽는다.
 * 중복 재전송(`duplicate`)·규칙값 0(`rule_zero`)·상한에 걸려 지급이 0인 경우(`capped`)는 채움을 부르지 않는다.
 *
 * 이벤트 키는 `<서비스 kind>:<기존 원천 id>`다. 원천 id는 챕터 점수 때 쓰던 것을 그대로 쓰므로 같은 일을 다시 보내도 같은 키다(유저별 유일, DB가 막는다).
 *
 * 응답 해석 (DB 계약, 303)
 *  - `{ ok: false, error: 'user_suspended' | 'invalid_input' }` — 이용 정지는 지급하지 않을 뿐 실패가 아니라 기록 없이 `{ ok: false }`, 입력 오류는 기록한다
 *  - `{ ok: true, granted, duplicate: true }` — 같은 키 재전송. `granted`는 기존 양. 채우지 않는다
 *  - `{ ok: true, granted: 0, reason: 'rule_zero' }` — 규칙값 0. 채우지 않는다
 *  - `{ ok: true, granted: 0, capped: true }` — 상한에 걸림. 채우지 않는다
 *  - `{ ok: true, granted, capped, duplicate: false, ... }` — 지급(`capped`가 참이면 일부 지급). 채운다
 *  - 지급 뒤 규칙값을 0으로 내리고 같은 키를 다시 보내면 `rule_zero`가 아니라 `duplicate`와 기존 양이 온다(1회차 기록). 어느 쪽이든 채우지 않는다
 *
 * **절대 던지지 않는다.** 실패(RPC 오류·해석 못 할 응답·예외)는 `console.error`와 `engine_decision_log`(`points` 엔진, 이벤트 `service_jam_failed`)에 남기고
 * `{ ok: false }`를 돌려준다. 같은 원천 id로 다시 보낼 수 있다. 자동 채움·행동 지표 판정이 실패해도 지급 결과는 바뀌지 않는다.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 자동 채움과 행동 지표 판정 모듈은 호출 시점에 불러온다 — 이 파일을 가져오는 배지 엔진·동기화와 정적 순환을 만들지 않기 위해서다
 * (`chapter/rise.ts`와 같은 이유).
 */
import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { jamTriggersForCapsuleOpen, jamTriggersForServiceJam } from '@/lib/badge-engine/jamActionProgressTriggers'
import type { JamActionTrigger } from '@/lib/badge-engine/jamActionBadges'
import { logEngineDecision } from '@/lib/engine-log'

/** `service_jam_rules.activity_kind`와 같은 값 7종 */
export const SERVICE_JAM_KINDS = [
  'locked_unlock',
  'badge_earned',
  'combine_success',
  'mission_complete',
  'collection_complete',
  'drop',
  'pickup',
] as const

export type ServiceJamKind = (typeof SERVICE_JAM_KINDS)[number]

/** 이벤트 키: `<서비스 kind>:<기존 원천 id>`. 원천 id가 비면 같은 키로 모이므로 던진다(호출부 버그다) */
export function serviceActivityEventKey(kind: ServiceJamKind, sourceId: string): string {
  if (sourceId.trim() === '') throw new Error('serviceActivityEventKey: sourceId가 비었다')
  return `${kind}:${sourceId}`
}

export interface AwardServiceJamInput {
  userId: string
  kind: ServiceJamKind
  /** 같은 일을 가리키는 원천 id(챕터 점수 때 쓰던 id 그대로). 같은 (kind, sourceId)는 한 번만 지급된다 */
  sourceId: string
}

export type AwardServiceJamResult =
  | {
      ok: true
      /** 이번에 지갑에 들어간 양. `duplicate`이면 이미 지급된 양 */
      granted: number
      /** 같은 키의 재전송이다(새로 지급하지 않았다) */
      duplicate: boolean
      /** 하루·주간 상한에 걸렸다(일부 지급이거나 지급 0) */
      capped: boolean
    }
  | { ok: false }

interface ParsedGrant {
  granted: number
  duplicate: boolean
  capped: boolean
}

/** 지급 응답을 읽는다. 해석하지 못하면 문자열(원인), 이용 정지면 'suspended' */
function parseGrant(data: unknown): ParsedGrant | 'suspended' | string {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return 'jam_apply_service_activity가 해석할 수 없는 응답을 돌려줬다'
  const r = data as Record<string, unknown>
  if (r.ok === false) {
    if (r.error === 'user_suspended') return 'suspended'
    return `jam_apply_service_activity가 거절했다: ${String(r.error)}`
  }
  if (r.ok !== true || typeof r.granted !== 'number' || !Number.isInteger(r.granted) || r.granted < 0) {
    return 'jam_apply_service_activity가 해석할 수 없는 응답을 돌려줬다'
  }
  return { granted: r.granted, duplicate: r.duplicate === true, capped: r.capped === true }
}

/** 지급을 못 한 일을 남긴다(`console.error` + `engine_decision_log`). 던지지 않는다 */
async function recordServiceJamFailure(userId: string, kind: ServiceJamKind, sourceId: string, error: string): Promise<void> {
  try {
    console.error(`[service-jam] 서비스 활동 잼 미지급 — userId: ${userId}, kind: ${kind}, sourceId: ${sourceId}: ${error}`)
    await logEngineDecision('points', 'service_jam_failed', userId, { kind, sourceId, error })
  } catch (e) {
    // logEngineDecision은 스스로 던지지 않지만 이 함수의 약속이 «절대 던지지 않음»이다
    console.error('[service-jam] 실패 기록 중 예외:', e)
  }
}

/**
 * 무거운 모듈은 처음 쓸 때 한 번만 불러 같은 약속을 나눠 쓴다. 호출마다 `import()`를 따로 걸면 동시에 지급이 겹칠 때 모듈이 한 번 더 평가될 수 있다.
 */
let autoFillModule: Promise<typeof import('@/lib/capsule/sync-auto-fill')> | null = null
let actionRouteModule: Promise<typeof import('@/lib/badge-engine/jamActionRoute')> | null = null
const loadAutoFill = () => (autoFillModule ??= import('@/lib/capsule/sync-auto-fill'))
const loadActionRoute = () => (actionRouteModule ??= import('@/lib/badge-engine/jamActionRoute'))

/**
 * 행동 지표 판정을 응답 뒤로 미룬다. 요청 범위 밖(시험·배치)에서는 `after`를 쓸 수 없어 던지므로, 그때는 바로 기다린다.
 * 판정이 실패해도 던지지 않는다(`runJamActionEvaluation`도 던지지 않지만 모듈 불러오기 실패까지 막는다).
 */
async function scheduleJamActionEvaluation(userId: string, triggers: readonly JamActionTrigger[]): Promise<void> {
  const run = async (): Promise<void> => {
    try {
      const { runJamActionEvaluation } = await loadActionRoute()
      await runJamActionEvaluation(userId, triggers)
    } catch (e) {
      console.error(`[service-jam] JAM! 행동 지표 판정 실패 (userId: ${userId}):`, e)
    }
  }
  try {
    after(run)
  } catch {
    // 요청 범위 밖이라 `after`를 쓸 수 없다 — 바로 판정한다
    await run()
  }
}

/**
 * 지급 직후 캡슐을 채우고, 행동 지표를 판정한다. 던지지 않는다.
 * 판정 목록은 항상 잼 조건 주 키 4개(`jamTriggersForServiceJam()`)를 포함한다 — 서비스 활동 잼이 잼 조건에 합산되기 때문이다(티켓 20261028_1736).
 * 열린 캡슐이나 챕터 오름이 있으면 챕터·캡슐 지표를 더한다. 자동 채움이 던져도 잼 조건 판정은 건너뛰지 않는다.
 */
async function fillCapsuleAfterGrant(supabase: SupabaseClient, userId: string): Promise<void> {
  const triggers: JamActionTrigger[] = [...jamTriggersForServiceJam()]
  try {
    const { runSyncCapsuleAutoFill } = await loadAutoFill()
    const step = await runSyncCapsuleAutoFill(supabase, userId)
    if (step.opened || step.chapterRose) triggers.push('chapter_reached')
    if (step.opened) triggers.push(...jamTriggersForCapsuleOpen())
  } catch (e) {
    console.error(`[service-jam] 지급 뒤 캡슐 채움 예외 — 잼은 지갑에 남는다 (userId: ${userId}):`, e)
  }
  await scheduleJamActionEvaluation(userId, triggers)
}

/** 서비스 활동 잼을 지급하고 곧바로 캡슐을 채운다. 던지지 않는다 — 실패하면 기록만 남기고 `{ ok: false }`다. */
export async function awardServiceJam(supabase: SupabaseClient, input: AwardServiceJamInput): Promise<AwardServiceJamResult> {
  const { userId, kind, sourceId } = input
  try {
    if (typeof sourceId !== 'string' || sourceId.trim() === '') {
      await recordServiceJamFailure(userId, kind, String(sourceId), 'sourceId가 비어 이벤트 키를 만들 수 없다')
      return { ok: false }
    }
    const eventKey = serviceActivityEventKey(kind, sourceId)

    const { data, error } = await supabase.rpc('jam_apply_service_activity', { p_user_id: userId, p_kind: kind, p_event_key: eventKey })
    if (error) {
      await recordServiceJamFailure(userId, kind, sourceId, `jam_apply_service_activity RPC 오류: ${error.message ?? String(error)}`)
      return { ok: false }
    }
    const parsed = parseGrant(data)
    if (parsed === 'suspended') return { ok: false }
    if (typeof parsed === 'string') {
      await recordServiceJamFailure(userId, kind, sourceId, parsed)
      return { ok: false }
    }

    // 새로 지급했을 때만 채운다 — 재전송·규칙값 0·상한 도달은 지갑이 그대로다
    if (parsed.granted > 0 && !parsed.duplicate) await fillCapsuleAfterGrant(supabase, userId)

    return { ok: true, granted: parsed.granted, duplicate: parsed.duplicate, capped: parsed.capped }
  } catch (e) {
    await recordServiceJamFailure(userId, kind, String(sourceId), `서비스 활동 잼 예외: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false }
  }
}
