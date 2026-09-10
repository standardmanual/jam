/**
 * JAM! 카테고리 — 서비스 사용량 배지 평가·발급 (서버 사이드 전용, 티켓 20260910_1557)
 *
 * 팔로워 수·팔로잉 수·하루 동기화 횟수처럼 Strava 활동과 무관한 "서비스 사용량" 지표로
 * 배지를 판정·발급한다. 이 3개 조건 키(`follower_count`/`following_count`/
 * `daily_sync_count`)는 `conditionRegistry.ts`에 `role: 'meta'` + `evaluation: 'external'`로
 * 선언돼 있어 — `mission_reward`와 같은 자리 — badge-engine의 `evaluateConditionDetailed`는
 * (role: 'measurable'인 필드가 하나도 없으므로) 이 조건들을 항상 fail 처리한다. 이 파일이
 * 그 대신 판정·발급을 전담한다.
 *
 * 발급 규칙은 BADGE_ENGINE_UNIFIED.md §Step 3-A(등급형)·§Step 3-B(레벨형)와 **같은 정책**을
 * 최소 재구현한다 — 순수 함수를 그대로 재사용하지 않은 이유는, `index.ts`의 그 로직이 활동
 * 이력·선행 배지 게이트·2단 교차 게이트·홍수 방지·첫 싱크 게이트까지 한 몸으로 얽혀 있어
 * (badge-engine/index.ts 전체 구조), 이 서비스 사용량 지표(게이트 없는 단독 조건 전제 —
 * Out of Scope)만 떼어 쓸 수 있는 형태가 아니기 때문이다. 옮긴 정책은 둘뿐이다:
 *   - 등급형(`rarity` 있음): 같은 이름(name) 그룹에서 미보유 + 조건 충족 중 최상위 tier
 *     1개만 발급한다(성장 티어). 선택되지 않은 하위 tier는 이번 호출에서 발급되지 않고,
 *     다음 호출에서도 "보유 tier 이하"로 걸려 영구히 스킵된다(main 엔진과 동일한 특성).
 *   - 레벨형(`rarity` NULL): 같은 계열(`family_key`) 안에서 보유 레벨 + 1부터 조건을
 *     만족하는 동안 연속 발급한다(최상위 1개가 아니다).
 * 선행 배지·교차 게이트(`prerequisite_badge_names` 등)는 평가하지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { awardPoints } from '@/lib/points'
import { recordFeedEvent } from '@/lib/activity-feed'
import { getUserBanLevel, shouldAllowDrop } from '@/lib/abusing/shadow-ban'
import { getAbusingPolicy } from '@/lib/abusing/policy'
import { kstDateString } from '@/lib/notifications/kst'
import { isLeveledBadge, familyKeyOf } from './badgeKind'
import { rarityTier } from '@/lib/rarity'
import type { BadgeRow } from '@/types/database'

/** 이 파일이 판정하는 서비스 사용량 지표 3종 — `conditionRegistry.ts` 선언과 1:1 대응 */
export type UsageMetric = 'follower_count' | 'following_count' | 'daily_sync_count'

export interface UsageBadgeEarned {
  id: string
  name: string
}

/**
 * `metric` 조건을 가진 배지 후보를 조회해 `currentValue`로 판정하고, 조건을 충족하는
 * 배지를 발급한다(`user_activity_badges` insert + `point_reward` 지급 + `badge_earned`
 * 피드 이벤트 — 기존 배지 발급과 동일한 부수효과).
 *
 * DB 조회 실패는 예외를 던지지 않고 빈 배열로 폴백한다(로그만 남긴다) — 이 판정 자체가
 * 실패해도 팔로우/동기화 같은 원본 액션은 계속 성공해야 하기 때문이다. 다만 이 함수
 * **자체**가 던질 수 있는 예외(예상 밖 오류)까지 전부 삼키지는 않는다 — 호출부(팔로우 API·
 * 동기화 API)가 각자 `try/catch`로 한 번 더 감싼다.
 *
 * `client`를 생략하면 새 service_role 클라이언트를 만든다(`getAbusingPolicy`와 같은 패턴).
 * `syncStravaActivities` 경로(`processFetchedActivities`)는 **주입된 클라이언트를 넘겨야
 * 한다** — 그 경로는 주입 사슬을 끊으면 안 된다는 전제로 이미 테스트가 고정돼 있다
 * (`sync-vehicle-speed-filter.test.ts`의 "주입된 supabase 클라이언트를 쓴다").
 */
export async function evaluateUsageBadges(
  userId: string,
  metric: UsageMetric,
  currentValue: number,
  client?: SupabaseClient
): Promise<UsageBadgeEarned[]> {
  const supabase = client ?? createServiceClient()
  const now = new Date().toISOString()

  const { data: allBadgesRaw, error: badgesError } = await supabase
    .from('badges')
    .select('*')
    .eq('type', 'activity')
    .is('deleted_at', null)
    .or(`valid_from.is.null,valid_from.lte.${now}`)
    .or(`valid_until.is.null,valid_until.gte.${now}`)

  if (badgesError) {
    console.error(`[evaluateUsageBadges] 배지 목록 조회 오류 (metric: ${metric}):`, badgesError)
    return []
  }

  // 이 metric 조건을 가진 배지만 후보로 좁힌다 — 다른 지표(다른 서비스 사용량·Strava
  // 조건)를 가진 배지는 이 호출과 무관하다.
  const candidates = ((allBadgesRaw as BadgeRow[] | null) ?? []).filter(
    (b) => typeof b.condition_json?.[metric] === 'number'
  )
  if (candidates.length === 0) return []

  const { data: ownedRaw, error: ownedError } = await supabase
    .from('user_activity_badges')
    .select('badge_id')
    .eq('user_id', userId)
    .in('badge_id', candidates.map((b) => b.id))

  if (ownedError) {
    console.error(`[evaluateUsageBadges] 보유 배지 조회 오류 (metric: ${metric}):`, ownedError)
    return []
  }
  const ownedIds = new Set((ownedRaw ?? []).map((r: { badge_id: string }) => r.badge_id))

  // 종류별로 그룹핑 — 등급형은 이름(name) 단위(성장 티어), 레벨형은 계열(family_key) 단위.
  // (`badgeKind.ts`의 판정 기준 그대로 — rarity IS NULL이면 레벨형)
  const gradedByName = new Map<string, BadgeRow[]>()
  const leveledByFamily = new Map<string, BadgeRow[]>()
  for (const b of candidates) {
    if (isLeveledBadge(b)) {
      const key = familyKeyOf(b)
      if (!leveledByFamily.has(key)) leveledByFamily.set(key, [])
      leveledByFamily.get(key)!.push(b)
    } else {
      if (!gradedByName.has(b.name)) gradedByName.set(b.name, [])
      gradedByName.get(b.name)!.push(b)
    }
  }

  const toIssue: BadgeRow[] = []

  // ── 등급형 — 이름 그룹 안에서 미보유 + 조건 충족 중 최상위 tier 1개만 (§Step 3-A) ──
  for (const [, group] of gradedByName) {
    const highestOwned = Math.max(
      0,
      ...group.filter((b) => ownedIds.has(b.id)).map((b) => rarityTier(b.rarity))
    )
    const eligible = group.filter((b) => {
      if (ownedIds.has(b.id)) return false
      if (rarityTier(b.rarity) <= highestOwned) return false
      const threshold = b.condition_json?.[metric] as number
      return currentValue >= threshold
    })
    if (eligible.length === 0) continue
    eligible.sort((a, b) => rarityTier(b.rarity) - rarityTier(a.rarity))
    toIssue.push(eligible[0])
  }

  // ── 레벨형 — 계열 안에서 보유 레벨 + 1부터 연속 발급 (§Step 3-B) ──
  for (const [, group] of leveledByFamily) {
    const ownedLevel = Math.max(0, ...group.filter((b) => ownedIds.has(b.id)).map((b) => b.level ?? 0))
    // 레벨 오름차순. 같은 레벨이 둘이면 카탈로그 오류이므로 sort_order로 순서를 고정한다
    // (main 엔진 Step 3-B와 동일한 타이브레이크).
    const sorted = [...group].sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.sort_order - b.sort_order)
    let expected = ownedLevel + 1
    for (const b of sorted) {
      const level = b.level
      if (level == null) continue // DB CHECK((rarity IS NULL) = (level IS NOT NULL))가 막지만 방어적으로 스킵
      if (level < expected) continue // 이미 지난 레벨
      if (ownedIds.has(b.id)) {
        expected = level + 1
        continue
      }
      if (level > expected) continue // 이전 레벨 미획득 — 이 계열의 프런티어가 아니다
      const threshold = b.condition_json?.[metric] as number
      if (currentValue < threshold) continue // 프런티어가 막힘 — 위 레벨도 계속 이 분기에서 스킵된다
      toIssue.push(b)
      expected = level + 1
    }
  }

  if (toIssue.length === 0) return []

  // 섀도우밴 — rarity가 있는(등급형) 후보만 고가치 발급을 차단한다. 레벨형(rarity NULL)은
  // 등급 서열이 없어 이 게이트의 대상이 아니다(Acceptance Criteria 10의 "(rarity)" 한정).
  // toIssue가 비어 있으면(대부분의 호출) 여기 도달하지 않으므로 밴 조회 비용이 들지 않는다.
  const banLevel = await getUserBanLevel(userId)
  const policy = banLevel !== 'none' ? await getAbusingPolicy() : null

  const earned: UsageBadgeEarned[] = []
  for (const badge of toIssue) {
    if (badge.rarity && policy && !shouldAllowDrop(badge.rarity, banLevel, policy)) {
      console.info(
        `[evaluateUsageBadges] 섀도우밴으로 발급 차단 — userId: ${userId}, badge: ${badge.name}, rarity: ${badge.rarity}`
      )
      continue
    }

    const { error: insertError } = await supabase
      .from('user_activity_badges')
      .insert({ user_id: userId, badge_id: badge.id, triggered_by: `usage_metric:${metric}` })

    if (insertError) {
      // 23505(중복키)는 «이미 보유»다 — 동시 호출이 같은 배지를 동시에 채운 경우뿐이므로
      // 조용히 넘긴다. 어느 쪽이든 부수효과는 일으키지 않는다.
      if (insertError.code !== '23505') {
        console.error(`[evaluateUsageBadges] 배지 발급 오류 (badge_id: ${badge.id}):`, insertError)
      }
      continue
    }

    console.info(
      `[evaluateUsageBadges] 배지 발급 — userId: ${userId}, badge: ${badge.name}, metric: ${metric}, value: ${currentValue}`
    )
    earned.push({ id: badge.id, name: badge.name })

    // 잼 포인트 지급 — 배지에 point_reward가 붙어 있으면 발급 직후 1회 지급 (기존 배지
    // 발급과 동일한 사유 코드. 0이면 awardPoints가 스킵)
    const pointReward = badge.point_reward ?? 0
    if (pointReward > 0) {
      await awardPoints(userId, pointReward, 'badge_point_reward', { sourceBadgeId: badge.id })
    }

    // 피드 이벤트 — badge-engine의 Step 3-d와 동일한 페이로드(활동 귀속 필드는 없음)
    await recordFeedEvent(userId, 'badge_earned', {
      badge_id: badge.id,
      badge_name: badge.name,
      badge_image_url: badge.image_url ?? '',
      rarity: badge.rarity,
      ...(pointReward > 0 ? { point_reward: pointReward } : {}),
    })
  }

  return earned
}

/**
 * `daily_sync_count` 전용 진입점 — 하루(KST) 동기화 카운터를 원자적으로 올리고, 그 최신
 * 카운트로 배지를 판정·발급한다. `syncStravaActivities()`가 `synced > 0`(= 이번 배치로 새
 * 활동을 실제로 받아온 경우)일 때만 호출한다 — 호출 여부 게이트는 호출부의 책임이다.
 *
 * 원자적 증가는 `increment_daily_sync_count()` RPC(마이그레이션 154)가 담당한다 —
 * `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1`은 한 문장 원자 연산이라 동시
 * 요청이 겹쳐도 유실되지 않는다. RPC가 반환하는 값(그 날짜의 최신 카운트)을 그대로 평가에
 * 쓰므로 별도 SELECT 왕복이 필요 없다.
 *
 * RPC 실패는 예외를 던지지 않고 빈 배열로 폴백한다(로그만 남긴다) — 카운터 증가 실패가
 * 동기화 자체(활동 배지·아이템 드랍 등)를 막으면 안 된다.
 *
 * `client`를 생략하면 새 service_role 클라이언트를 만든다. `processFetchedActivities`는
 * 자신이 주입받은 클라이언트를 그대로 넘겨야 한다(위 `evaluateUsageBadges` 주석 참고).
 */
export async function recordDailySyncAndEvaluate(userId: string, client?: SupabaseClient): Promise<UsageBadgeEarned[]> {
  const supabase = client ?? createServiceClient()

  const { data: syncCount, error } = await supabase.rpc('increment_daily_sync_count', {
    p_user_id: userId,
    p_sync_date: kstDateString(),
  })

  if (error) {
    console.error(`[recordDailySyncAndEvaluate] 일일 동기화 카운터 증가 실패 (userId: ${userId}):`, error)
    return []
  }
  if (typeof syncCount !== 'number') return []

  return evaluateUsageBadges(userId, 'daily_sync_count', syncCount, supabase)
}
