/**
 * 카탈로그 시딩 후 기존 유저 일괄 재평가 (티켓 20260906_1431)
 *
 * ## 왜 필요한가
 * 카탈로그에 배지를 추가해도 발급은 각 유저의 «다음 활동 동기화»를 계기로만 일어난다
 * (`evaluateBadgesDetailed`는 그 자체로는 정기적으로 돌지 않는다 — 계기가 없을 뿐 소급
 * 평가 능력은 원래 있다, 티켓 20260906_1431 §「먼저 정할 것」참조). 그래서 시딩 직후
 * 기존 유저는 다음 실제 활동까지 신규 배지를 받지 못하고 며칠씩 흩어진다(실측:
 * 티켓 20260906_1426, v5 630종 시딩 후 12명 중 1명만 발급).
 *
 * ## 채택한 안 — B안(시딩 후 1회 배치)
 * 정기 크론(C안)은 비용 문제로 채택하지 않았다(Vercel 크론 3종 대비 형평 논거는 티켓
 * 20260906_1142). 대신 **카탈로그 시딩과 항상 짝지어 실행하는 수동 배치**로 구현한다 —
 * `POST /api/admin/badges/reevaluate-all`을 시딩 직후 오케스트레이터/운영자가 반드시
 * 호출한다(자동 트리거 아님). 실행 절차는 `docs/specs/badge-engine/BADGE_ENGINE_UNIFIED.md` §2.17.
 *
 * ## 부수효과 정책 (이 티켓에서 확정)
 * - **피드·알림은 억제한다** — `evaluateBadgesDetailed`의 `silent: true`를 그대로 쓴다.
 *   재평가로 유저당 수십 종이 한 번에 나올 수 있어, 피드에 그대로 실으면
 *   「달리지도 않았는데 배지가 쏟아진다」는 경험을 폭발적인 알림으로 만든다.
 * - **포인트는 정상 지급한다** — `awardPoints`는 `silent`와 무관하게 동작하는 기존 경로를
 *   그대로 둔다. 재평가로 뒤늦게 발견됐을 뿐 실제 활동 이력으로 정당하게 획득한 배지이므로
 *   자연 발급과 동일하게 보상한다.
 * - **가입 앵커(`users.created_at`) 이후 이력만 대상**인 현행 정책은 그대로 유지한다 —
 *   `evaluateBadgesDetailed`가 이미 강제하므로 이 파일은 아무것도 더 하지 않는다.
 * - `triggeredBy`는 `'strava_sync'`와 구분되는 `CATALOG_REEVALUATION_TRIGGER`
 *   (`'catalog_reevaluation'`)를 새로 쓴다 — `engine_decision_log`·
 *   `user_activity_badges.triggered_by`(자유 텍스트, CHECK 제약 없음)에 그대로 남는다.
 * - **`forceFirstSyncGate: false` + `skipInitialSyncFlagUpdate: true`를 항상 함께
 *   명시한다.** 예전엔 `overrideFirstSync: false` 하나로 이 두 효과(게이트 강제 해제 +
 *   상태 갱신 금지)를 동시에 냈는데, 그 파라미터가 이중 의미였던 탓에(티켓 20260906_1928로
 *   분리) 최초 구현이 이 옵션 자체를 아예 넘기지 않았던 시점엔 `initial_sync_done=false`인
 *   (Strava를 한 번도 동기화한 적 없는) 유저가 배지를 하나도 못 받아도 이 배치만으로
 *   "첫 동기화 완료"로 조용히 전환되는 게이트 리뷰 FAIL이 났다(티켓 20260906_1431).
 *   지금은 두 파라미터를 각자의 이름으로 명시한다: `skipInitialSyncFlagUpdate: true`가
 *   그 컬럼을 절대 안 건드리게 하고, `forceFirstSyncGate: false`가 첫 싱크 게이트
 *   (Lv.1/Common 제한)를 유저의 실제 `initial_sync_done` 값과 무관하게 강제로 풀어준다 —
 *   재평가로 나오는 배지는 실제 이력으로 정당하게 얻은 것이므로 등급 제한 없이 정상
 *   발급하는 게 맞다. 부작용으로 이 배치는 `recordActivityRecap`(진짜 첫 동기화 때만
 *   만드는 "첫 배지" 결산)도 절대 만들지 않는다 — 재평가는 진짜 첫 동기화가 아니므로
 *   의도한 동작이다. 실제 첫 동기화가 나중에 일어나면 그때(이 옵션들 없이) 정상적으로
 *   한 번 전환·결산된다.
 *
 * ## JAM! 행동 지표도 같은 배치에서 돌린다 (티켓 20261001_0634, 상위 20260930_1456)
 * JAM! 행동 지표(`jamActionBadges.ts`의 `JAM_ACTION_CONDITION_KEYS` 전부)는 메인 엔진이 항상 fail 처리하는
 * `external` 조건이라 `evaluateBadgesDetailed`로는 발급되지 않는다. 그래서 유저마다 메인 엔진 다음에
 * `evaluateJamActionBadges`를 한 번 더 부른다 — 순서는 동기화(`sync.ts`)와 같다(메인 엔진 → JAM!).
 * 부수효과는 위 정책과 같다: 피드는 억제(`silent`)하고 포인트는 정상 지급하며 dry-run은 아무것도 쓰지 않는다.
 * 섀도우밴 차단은 dry-run에도 반영된다(`issueQualifyingBadges`가 게이트 뒤에서 dryRun을 가른다).
 * 발급 기록의 `triggered_by`에는 `catalog_reevaluation:` 접두가 붙어 자연 발급과 구분된다.
 * JAM! 알림은 호출부(`jamActionRoute.ts`·`sync.ts`)가 만들므로 이 배치는 알림을 만들지 않는다.
 *
 * ## 사용량 지표 6종도 같은 배치에서 돌린다 (티켓 20261001_1022, 상위 20260930_1456)
 * 사용량 지표 6종(팔로워·팔로잉·동기화 횟수·연속 동기화·체크인 카테고리·체크인 목록)도 메인 엔진이 항상 fail
 * 처리하는 `external` 조건이다. 유저마다 메인 엔진 → JAM! → 사용량 순서로 `reevaluateUsageMetricBadges`를 한 번 더
 * 부른다(별도 try/catch, 부수효과는 JAM!과 같다). 동기화 2종은 자연 발급(오늘 기준)과 달리 **과거 기록 기준**이다 —
 * 하루 동기화 횟수는 기록 중 최대 하루, 연속 동기화는 기록 중 가장 긴 연속으로 판정한다(`usageBadges.ts`).
 *
 * ## 무엇을 재사용하고 무엇을 새로 만들지 않았는가
 * 평가 로직은 전부 `evaluateBadgesDetailed` 한 곳에 있다 — 유저별로 `activities: []`를
 * 넘기면 내부에서 `getActivityHistory(anchor~)` 전체를 다시 읽어 평가하므로(=이미 있는
 * 소급 평가 능력), 이 파일은 «누구에게 · 몇 명에게 · 어떤 모드로 돌릴지»만 조립한다.
 * 새 발급 로직이나 조건 평가를 이 파일에 두지 않는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { evaluateBadgesDetailed } from './index'
import { evaluateJamActionBadges, JAM_ACTION_CONDITION_KEYS } from './jamActionBadges'
import { reevaluateUsageMetricBadges, UsageReevaluationError } from './usageBadges'
import type { BadgeRow } from '@/types/database'

/** `strava_sync`·`admin_simulate`와 구분되는 재평가 전용 트리거 식별자 */
export const CATALOG_REEVALUATION_TRIGGER = 'catalog_reevaluation'

/**
 * 한 번의 API 호출에서 허용할 대상 유저 상한. Vercel 서버리스 함수 상한(60초) 안에서
 * 유저 1명당 순차 평가(활동 이력·보유 배지 조회 수 회)가 안전하게 끝나도록 보수적으로
 * 잡았다 — 이 규모를 넘는 재평가는 `userIds`로 나눠 여러 번 호출한다(멱등이라 안전).
 */
export const MAX_TARGET_USERS_PER_CALL = 500

export interface ReevaluateUserResult {
  userId: string
  /** 이번 호출로 (또는 dry-run이면 «만약 실행했다면») 발급될 배지 id */
  earnedBadgeIds: string[]
  earnedCount: number
  /** 발급된(예정된) 배지의 point_reward 합계 */
  pointsAwarded: number
  /** 반복형 배지의 회차 카운터만 오른 건수 합계 — 발급이 아니므로 별도 집계 */
  counterIncrements: number
  /** 위 `earnedCount` 가운데 JAM! 행동 지표 배지 수 — 운영자가 새 JAM! 배지의 몫만 따로 볼 수 있게 한다 */
  jamActionEarnedCount: number
  /** 위 `pointsAwarded` 가운데 JAM! 행동 지표 배지의 point_reward 합계 */
  jamActionPointsAwarded: number
  /** 위 `earnedCount` 가운데 사용량 지표 6종 배지 수 — JAM! 몫과 겹치지 않는다(같은 배지는 JAM! 쪽에서만 센다) */
  usageMetricEarnedCount: number
  /** 위 `pointsAwarded` 가운데 사용량 지표 배지의 point_reward 합계 */
  usageMetricPointsAwarded: number
  /**
   * 이 유저 평가 중 예외가 발생했을 때만 채워진다. 다른 유저 처리는 계속된다.
   * JAM! 지표 판정만 실패하면 `JAM! 지표: <메시지>`, 사용량 지표만 실패하면 `사용량 지표: <메시지>` 형태이고
   * 메인 엔진 결과는 그대로 남는다. 둘 다 실패하면 ` / `로 잇는다
   */
  error?: string
}

export interface ReevaluateCatalogResult {
  dryRun: boolean
  targetUserCount: number
  /** 배지를 1개 이상 (예정대로) 받은 유저 수 */
  affectedUserCount: number
  totalBadgesIssued: number
  totalPointsAwarded: number
  totalCounterIncrements: number
  /** JAM! 행동 지표 배지를 1개 이상 (예정대로) 받은 유저 수 — `affectedUserCount`의 부분집합이 아니라 별도 집계다 */
  jamActionAffectedUserCount: number
  /** 위 `totalBadgesIssued` 가운데 JAM! 행동 지표 배지 수 */
  totalJamActionBadgesIssued: number
  /** 위 `totalPointsAwarded` 가운데 JAM! 행동 지표 배지의 point_reward 합계 */
  totalJamActionPointsAwarded: number
  /** 사용량 지표 6종 배지를 1개 이상 (예정대로) 받은 유저 수 — JAM! 몫과 별도 집계다 */
  usageMetricAffectedUserCount: number
  /** 위 `totalBadgesIssued` 가운데 사용량 지표 배지 수 */
  totalUsageMetricBadgesIssued: number
  /** 위 `totalPointsAwarded` 가운데 사용량 지표 배지의 point_reward 합계 */
  totalUsageMetricPointsAwarded: number
  users: ReevaluateUserResult[]
}

/**
 * 대상 유저 전원에 대해 `evaluateBadgesDetailed`를 순차 호출한다.
 *
 * 유저 간 병렬화를 하지 않는다 — service role 커넥션·Supabase 쪽 동시 요청 상한을
 * 배려한 보수적 선택이다(이 라우트는 사람이 드물게 수동으로 돌리는 배치이지 응답
 * 지연에 민감한 사용자 경로가 아니다).
 */
export async function reevaluateUsersForCatalog(
  supabase: ReturnType<typeof createServiceClient>,
  options: { dryRun: boolean; userIds: string[] }
): Promise<ReevaluateCatalogResult> {
  const { dryRun, userIds } = options

  // point_reward 조회는 유저 루프 밖에서 한 번만 — 카탈로그 규모(수백~천 종)는
  // 유저 수보다 훨씬 안정적이라 매 유저 반복 조회할 이유가 없다.
  // deleted_at 필터: evaluateBadgesDetailed의 발급 후보 조회(index.ts)와 같은 조건을
  // 맞춰 둔다 — earned에 담기는 id는 항상 살아있는 배지뿐이므로 실질적 차이는 없지만
  // (조회 결과가 많아 봐야 조회되지 않는 id는 그냥 무시되는 lookup map이다), 같은
  // 테이블을 보는 두 조회가 서로 다른 필터를 쓰면 나중에 읽는 사람이 오해하기 쉽다.
  const { data: badgesRaw, error: badgesError } = await supabase
    .from('badges')
    .select('id, point_reward')
    .eq('type', 'activity')
    .is('deleted_at', null)

  if (badgesError) {
    console.error('[reevaluateUsersForCatalog] 배지 point_reward 조회 오류:', badgesError)
  }
  const pointRewardById = new Map<string, number>(
    ((badgesRaw ?? []) as Pick<BadgeRow, 'id' | 'point_reward'>[]).map((b) => [b.id, b.point_reward ?? 0])
  )

  const users: ReevaluateUserResult[] = []
  for (const userId of userIds) {
    try {
      const { earned, counted } = await evaluateBadgesDetailed(userId, [], {
        dryRun,
        triggeredBy: CATALOG_REEVALUATION_TRIGGER,
        silent: true,
        // 반드시 둘 다 명시적으로 넘긴다 — 게이트 리뷰 FAIL(티켓 20260906_1431) 사유:
        // 넘기지 않으면 initial_sync_done=false인(=Strava를 한 번도 동기화한 적 없는)
        // 유저가 이 배치에 걸리기만 해도 배지를 하나도 못 받아도 "첫 동기화 완료"로
        // 조용히 전환됐다. `skipInitialSyncFlagUpdate: true`가 그 컬럼을 절대 건드리지
        // 않게 하고, `forceFirstSyncGate: false`가 `isFirstSync`를 유저의 실제
        // `initial_sync_done`과 무관하게 강제로 false로 만들어 첫 싱크 게이트
        // (Lv.1/Common 제한)를 걸지 않는다: 재평가로 나오는 배지는 실제 활동 이력으로
        // 정당하게 얻은 것이므로 등급 제한 없이 정상 발급하는 것이 맞다. 부작용: 진짜
        // 첫 동기화 때 나가는 "첫 배지" 결산(recordActivityRecap)도 이 배치에서는 절대
        // 만들어지지 않는다 — 의도한 동작이다(재평가는 진짜 첫 동기화가 아니다).
        // 상세: BADGE_ENGINE_UNIFIED.md §2.17.
        forceFirstSyncGate: false,
        skipInitialSyncFlagUpdate: true,
      })
      const counterIncrements = counted.reduce((sum, c) => sum + c.addedEarnCount, 0)

      // JAM! 행동 지표 — 메인 엔진 다음에(동기화와 같은 순서) 별도 try/catch로 돌린다.
      // 던져도 위 메인 엔진 결과는 유지하고 `error`에만 남긴다(다른 유저 처리도 계속된다).
      // `evaluateJamActionBadges`는 지표 단위 계산 오류를 안에서 삼키므로 여기까지 올라오는 건
      // 예기치 못한 예외(배지 조회 후 발급 경로 등)뿐이다.
      let jamEarned: { id: string; name: string }[] = []
      let jamError: string | undefined
      try {
        const jamRaw = await evaluateJamActionBadges(userId, JAM_ACTION_CONDITION_KEYS, supabase, {
          dryRun,
          silent: true,
          triggeredByPrefix: CATALOG_REEVALUATION_TRIGGER,
        })
        // dry-run은 insert가 없어 보유 목록이 바뀌지 않는다 — 배지 하나가 JAM! 지표 키를 둘 이상 가졌다면
        // 실제 실행에서는 첫 지표가 발급하고 둘째는 «이미 보유»로 건너뛰므로, 같은 배지는 한 번만 센다
        jamEarned = [...new Map(jamRaw.map((b) => [b.id, b])).values()]
      } catch (jamErr) {
        const jamMessage = jamErr instanceof Error ? jamErr.message : String(jamErr)
        console.error(`[reevaluateUsersForCatalog] JAM! 지표 평가 실패 — userId: ${userId}:`, jamErr)
        jamError = `JAM! 지표: ${jamMessage}`
      }

      // 사용량 지표 6종 — JAM! 다음에 별도 try/catch로 돌린다. 값 계산 오류는 안에서 삼키지 않고 던지므로
      // 여기서 `error`에 남긴다(JAM!의 알려진 한계 2번을 되풀이하지 않는다). 메인 엔진·JAM! 결과는 유지한다.
      let usageRaw: { id: string; name: string }[] = []
      let usageError: string | undefined
      try {
        usageRaw = await reevaluateUsageMetricBadges(userId, supabase, {
          dryRun,
          silent: true,
          triggeredByPrefix: CATALOG_REEVALUATION_TRIGGER,
        })
      } catch (usageErr) {
        const usageMessage = usageErr instanceof Error ? usageErr.message : String(usageErr)
        console.error(`[reevaluateUsersForCatalog] 사용량 지표 평가 실패 — userId: ${userId}:`, usageErr)
        usageError = `사용량 지표: ${usageMessage}`
        // 오류가 나기 전에 이미 발급한 배지는 결과에 남긴다 — 포인트까지 지급됐는데 응답에서 빠지면 합계가 어긋난다
        if (usageErr instanceof UsageReevaluationError) usageRaw = usageErr.earned
      }
      // dry-run은 insert가 없어 보유 목록이 바뀌지 않는다 — 같은 배지는 한 번만 센다. JAM!과 사용량 지표 키를
      // 함께 가진 배지도 실제 실행에서는 JAM!이 먼저 발급하고 사용량은 «이미 보유»로 건너뛰므로 JAM! 몫으로만 센다
      const jamIds = new Set(jamEarned.map((b) => b.id))
      const usageEarned = [...new Map(usageRaw.map((b) => [b.id, b])).values()].filter((b) => !jamIds.has(b.id))

      const jamActionPointsAwarded = jamEarned.reduce((sum, b) => sum + (pointRewardById.get(b.id) ?? 0), 0)
      const usageMetricPointsAwarded = usageEarned.reduce((sum, b) => sum + (pointRewardById.get(b.id) ?? 0), 0)
      const allEarned = [...earned, ...jamEarned, ...usageEarned]
      const userError = [jamError, usageError].filter((e): e is string => Boolean(e)).join(' / ')
      users.push({
        userId,
        earnedBadgeIds: allEarned.map((b) => b.id),
        earnedCount: allEarned.length,
        pointsAwarded: allEarned.reduce((sum, b) => sum + (pointRewardById.get(b.id) ?? 0), 0),
        counterIncrements,
        jamActionEarnedCount: jamEarned.length,
        jamActionPointsAwarded,
        usageMetricEarnedCount: usageEarned.length,
        usageMetricPointsAwarded,
        ...(userError ? { error: userError } : {}),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[reevaluateUsersForCatalog] 유저 평가 실패 — userId: ${userId}:`, err)
      users.push({
        userId,
        earnedBadgeIds: [],
        earnedCount: 0,
        pointsAwarded: 0,
        counterIncrements: 0,
        jamActionEarnedCount: 0,
        jamActionPointsAwarded: 0,
        usageMetricEarnedCount: 0,
        usageMetricPointsAwarded: 0,
        error: message,
      })
    }
  }

  return {
    dryRun,
    targetUserCount: users.length,
    affectedUserCount: users.filter((u) => u.earnedCount > 0).length,
    totalBadgesIssued: users.reduce((sum, u) => sum + u.earnedCount, 0),
    totalPointsAwarded: users.reduce((sum, u) => sum + u.pointsAwarded, 0),
    totalCounterIncrements: users.reduce((sum, u) => sum + u.counterIncrements, 0),
    jamActionAffectedUserCount: users.filter((u) => u.jamActionEarnedCount > 0).length,
    totalJamActionBadgesIssued: users.reduce((sum, u) => sum + u.jamActionEarnedCount, 0),
    totalJamActionPointsAwarded: users.reduce((sum, u) => sum + u.jamActionPointsAwarded, 0),
    usageMetricAffectedUserCount: users.filter((u) => u.usageMetricEarnedCount > 0).length,
    totalUsageMetricBadgesIssued: users.reduce((sum, u) => sum + u.usageMetricEarnedCount, 0),
    totalUsageMetricPointsAwarded: users.reduce((sum, u) => sum + u.usageMetricPointsAwarded, 0),
    users,
  }
}
