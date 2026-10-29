/**
 * 동기화 자동 채움 — 지갑 잼으로 캡슐을 채우고, 가득 차면 열거나 보류하고, 지갑이 빌 때까지 되풀이한다 (티켓 20261028_1733 2회, 20261028_1734 2회, 상위 20261028_1730 D1~D3·D9)
 *
 * 반복 구조(티켓 「동작 설계」)
 *  - 한 번의 «라운드» = `capsule_auto_fill` 호출(가득 찬 캡슐이면 잼을 쓰지 않고 `full: true`만 돌려준다) → `reachedChapters`가 있으면 `processChapterRise` →
 *    캡슐이 가득 찼으면 «열기 또는 보류». 그래서 지난번에 열지 못해 가득 찬 채 남은 캡슐이 **맨 앞에서 가장 먼저** 처리된다. 별도 대기표는 없다.
 *  - **챕터 오름 판정은 열기가 아니라 이 호출 결과에서 온다**(캡슐이 100%에 처음 닿는 호출이 횟수를 세고 오름을 판정한다, D9). 오름 처리는 여기서만 부른다 —
 *    `openCapsule({ counted: true })`는 부르지 않는다(이중 호출 방지). `skipRiseBadgeEvaluation`을 켜면 오름 처리의 챕터 배지 판정만 건너뛴다.
 *  - 가득 찼을 때: 보류가 이미 있으면(이번 호출이 돌려준 `pendingCount`, 응답에 없으면 이 루프에서 만든 보류까지 센 값) **열지 않고** `capsule_hold_reward`로 보류한다(순서를 지킨다).
 *    보류가 없으면 열기를 시도하고, 빈칸이 모자라(`insufficient_slots`) 못 열면 보류한다. 그 밖의 `CapsuleError`(`no_tribe` 등)는 `blocked` 멈춤이다(가득 찬 채 남는다).
 *  - 보류가 2개면 `capsule_auto_fill`이 채우지 않고 지갑 잼을 소멸시킨 뒤 `applied: 0`으로 돌아온다 → 가득 차지 않은 응답이라 `wallet_empty`로 멈춘다(`forfeitedTotal`에 쌓인다).
 *  - 멈추는 조건: 가득 못 채워서(`wallet_empty`, 지갑이 비었거나 소멸했다) · 열거나 보류할 수 없어서(`blocked`) · 이용 정지(`suspended`) · 예상 밖 실패(`error`) ·
 *    한 번에 50라운드(`max_rounds`, 남은 잼은 지갑에 남아 다음 동기화가 이어서 쓴다).
 *  - 열 수 없는 경우(`no_tribe` 등)는 오류가 아니라 «멈춤»이다. 잼은 캡슐에 채운 채 남고 다음 동기화가 다시 시도한다.
 *  - 알림 단계(`alertStage`)는 **가득 차지 않은** 응답의 값만 `alerts`에 모은다. 한 번에 70% 미만에서 100%로 차면 DB가 단계(90)와 `full`을 함께 돌려주는데, 그때는 단계를 무시하고
 *    보류 전환 결과(`blockedNow`)만 따른다. 알림을 실제로 보내는 일은 이 모듈의 일이 아니다(`sync-auto-fill.ts`, 티켓 20261028_1734 3회).
 *  - 중복 방지는 따로 없다: 자동 채움은 지갑 잔액만 쓰므로 같은 동기화를 다시 보내면 잔액이 0이라 아무 일도 하지 않는다(정산 쪽 중복은 `jam_apply`의 활동 단위 유일성이 막는다).
 *
 * 던지는 쪽과 던지지 않는 쪽
 *  - `runCapsuleAutoFill`: **던지지 않는다.** 동기화가 부른다. 실패하면 `stopped: 'error'`와 `error`를 돌려주고 그때까지의 진행(`opens`·`holds`·`filledAmount` 등)은 그대로 담는다.
 *    이미 일어난 채움·열기·보류는 DB에서 되돌리지 않는다.
 *  - `runCapsuleAutoFillOrThrow`: 같은 일을 하되 `stopped: 'error'`면 그 오류를 던진다(진행 내용은 응답에 못 싣는다 — DB에는 남아 있다). 단독 호출·시험용.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { processChapterRise } from '@/lib/chapter/rise'
import type { Rand } from '@/lib/drop-engine/syncIssue'
import { UserSuspendedError } from '@/lib/suspension/suspension'
import { CapsuleError } from './capsule'
import type { CapsuleOpenErrorCode } from './capsule-contract'
import { openCapsule, type CountedCapsuleOpenPayload } from './open'

/** 한 동기화에서 돌 수 있는 라운드 상한(티켓 「동작 설계」). 남은 잼은 지갑에 남는다 */
export const CAPSULE_AUTO_FILL_MAX_ROUNDS = 50

export interface CapsuleAutoFillOptions {
  rand?: Rand
  now?: Date
  /** 챕터 오름 처리(`processChapterRise`)에서 챕터 배지 판정을 건너뛴다. 동기화 끝 판정이 이어서 읽는 호출부만 켠다 */
  skipRiseBadgeEvaluation?: boolean
}

export type CapsuleAutoFillStop =
  /** 지갑 잼을 다 써서 지금 캡슐이 가득 차지 못했다(정상 종료). 보류가 2개라 잼이 소멸한 경우도 여기다 */
  | 'wallet_empty'
  /** 가득 찬 캡슐을 열거나 보류할 수 없다(`blockedCode`). 채운 잼은 캡슐에 남는다 */
  | 'blocked'
  /** 이용 정지 중이다 */
  | 'suspended'
  /** 50라운드 상한에 닿았다 */
  | 'max_rounds'
  /** 예상 밖 실패(`error`) */
  | 'error'

/** 가득 찬 캡슐을 보류로 옮긴 기록 하나(`capsule_hold_reward` 응답 + 그 캡슐의 챕터) */
export interface CapsuleAutoFillHold {
  /** 보류가 들어간 칸(1 또는 2) */
  slot: number
  /** 이 보류를 만든 뒤의 보류 수 */
  pendingCount: number
  /** 이 보류로 보류가 1개에서 2개가 되어 잼을 받을 수 없게 됐다 */
  blockedNow: boolean
  /** 보류된 캡슐의 챕터. 퀘스트 전 캡슐이면 null */
  chapterNo: number | null
}

export interface CapsuleAutoFillResult {
  /** 이번에 지갑에서 캡슐로 옮긴 잼의 합 */
  filledAmount: number
  /** 자동으로 열린 캡슐, 열린 순서대로. 그 캡슐이 같은 라운드의 채움에서 100%에 닿았다면 오름 정보(`chapterNo`·`reachedChapters`·`chapterCount`)는 닿은 호출의 값이다 */
  opens: CountedCapsuleOpenPayload[]
  /** 열지 않고 보류로 옮긴 캡슐, 옮긴 순서대로 */
  holds: CapsuleAutoFillHold[]
  /** 받을 수 없는 동안 소멸한 지갑 잼의 합 */
  forfeitedTotal: number
  /** 보류가 하나인 동안 «다음 캡슐»이 닿은 채움 단계(70·80·90), 닿은 순서대로. 가득 찬 호출의 단계는 뺀다 */
  alerts: number[]
  /** 이번 동기화에서 보류가 1개에서 2개가 된 적이 있다 — «잼을 받을 수 없게 된 순간» 알림 대상 */
  blockedNow: boolean
  /** 이번 동기화에서 챕터 오름을 처리한 챕터 번호, 처리한 순서대로(열기 없이 보류만 생긴 오름도 담긴다). 오르지 않았으면 빈 배열 */
  reachedChapters: number[]
  /** 돈 라운드 수 */
  rounds: number
  stopped: CapsuleAutoFillStop
  /** `stopped`가 `blocked`일 때 멈춘 까닭 */
  blockedCode?: CapsuleOpenErrorCode | string
  /** `stopped`가 `error`일 때 그 오류 */
  error?: unknown
}

interface DbAutoFillResult {
  ok?: boolean
  error?: string
  applied?: number
  full?: boolean
  forfeited?: unknown
  pendingCount?: unknown
  alertStage?: unknown
  reachedChapters?: unknown
  chapterCount?: unknown
  chapterNo?: unknown
}

interface ParsedFill {
  suspended: boolean
  applied: number
  full: boolean
  forfeited: number
  /** 이 호출이 본 보류 수. 응답에 없으면 null */
  pendingCount: number | null
  /** 보류가 하나일 때 새로 닿은 채움 단계(70·80·90). 없으면 null */
  alertStage: number | null
  reachedChapters: number[]
  chapterNo: number | null
  chapterCount: number | null
}

const ALERT_STAGES: readonly number[] = [70, 80, 90]

/** `capsule_auto_fill` 응답을 읽는다. 해석하지 못하면 던진다(채움 단계는 아직 열기 전이라 던져도 잃는 것이 없다). */
function parseFill(data: unknown): ParsedFill {
  const r = data as DbAutoFillResult | null
  const empty: ParsedFill = {
    suspended: false,
    applied: 0,
    full: false,
    forfeited: 0,
    pendingCount: null,
    alertStage: null,
    reachedChapters: [],
    chapterNo: null,
    chapterCount: null,
  }
  if (r?.ok === false) {
    if (r.error === 'user_suspended') return { ...empty, suspended: true }
    throw new Error(`capsule_auto_fill이 거절했다: ${String(r.error)}`)
  }
  if (r?.ok !== true || typeof r.applied !== 'number' || typeof r.full !== 'boolean') {
    throw new Error('capsule_auto_fill이 해석할 수 없는 응답을 돌려줬다')
  }
  return {
    ...empty,
    applied: r.applied,
    full: r.full,
    forfeited: typeof r.forfeited === 'number' && r.forfeited > 0 ? r.forfeited : 0,
    pendingCount: typeof r.pendingCount === 'number' && Number.isInteger(r.pendingCount) && r.pendingCount >= 0 ? r.pendingCount : null,
    alertStage: typeof r.alertStage === 'number' && ALERT_STAGES.includes(r.alertStage) ? r.alertStage : null,
    reachedChapters: Array.isArray(r.reachedChapters)
      ? (r.reachedChapters as unknown[]).filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1)
      : [],
    chapterNo: typeof r.chapterNo === 'number' ? r.chapterNo : null,
    chapterCount: typeof r.chapterCount === 'number' ? r.chapterCount : null,
  }
}

type HoldOutcome = { kind: 'held'; hold: CapsuleAutoFillHold } | { kind: 'suspended' } | { kind: 'blocked'; code: string }

/** `capsule_hold_reward`를 부르고 응답을 읽는다. 해석하지 못하거나 모르는 거절이면 던진다. */
async function holdReward(supabase: SupabaseClient, userId: string, chapterNo: number | null): Promise<HoldOutcome> {
  const { data, error } = await supabase.rpc('capsule_hold_reward', { p_user_id: userId })
  if (error) throw new Error(`capsule_hold_reward RPC 오류: ${error.message}`)
  const r = data as { ok?: boolean; error?: string; slot?: unknown; pendingCount?: unknown; blockedNow?: unknown } | null
  if (r?.ok === false) {
    if (r.error === 'user_suspended') return { kind: 'suspended' }
    // 보류가 이미 2개이거나 그사이 캡슐이 가득이 아니게 됐다(동시 실행) — 오류가 아니라 멈춤이다. 다음 동기화가 다시 본다
    if (r.error === 'pending_full' || r.error === 'not_full') return { kind: 'blocked', code: r.error }
    throw new Error(`capsule_hold_reward가 거절했다: ${String(r.error)}`)
  }
  if (r?.ok !== true || typeof r.slot !== 'number' || typeof r.pendingCount !== 'number' || typeof r.blockedNow !== 'boolean') {
    throw new Error('capsule_hold_reward가 해석할 수 없는 응답을 돌려줬다')
  }
  return { kind: 'held', hold: { slot: r.slot, pendingCount: r.pendingCount, blockedNow: r.blockedNow, chapterNo } }
}

/** 던지지 않는다. 동기화가 정산 뒤에 부른다(파일 머리말). */
export async function runCapsuleAutoFill(
  supabase: SupabaseClient,
  userId: string,
  options: CapsuleAutoFillOptions = {}
): Promise<CapsuleAutoFillResult> {
  const result: CapsuleAutoFillResult = {
    filledAmount: 0,
    opens: [],
    holds: [],
    forfeitedTotal: 0,
    alerts: [],
    blockedNow: false,
    reachedChapters: [],
    rounds: 0,
    stopped: 'max_rounds',
  }
  // 라운드가 아는 보류 수: 이번 호출이 돌려준 값, 응답에 없으면 이 루프에서 만든 보류까지 센 값
  let knownPending = 0

  try {
    while (result.rounds < CAPSULE_AUTO_FILL_MAX_ROUNDS) {
      result.rounds += 1

      const { data, error } = await supabase.rpc('capsule_auto_fill', { p_user_id: userId })
      if (error) throw new Error(`capsule_auto_fill RPC 오류: ${error.message}`)
      const fill = parseFill(data)
      if (fill.suspended) {
        result.stopped = 'suspended'
        return result
      }
      result.filledAmount += fill.applied
      result.forfeitedTotal += fill.forfeited
      if (fill.pendingCount !== null) knownPending = fill.pendingCount

      // 챕터 오름 판정은 이 호출에서 온다(캡슐이 100%에 처음 닿은 호출). 던지지 않는다.
      if (fill.reachedChapters.length > 0) {
        result.reachedChapters.push(...fill.reachedChapters)
        await processChapterRise(
          { userId, reachedChapters: fill.reachedChapters },
          ...(options.skipRiseBadgeEvaluation === true ? [{ skipBadgeEvaluation: true }] : [])
        )
      }

      if (!fill.full) {
        // 가득 차지 않은 응답의 단계만 모은다. 가득 찬 응답의 단계는 이 분기를 타지 않아 무시된다
        if (fill.alertStage !== null) result.alerts.push(fill.alertStage)
        result.stopped = 'wallet_empty'
        return result
      }

      // 가득 찼다. 같은 호출에서 100%에 닿았다면 닿은 호출의 오름 정보를 열기 응답에 얹는다(열기 쪽 DB는 더는 세지 않는다)
      const reachedNow = fill.applied > 0

      if (knownPending >= 2) {
        // 가득 찬 캡슐을 더 보류할 수 없다(동시 실행으로만 생긴다). 다음 동기화가 다시 본다
        console.warn(`[capsule-auto-fill] 보류가 가득 차 더 보류할 수 없어 멈춘다 — 캡슐은 가득 찬 채 남는다 (userId: ${userId})`)
        result.stopped = 'blocked'
        result.blockedCode = 'pending_full'
        return result
      }

      let needHold = knownPending >= 1
      if (!needHold) {
        try {
          const opened = await openCapsule(supabase, userId, { counted: true, rand: options.rand, now: options.now })
          result.opens.push(
            reachedNow
              ? {
                  ...opened,
                  chapterNo: fill.chapterNo,
                  reachedChapters: fill.reachedChapters,
                  chapterCount: fill.chapterNo === null ? null : fill.chapterCount,
                }
              : opened
          )
        } catch (e) {
          if (e instanceof UserSuspendedError) {
            result.stopped = 'suspended'
            return result
          }
          if (!(e instanceof CapsuleError)) throw e
          if (e.code === 'user_suspended') {
            result.stopped = 'suspended'
            return result
          }
          if (e.code !== 'insufficient_slots') {
            // 가득 찬 캡슐이 남는다. 다음 동기화의 맨 앞에서 다시 시도한다
            console.warn(`[capsule-auto-fill] 열 수 없어 멈춘다 — 캡슐은 가득 찬 채 남는다 (userId: ${userId}, code: ${e.code})`)
            result.stopped = 'blocked'
            result.blockedCode = e.code
            return result
          }
          needHold = true
        }
      }

      if (needHold) {
        const held = await holdReward(supabase, userId, fill.chapterNo)
        if (held.kind === 'suspended') {
          result.stopped = 'suspended'
          return result
        }
        if (held.kind === 'blocked') {
          console.warn(`[capsule-auto-fill] 보류할 수 없어 멈춘다 — 캡슐은 가득 찬 채 남는다 (userId: ${userId}, code: ${held.code})`)
          result.stopped = 'blocked'
          result.blockedCode = held.code
          return result
        }
        result.holds.push(held.hold)
        knownPending = held.hold.pendingCount
        if (held.hold.blockedNow) result.blockedNow = true
      }
    }
    result.stopped = 'max_rounds'
    return result
  } catch (e) {
    console.error(
      `[capsule-auto-fill] 자동 채움 실패 — 진행분은 DB에 남는다 (userId: ${userId}, 채운 양: ${result.filledAmount}, 연 캡슐: ${result.opens.length}, 보류: ${result.holds.length}):`,
      e
    )
    result.stopped = 'error'
    result.error = e
    return result
  }
}

/** `runCapsuleAutoFill`과 같지만 예상 밖 실패(`stopped: 'error'`)를 던진다. */
export async function runCapsuleAutoFillOrThrow(
  supabase: SupabaseClient,
  userId: string,
  options: CapsuleAutoFillOptions = {}
): Promise<CapsuleAutoFillResult> {
  const result = await runCapsuleAutoFill(supabase, userId, options)
  if (result.stopped === 'error') throw result.error instanceof Error ? result.error : new Error(String(result.error))
  return result
}
