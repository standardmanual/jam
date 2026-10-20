/**
 * 챕터 점수 «배지 받기» 공용 함수 (티켓 20261019_1315 2a회, 운영 로직 12.2절)
 *
 * 액티비티 배지·체크인 배지를 **새로** 받은 순간 챕터 점수 `badge_receive`를 센다. 발급 지점이 여러 곳(엔진 새 발급, 사용량·행동 지표 배지,
 * 미션 보상, 컬렉션 보상, 온보딩 완료, 체크인 첫 획득)이라 «무엇을 세지 않는가»를 이 함수 한 곳에 둔다. 호출부는 새 행을 실제로 넣은 뒤에만 부른다
 * (23505·이미 보유·dryRun은 점수 대상이 아니다).
 *
 * 세지 않는 것 (사용자 결정 2·3, 5-4에서 넘어온 항목):
 *  - 액티비티·체크인이 아닌 배지(아이템 배지) — 12.2절 «배지 받기»는 액티비티·체크인만 말한다
 *  - 숨김 배지(`is_hidden === true`)
 *  - 조건 키가 제외 키 집합과 겹치는 배지 — 팔로워·팔로잉·챕터 도달(`BADGE_RECEIVE_EXCLUDED_CONDITION_KEYS`). 포인트를 가리키는 조건 키는 지금 하나도 없다
 *  - 소급·시험 발급 — 카탈로그 재평가 배치, 어드민 시뮬레이터(`admin_simulate`, `admin_test`), `dryRun`(`BADGE_RECEIVE_EXCLUDED_TRIGGERS`)
 *  - 이용 정지 중인 유저 — 정지된 드랍 주인이 다른 유저가 줍는 순간 받는 배지(`picked_up_by_user_count` 등)가 정지 중에도 발급되기 때문이다
 *
 * 첫 획득의 원천 id는 (유저, 배지) 기준 결정적 id 하나다. 같은 배지를 초기화·삭제 뒤 다시 받아도 같은 키라 점수는 한 번만 센다(사용자 결정 2).
 *
 * 반복형은 회차마다 따로 센다(2b회, 티켓 20261019_1315 14번). `occurrenceActivityId`를 주면 원천 id가 (유저, 배지, 활동 id)로 달라져 첫 획득의
 * (유저, 배지) id와 구분된다(JSON 배열 길이가 달라 우연히도 겹치지 않는다). 회차 여러 건은 `awardBadgeReceiveOccurrenceScores`가 한 번에 센다.
 * 제외 규칙(출처·유형·숨김·제외 조건 키·이용 정지)은 회차에도 그대로 적용된다.
 *
 * **절대 던지지 않는다.** 점수 쪽이 어떻게 되든 배지 발급과 응답은 그대로다. 점수 호출 실패는 `awardChapterScore`가 기록하고,
 * 이 함수가 하는 이용 정지 확인이 실패하면 «정지 아님»으로 보지 않고(정지 중인 유저가 조회 실패 틈에 점수를 얻으면 안 된다) 점수를 세지 않은 채
 * 같은 방식으로 기록한다(같은 원천 id로 다시 보낼 수 있다).
 *
 * 서버 전용이다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { logEngineDecision } from '@/lib/engine-log'
import { getActiveSuspension } from '@/lib/suspension/suspension'
import type { BadgeType } from '@/types/database'
import { awardChapterScore, type AwardChapterScoreResult } from './score'
import { deterministicSourceId } from './source-id'

/** 점수에 들어가는 배지 유형. 아이템 배지는 뺀다 */
const SCORED_BADGE_TYPES: readonly BadgeType[] = ['activity', 'checkin']

/**
 * 조건에 이 키가 하나라도 있으면 «배지 받기» 점수에서 뺀다. 포인트를 가리키는 조건 키는 지금 0개다(티켓 20261019_1314 조사).
 * 나중에 포인트 키가 생기면 여기에만 더한다(DB의 허용 키 CHECK와 `conditionRegistry.ts`도 함께 고친다).
 * `jam_total_earned` 같은 «잼» 키는 포인트가 아니라 뺄 이유가 없다.
 */
export const BADGE_RECEIVE_EXCLUDED_CONDITION_KEYS: ReadonlySet<string> = new Set(['follower_count', 'following_count', 'chapter_reached'])

/**
 * 점수에서 빼는 발급 트리거(엔진의 `triggeredBy`와 같은 값). 카탈로그 재평가 배치는 `reevaluateCatalog.ts`의 `CATALOG_REEVALUATION_TRIGGER`와
 * 같은 값이다(`__tests__/badge-receive.test.ts`가 고정한다 — 재평가 모듈이 엔진을 가져오므로 순환을 피해 여기에 문자열로 둔다).
 */
export const BADGE_RECEIVE_EXCLUDED_TRIGGERS: ReadonlySet<string> = new Set(['catalog_reevaluation', 'admin_simulate', 'admin_test'])

export interface BadgeReceiveOrigin {
  /** 발급을 일으킨 트리거. 엔진의 `triggeredBy`, 사용량·행동 지표 배지는 `triggeredByPrefix`가 있으면 그 값, 그 밖의 지점은 자연 발급 이름 */
  triggeredBy: string
  /** true면 점수를 세지 않는다(쓰기가 없는 평가) */
  dryRun?: boolean
}

export interface BadgeReceiveBadge {
  id: string
  type: BadgeType
  /** `true`일 때만 숨김으로 본다. 값이 없으면(체크인 배지는 DB 제약상 숨김일 수 없다) 숨김이 아니다 */
  is_hidden?: boolean | null
  /** 조건 키만 읽는다. 값이 없으면 제외 키가 없다고 본다 */
  condition_json?: object | null
}

export interface AwardBadgeReceiveScoreInput {
  userId: string
  badge: BadgeReceiveBadge
  origin: BadgeReceiveOrigin
  /**
   * 반복형의 «새 회차» 점수일 때 그 회차의 근거 활동 id(Strava 활동 id). 생략하면 첫 획득(원천 id = 유저·배지)이다.
   * 값을 주면 비었거나(null·빈 문자열) 올바른 활동 id가 아닌 경우(정수가 아니거나 0 이하)를 세지 않고 기록한다 — 회차를 구분할 수 없는 키를 만들지 않는다.
   */
  occurrenceActivityId?: number | string | null
}

export type BadgeReceiveSkipReason = 'origin' | 'badge_type' | 'hidden' | 'excluded_condition' | 'suspended'

export type BadgeReceiveScoreOutcome =
  | { status: 'scored'; score: Extract<AwardChapterScoreResult, { ok: true }> }
  | { status: 'skipped'; reason: BadgeReceiveSkipReason }
  | { status: 'failed' }

function isExcludedOrigin(origin: BadgeReceiveOrigin): boolean {
  if (origin.dryRun === true) return true
  const trigger = origin.triggeredBy
  for (const excluded of BADGE_RECEIVE_EXCLUDED_TRIGGERS) {
    // `catalog_reevaluation:usage_metric:...`처럼 접두로 붙는 형태도 같은 트리거다
    if (trigger === excluded || trigger.startsWith(`${excluded}:`)) return true
  }
  return false
}

function hasExcludedConditionKey(condition: object | null | undefined): boolean {
  if (!condition) return false
  return Object.keys(condition).some((key) => BADGE_RECEIVE_EXCLUDED_CONDITION_KEYS.has(key))
}

/** 회차 활동 id → 원천 id 조각. Strava 활동 id는 양의 정수다. 구분할 수 없는 값이면 null */
function occurrenceKeyPart(activityId: number | string | null): string | null {
  if (typeof activityId === 'number') return Number.isSafeInteger(activityId) && activityId > 0 ? String(activityId) : null
  if (typeof activityId === 'string') return activityId.trim() === '' ? null : activityId
  return null
}

async function recordBadgeReceiveFailure(userId: string, sourceId: string | null, error: string): Promise<void> {
  console.error(`[chapter-score] 배지 받기 점수 미반영 — userId: ${userId}, sourceId: ${sourceId ?? '미정'}: ${error}`)
  await logEngineDecision('points', 'chapter_score_failed', userId, {
    kind: 'badge_receive',
    sourceId,
    amount: 1,
    occurredOn: null,
    error,
  })
}

/** 새로 받은 액티비티·체크인 배지 1개의 «배지 받기» 점수를 센다. 던지지 않는다. */
export async function awardBadgeReceiveScore(supabase: SupabaseClient, input: AwardBadgeReceiveScoreInput): Promise<BadgeReceiveScoreOutcome> {
  const { userId, badge, origin } = input
  let sourceId: string | null = null
  try {
    if (isExcludedOrigin(origin)) return { status: 'skipped', reason: 'origin' }
    if (!SCORED_BADGE_TYPES.includes(badge.type)) return { status: 'skipped', reason: 'badge_type' }
    if (badge.is_hidden === true) return { status: 'skipped', reason: 'hidden' }
    if (hasExcludedConditionKey(badge.condition_json)) return { status: 'skipped', reason: 'excluded_condition' }

    // 회차 점수는 활동 id를 키 조각으로 더한다. 활동 id가 비면 이 회차는 세지 않는다(위 제외 규칙에 걸린 경우는 조용히 건너뛰므로 기록하지 않는다)
    if (input.occurrenceActivityId === undefined) {
      sourceId = deterministicSourceId('badge_receive', userId, badge.id)
    } else {
      const part = occurrenceKeyPart(input.occurrenceActivityId)
      if (part === null) {
        await recordBadgeReceiveFailure(
          userId,
          null,
          `회차 활동 id를 알 수 없어 회차 점수를 세지 않았다 (badgeId: ${badge.id}, activityId: ${String(input.occurrenceActivityId)})`
        )
        return { status: 'failed' }
      }
      sourceId = deterministicSourceId('badge_receive', userId, badge.id, part)
    }

    // 이용 정지 확인은 가장 비싼 검사(DB 조회)라 마지막에 한다. 조회가 실패하면 «정지 아님»으로 보지 않는다
    let suspended: boolean
    try {
      suspended = (await getActiveSuspension(supabase, userId)) !== null
    } catch (e) {
      await recordBadgeReceiveFailure(userId, sourceId, `이용 정지 확인 실패: ${e instanceof Error ? e.message : String(e)}`)
      return { status: 'failed' }
    }
    if (suspended) return { status: 'skipped', reason: 'suspended' }

    const score = await awardChapterScore(supabase, { userId, kind: 'badge_receive', sourceId })
    return score.ok ? { status: 'scored', score } : { status: 'failed' }
  } catch (e) {
    // 위 호출은 스스로 던지지 않지만 이 함수의 약속이 «절대 던지지 않음»이다 — 기록하다 다시 던지지 않도록 한 번 더 감싼다
    try {
      await recordBadgeReceiveFailure(userId, sourceId, `배지 받기 점수 예외: ${e instanceof Error ? e.message : String(e)}`)
    } catch (recordError) {
      console.error('[chapter-score] 배지 받기 실패 기록 중 예외:', recordError)
    }
    return { status: 'failed' }
  }
}

/** 회차 점수를 동시에 보내는 상한. 첫 동기화처럼 회차가 많을 때 점수 호출이 줄줄이 직렬로 이어지지 않게 한다 */
const OCCURRENCE_SCORE_CONCURRENCY = 5

export interface AwardBadgeReceiveOccurrenceScoresInput {
  userId: string
  badge: BadgeReceiveBadge
  origin: BadgeReceiveOrigin
  /**
   * 센 회차의 근거 활동 id 목록(`earn_history[].strava_activity_id`). 같은 id가 여러 번 있어도 한 번만 센다.
   * 비었거나 올바르지 않은 id는 세지 않고 기록한다(`occurrenceActivityId` 설명 참고).
   */
  activityIds: ReadonlyArray<number | string | null | undefined>
}

export interface AwardBadgeReceiveOccurrenceScoresResult {
  /** 점수 호출이 성공한 회차 수(같은 키를 다시 보내 이미 센 것도 성공으로 센다) */
  scored: number
  /** 점수를 세지 못하고 기록만 남긴 회차 수 */
  failed: number
}

/**
 * 반복형 한 배지의 여러 회차 점수를 센다 (티켓 20261019_1315 2b회). 던지지 않는다.
 *
 * 회차마다 `awardBadgeReceiveScore(occurrenceActivityId)`를 부르므로 제외 규칙과 «던지지 않는다»는 약속이 그대로 적용된다.
 * 첫 회차의 결과가 «제외»이면 나머지도 같은 이유로 제외다(출처·유형·숨김·제외 조건 키·이용 정지는 회차와 무관하다) — 남은 회차를 부르지 않는다.
 * 그 밖에는 회차마다 따로 시도하고 실패는 회차마다 기록한다.
 */
export async function awardBadgeReceiveOccurrenceScores(
  supabase: SupabaseClient,
  input: AwardBadgeReceiveOccurrenceScoresInput
): Promise<AwardBadgeReceiveOccurrenceScoresResult> {
  const result: AwardBadgeReceiveOccurrenceScoresResult = { scored: 0, failed: 0 }
  try {
    const { userId, badge, origin } = input

    // 같은 활동 id는 한 번만. 비었거나 올바르지 않은 값은 합치지 않고 그대로 넘겨 회차마다 기록하게 한다
    const seen = new Set<string>()
    const activityIds: (number | string | null)[] = []
    for (const id of input.activityIds) {
      const part = id == null ? null : occurrenceKeyPart(id)
      if (part !== null) {
        if (seen.has(part)) continue
        seen.add(part)
      }
      activityIds.push(id ?? null)
    }
    if (activityIds.length === 0) return result

    const award = async (occurrenceActivityId: number | string | null) => {
      const outcome = await awardBadgeReceiveScore(supabase, { userId, badge, origin, occurrenceActivityId })
      if (outcome.status === 'scored') result.scored += 1
      else if (outcome.status === 'failed') result.failed += 1
      return outcome
    }

    const [head, ...rest] = activityIds
    const first = await award(head)
    if (first.status === 'skipped') return result

    for (let i = 0; i < rest.length; i += OCCURRENCE_SCORE_CONCURRENCY) {
      await Promise.all(rest.slice(i, i + OCCURRENCE_SCORE_CONCURRENCY).map(award))
    }
    return result
  } catch (e) {
    // awardBadgeReceiveScore는 스스로 던지지 않지만 이 함수의 약속도 «절대 던지지 않음»이다
    console.error('[chapter-score] 배지 받기 회차 점수 처리 중 예외:', e)
    return result
  }
}
