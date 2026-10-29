/**
 * 동기화 자동 채움 — 지갑 잼으로 캡슐을 채우고, 가득 차면 열고, 지갑이 빌 때까지 되풀이한다 (티켓 20261028_1733 2회, 상위 20261028_1730 D1~D3)
 *
 * 반복 구조(티켓 「동작 설계」)
 *  - 한 번의 «라운드» = `capsule_auto_fill`(가득 찬 캡슐이면 잼을 쓰지 않고 `full: true`만 돌려준다) → 가득 찼으면 `openCapsule({ counted: true })`.
 *    그래서 지난번에 열지 못해 가득 찬 채 남은 캡슐(지급 실패·트라이브 없음·빈칸 모자람)이 **맨 앞에서 가장 먼저** 열린다. 별도 대기표는 없다.
 *  - 멈추는 조건: 가득 못 채워서(`wallet_empty`, 지갑이 비었다) · 열 수 없어서(`blocked`: `CapsuleError`) · 이용 정지(`suspended`) · 예상 밖 실패(`error`) ·
 *    한 번에 50라운드(`max_rounds`, 남은 잼은 지갑에 남아 다음 동기화가 이어서 쓴다).
 *  - 열 수 없는 경우(`no_tribe`·`insufficient_slots`·`not_full` 등)는 오류가 아니라 «멈춤»이다. 잼은 캡슐에 채운 채 남고 다음 동기화가 다시 시도한다.
 *  - 중복 방지는 따로 없다: 자동 채움은 지갑 잔액만 쓰므로 같은 동기화를 다시 보내면 잔액이 0이라 아무 일도 하지 않는다(정산 쪽 중복은 `jam_apply`의 활동 단위 유일성이 막는다).
 *
 * 던지는 쪽과 던지지 않는 쪽
 *  - `runCapsuleAutoFill`: **던지지 않는다.** 동기화가 부른다. 실패하면 `stopped: 'error'`와 `error`를 돌려주고 그때까지의 진행(`opens`·`filledAmount`)은 그대로 담는다.
 *    이미 일어난 채움·열기는 DB에서 되돌리지 않는다.
 *  - `runCapsuleAutoFillOrThrow`: 같은 일을 하되 `stopped: 'error'`면 그 오류를 던진다(진행 내용은 응답에 못 싣는다 — DB에는 남아 있다). 단독 호출·시험용.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
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
  /** 열기마다의 챕터 오름 처리에서 챕터 배지 판정을 건너뛴다. 동기화 끝 판정이 이어서 읽는 호출부만 켠다(`OpenCapsuleOptions.skipRiseBadgeEvaluation`) */
  skipRiseBadgeEvaluation?: boolean
}

export type CapsuleAutoFillStop =
  /** 지갑 잼을 다 써서 지금 캡슐이 가득 차지 못했다(정상 종료) */
  | 'wallet_empty'
  /** 가득 찬 캡슐을 열 수 없다(`blockedCode`). 채운 잼은 캡슐에 남는다 */
  | 'blocked'
  /** 이용 정지 중이다 */
  | 'suspended'
  /** 50라운드 상한에 닿았다 */
  | 'max_rounds'
  /** 예상 밖 실패(`error`) */
  | 'error'

export interface CapsuleAutoFillResult {
  /** 이번에 지갑에서 캡슐로 옮긴 잼의 합 */
  filledAmount: number
  /** 자동으로 열린 캡슐, 열린 순서대로(개체·챕터 오름이 이벤트 순서다) */
  opens: CountedCapsuleOpenPayload[]
  /** 돈 라운드 수 */
  rounds: number
  stopped: CapsuleAutoFillStop
  /** `stopped`가 `blocked`일 때 열 수 없던 까닭 */
  blockedCode?: CapsuleOpenErrorCode | string
  /** `stopped`가 `error`일 때 그 오류 */
  error?: unknown
}

interface DbAutoFillResult {
  ok?: boolean
  error?: string
  applied?: number
  full?: boolean
}

/** `capsule_auto_fill` 응답을 읽는다. 해석하지 못하면 던진다(채움 단계는 아직 열기 전이라 던져도 잃는 것이 없다). */
function parseFill(data: unknown): { suspended: boolean; applied: number; full: boolean } {
  const r = data as DbAutoFillResult | null
  if (r?.ok === false) {
    if (r.error === 'user_suspended') return { suspended: true, applied: 0, full: false }
    throw new Error(`capsule_auto_fill이 거절했다: ${String(r.error)}`)
  }
  if (r?.ok !== true || typeof r.applied !== 'number' || typeof r.full !== 'boolean') {
    throw new Error('capsule_auto_fill이 해석할 수 없는 응답을 돌려줬다')
  }
  return { suspended: false, applied: r.applied, full: r.full }
}

/** 던지지 않는다. 동기화가 정산 뒤에 부른다(파일 머리말). */
export async function runCapsuleAutoFill(
  supabase: SupabaseClient,
  userId: string,
  options: CapsuleAutoFillOptions = {}
): Promise<CapsuleAutoFillResult> {
  const result: CapsuleAutoFillResult = { filledAmount: 0, opens: [], rounds: 0, stopped: 'max_rounds' }

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
      if (!fill.full) {
        result.stopped = 'wallet_empty'
        return result
      }

      try {
        result.opens.push(await openCapsule(supabase, userId, {
          counted: true,
          rand: options.rand,
          now: options.now,
          ...(options.skipRiseBadgeEvaluation === true ? { skipRiseBadgeEvaluation: true } : {}),
        }))
      } catch (e) {
        if (e instanceof UserSuspendedError) {
          result.stopped = 'suspended'
          return result
        }
        if (e instanceof CapsuleError) {
          if (e.code === 'user_suspended') {
            result.stopped = 'suspended'
            return result
          }
          // 가득 찬 캡슐이 남는다. 다음 동기화의 맨 앞에서 다시 연다
          console.warn(`[capsule-auto-fill] 열 수 없어 멈춘다 — 캡슐은 가득 찬 채 남는다 (userId: ${userId}, code: ${e.code})`)
          result.stopped = 'blocked'
          result.blockedCode = e.code
          return result
        }
        throw e
      }
    }
    result.stopped = 'max_rounds'
    return result
  } catch (e) {
    console.error(`[capsule-auto-fill] 자동 채움 실패 — 진행분은 DB에 남는다 (userId: ${userId}, 채운 양: ${result.filledAmount}, 연 캡슐: ${result.opens.length}):`, e)
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
