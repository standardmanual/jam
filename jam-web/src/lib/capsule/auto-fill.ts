/**
 * 동기화 자동 채움 — 지갑 잼으로 캡슐을 채우고, 가득 차면 열고, 지갑이 빌 때까지 되풀이한다. 빈칸이 모자라면 먼저 추첨해 대기 보상으로 저장하고 멈춘다 (티켓 20261105_0103 T3, 20261105_1437 R1, 상위 20261105_0100)
 *
 * 반복 구조
 *  - 한 번의 «라운드» = `capsule_auto_fill` 호출(가득 찬 캡슐이면 잼을 쓰지 않고 `full: true`만 돌려준다) → `reachedChapters`가 있으면 `processChapterRise` →
 *    캡슐이 가득 찼으면 열기. 그래서 지난번에 열지 못해 가득 찬 채 남은 캡슐이 **맨 앞에서 가장 먼저** 처리된다. 별도 대기표는 없다.
 *  - **챕터 오름 판정은 열기가 아니라 이 호출 결과에서 온다**(캡슐이 100%에 처음 닿는 호출이 횟수를 세고 오름을 판정한다, D9). 오름 처리는 여기서만 부른다 —
 *    `openCapsule`은 오름 처리를 하지 않는다(이중 호출 방지). `skipRiseBadgeEvaluation`을 켜면 오름 처리의 챕터 배지 판정만 건너뛴다.
 *  - 가득 찼을 때 열기를 시도한다. 빈칸이 뽑힌 개수보다 적으면 `openCapsule`이 **먼저 추첨한 결과를 대기 보상으로 저장**하고(`held: true`) 캡슐을 소진한다.
 *    이 라운드는 `inventory_blocked`로 멈춘다(`inventoryBlocked: true`). 지갑의 남은 잼은 그대로다. 그때까지 열린 캡슐(`opens`)은 합쳐서 보인다. 소멸과 알림 단계는 없다(알림 단계 쓰기와 소식은 티켓 20261105_0105 T5에서 걷었다).
 *    대기 보상은 한 캡슐분(1~2개)까지만 쌓인다 — `capsule_auto_fill`이 `pendingCount > 0`을 돌려주면 채우지 않고 같은 이유로 멈춘다(새 캡슐을 채우거나 열지 않는다).
 *    그 밖의 `CapsuleError`(`no_tribe` 등)는 `blocked` 멈춤이다(가득 찬 채 남는다).
 *  - 멈추는 조건: 가득 못 채워서(`wallet_empty`, 지갑이 비었다) · 인벤토리가 차서(`inventory_blocked`) · 열 수 없어서(`blocked`) · 이용 정지(`suspended`) · 예상 밖 실패(`error`) ·
 *    한 번에 50라운드(`max_rounds`, 남은 잼은 지갑에 남아 다음 동기화가 이어서 쓴다).
 *  - 열 수 없는 경우(`no_tribe` 등)는 오류가 아니라 «멈춤»이다. 잼은 캡슐에 채운 채 남고 다음 동기화가 다시 시도한다.
 *  - 중복 방지는 따로 없다: 자동 채움은 지갑 잔액만 쓰므로 같은 동기화를 다시 보내면 잔액이 0이라 아무 일도 하지 않는다(정산 쪽 중복은 `jam_apply`의 활동 단위 유일성이 막는다).
 *
 * 재진입 방지 (티켓 20261028_1735 2회)
 *  - 캡슐 보상으로 받은 아이템 배지가 컬렉션·미션을 완성하면 서비스 활동 잼이 지급되고(`awardServiceJam`), 그 지급도 곧바로 자동 채움을 부른다 — 자동 채움 안에서 같은 유저의 자동 채움이 또 불린다.
 *  - 같은 서버 프로세스에서 한 유저의 자동 채움이 이미 돌고 있으면 안쪽 호출은 아무 일도 하지 않고 `stopped: 'busy'`(진행 분 없음)로 돌아온다.
 *    바깥 루프가 라운드마다 지갑 잔액을 다시 읽어(`capsule_auto_fill`) 새로 들어온 잼을 이어서 채운다. DB 쪽은 캡슐 행 잠금이 직렬화한다.
 *  - 건너뛴 안쪽 호출은 소식·«보지 않은 결과»를 만들 것이 없다(`opens`가 비어 있다). 잠금은 끝나면 반드시(`finally`) 풀린다.
 *  - 이 잠금은 프로세스 안에서만 유효하다. 같은 프로세스의 다른 요청이 같은 유저를 동시에 돌려도 `busy`로 건너뛴다 — 지갑에 남은 잼은 다음 채움이 이어서 쓴다.
 *
 * 던지는 쪽과 던지지 않는 쪽
 *  - `runCapsuleAutoFill`: **던지지 않는다.** 동기화가 부른다. 실패하면 `stopped: 'error'`와 `error`를 돌려주고 그때까지의 진행(`opens`·`filledAmount` 등)은 그대로 담는다.
 *    이미 일어난 채움·열기는 DB에서 되돌리지 않는다.
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
  /** 지갑 잼을 다 써서 지금 캡슐이 가득 차지 못했다(정상 종료) */
  | 'wallet_empty'
  /** 대기 보상이 있어 더 채우거나 열지 않는다(방금 저장했거나 이미 있었다). 지갑 잼은 그대로 남는다 */
  | 'inventory_blocked'
  /** 가득 찬 캡슐을 열 수 없다(`blockedCode`). 채운 잼은 캡슐에 남는다 */
  | 'blocked'
  /** 이용 정지 중이다 */
  | 'suspended'
  /** 50라운드 상한에 닿았다 */
  | 'max_rounds'
  /** 예상 밖 실패(`error`) */
  | 'error'
  /** 같은 서버 프로세스에서 이 유저의 자동 채움이 이미 돌고 있어 아무것도 하지 않았다(재진입 방지). 진행 분이 없다 */
  | 'busy'

export interface CapsuleAutoFillResult {
  /** 이번에 지갑에서 캡슐로 옮긴 잼의 합 */
  filledAmount: number
  /** 자동으로 열린 캡슐, 열린 순서대로. 그 캡슐이 같은 라운드의 채움에서 100%에 닿았다면 오름 정보(`chapterNo`·`reachedChapters`·`chapterCount`)는 닿은 호출의 값이다 */
  opens: CountedCapsuleOpenPayload[]
  /** 대기 보상이 있어 멈췄다(`stopped`가 `inventory_blocked`) */
  inventoryBlocked: boolean
  /** 이번 동기화에서 챕터 오름을 처리한 챕터 번호, 처리한 순서대로(열기 없이 보류만 생긴 오름도 담긴다). 오르지 않았으면 빈 배열 */
  reachedChapters: number[]
  /** 돈 라운드 수 */
  rounds: number
  stopped: CapsuleAutoFillStop
  /** `stopped`가 `blocked`일 때 멈춘 까닭. `inventory_blocked`일 때는 `insufficient_slots`(빈칸 부족으로 대기 보상이 있다) */
  blockedCode?: CapsuleOpenErrorCode | string
  /** `stopped`가 `error`일 때 그 오류 */
  error?: unknown
}

interface DbAutoFillResult {
  ok?: boolean
  error?: string
  applied?: number
  full?: boolean
  pendingCount?: unknown
  reachedChapters?: unknown
  chapterCount?: unknown
  chapterNo?: unknown
}

interface ParsedFill {
  suspended: boolean
  applied: number
  full: boolean
  /** 이 유저의 대기 보상 줄 수. 1 이상이면 DB가 채우지 않았다 */
  pendingCount: number
  reachedChapters: number[]
  chapterNo: number | null
  chapterCount: number | null
}

/** `capsule_auto_fill` 응답을 읽는다. 해석하지 못하면 던진다(채움 단계는 아직 열기 전이라 던져도 잃는 것이 없다). */
function parseFill(data: unknown): ParsedFill {
  const r = data as DbAutoFillResult | null
  const empty: ParsedFill = {
    suspended: false,
    applied: 0,
    full: false,
    pendingCount: 0,
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
    pendingCount: typeof r.pendingCount === 'number' && r.pendingCount > 0 ? r.pendingCount : 0,
    reachedChapters: Array.isArray(r.reachedChapters)
      ? (r.reachedChapters as unknown[]).filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1)
      : [],
    chapterNo: typeof r.chapterNo === 'number' ? r.chapterNo : null,
    chapterCount: typeof r.chapterCount === 'number' ? r.chapterCount : null,
  }
}

/** 지금 자동 채움이 돌고 있는 유저. 같은 프로세스 안의 재진입 방지에 쓴다(파일 머리말) */
const runningUsers = new Set<string>()

/** 던지지 않는다. 동기화가 정산 뒤에 부른다(파일 머리말). 이 유저의 자동 채움이 이미 돌고 있으면 아무 일도 하지 않고 `stopped: 'busy'`로 돌아온다. */
export async function runCapsuleAutoFill(
  supabase: SupabaseClient,
  userId: string,
  options: CapsuleAutoFillOptions = {}
): Promise<CapsuleAutoFillResult> {
  if (runningUsers.has(userId)) {
    return {
      filledAmount: 0,
      opens: [],
      inventoryBlocked: false,
      reachedChapters: [],
      rounds: 0,
      stopped: 'busy',
    }
  }
  runningUsers.add(userId)
  try {
    return await runAutoFillRounds(supabase, userId, options)
  } finally {
    runningUsers.delete(userId)
  }
}

async function runAutoFillRounds(
  supabase: SupabaseClient,
  userId: string,
  options: CapsuleAutoFillOptions
): Promise<CapsuleAutoFillResult> {
  const result: CapsuleAutoFillResult = {
    filledAmount: 0,
    opens: [],
    inventoryBlocked: false,
    reachedChapters: [],
    rounds: 0,
    stopped: 'max_rounds',
  }

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

      // 대기 보상이 이미 있으면 DB가 채우지 않았다(지갑·캡슐 그대로). 더 열지 않고 같은 이유로 멈춘다.
      if (fill.pendingCount > 0) {
        result.stopped = 'inventory_blocked'
        result.inventoryBlocked = true
        result.blockedCode = 'insufficient_slots'
        return result
      }

      // 챕터 오름 판정은 이 호출에서 온다(캡슐이 100%에 처음 닿은 호출). 던지지 않는다.
      if (fill.reachedChapters.length > 0) {
        result.reachedChapters.push(...fill.reachedChapters)
        await processChapterRise(
          { userId, reachedChapters: fill.reachedChapters },
          ...(options.skipRiseBadgeEvaluation === true ? [{ skipBadgeEvaluation: true }] : [])
        )
      }

      if (!fill.full) {
        result.stopped = 'wallet_empty'
        return result
      }

      // 가득 찼다. 같은 호출에서 100%에 닿았다면 닿은 호출의 오름 정보를 열기 응답에 얹는다(열기 쪽 DB는 더는 세지 않는다)
      const reachedNow = fill.applied > 0

      try {
        const opened = await openCapsule(supabase, userId, { rand: options.rand, now: options.now })
        if ('held' in opened) {
          // 빈칸이 뽑힌 개수보다 적어 결과를 대기 보상으로 저장했다. 캡슐은 소진됐고 지갑의 남은 잼은 그대로다 — 새 캡슐을 채우지 않고 멈춘다
          result.stopped = 'inventory_blocked'
          result.inventoryBlocked = true
          result.blockedCode = 'insufficient_slots'
          return result
        }
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
        // 가득 찬 캡슐이 남는다. 다음 동기화의 맨 앞에서 다시 시도한다
        console.warn(`[capsule-auto-fill] 열 수 없어 멈춘다 — 캡슐은 가득 찬 채 남는다 (userId: ${userId}, code: ${e.code})`)
        result.stopped = 'blocked'
        result.blockedCode = e.code
        return result
      }
    }
    result.stopped = 'max_rounds'
    return result
  } catch (e) {
    console.error(
      `[capsule-auto-fill] 자동 채움 실패 — 진행분은 DB에 남는다 (userId: ${userId}, 채운 양: ${result.filledAmount}, 연 캡슐: ${result.opens.length}):`,
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
