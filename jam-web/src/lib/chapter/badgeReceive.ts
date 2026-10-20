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
 * 원천 id는 (유저, 배지) 기준 결정적 id 하나다. 같은 배지를 초기화·삭제 뒤 다시 받아도 같은 키라 점수는 한 번만 센다(사용자 결정 2).
 * 반복형의 새 회차 점수(회차마다 따로 센다)는 2b회 몫이다.
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

    sourceId = deterministicSourceId('badge_receive', userId, badge.id)

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
