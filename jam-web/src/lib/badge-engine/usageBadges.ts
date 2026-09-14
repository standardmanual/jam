/**
 * JAM! 카테고리 — 서비스 사용량 배지 평가·발급 (서버 사이드 전용, 티켓 20260910_1557)
 *
 * 팔로워 수·팔로잉 수·하루 동기화 횟수·연속 동기화 일수처럼 Strava 활동과 무관한 "서비스
 * 사용량" 지표로 배지를 판정·발급한다. 이 4개 조건 키(`follower_count`/`following_count`/
 * `daily_sync_count`/`daily_sync_streak_days`)는 `conditionRegistry.ts`에 `role: 'meta'` +
 * `evaluation: 'external'`로 선언돼 있어 — `mission_reward`와 같은 자리 — badge-engine의
 * `evaluateConditionDetailed`는 (role: 'measurable'인 필드가 하나도 없으므로) 이 조건들을
 * 항상 fail 처리한다. 이 파일이 그 대신 판정·발급을 전담한다.
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
 *
 * 체크인 배지 보유 조건 2종(`checkin_category_count`·`checkin_badge_count`, 티켓
 * 20260914_1725)도 이 파일이 담당하지만 `evaluateCheckinUsageBadges()`라는 별도 진입점이다 —
 * 위 4종과 달리 "유저당 미리 계산한 숫자 하나"가 아니라 후보 배지의 `condition_json`(카테고리·
 * 배지 목록)마다 현재값이 달라, 발급 로직(등급형·레벨형 순차 발급)만 `issueQualifyingBadges`로
 * 공유하고 현재값 계산 경로는 갈린다.
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
import { fetchCurrentSyncStreakDays } from './dailySyncStreak'
import type { BadgeRow } from '@/types/database'

/** 이 파일이 판정하는 서비스 사용량 지표 4종 — `conditionRegistry.ts` 선언과 1:1 대응.
 *  `daily_sync_streak_days`(연속 동기화 일수, 티켓 20260911_2304)는 오늘까지 끊기지 않은
 *  «현재» 연속만 보는 별개 지표다 — `daily_sync_count`(하루 누적 횟수)와 혼동하지 않는다. */
export type UsageMetric = 'follower_count' | 'following_count' | 'daily_sync_count' | 'daily_sync_streak_days'

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

  return issueQualifyingBadges(
    supabase,
    userId,
    candidates,
    (b) => b.condition_json?.[metric] as number,
    () => currentValue,
    () => `usage_metric:${metric}`,
    `evaluateUsageBadges(metric: ${metric})`
  )
}

/**
 * 등급형(이름 그룹 최상위 tier 1개)·레벨형(family_key 보유 레벨+1부터 연속) 순차 발급 —
 * `evaluateUsageBadges`(팔로워·팔로잉·동기화 4종)와 `evaluateCheckinUsageBadges`(체크인
 * 카테고리·목록 2종, 티켓 20260914_1725)가 공유하는 발급 로직.
 *
 * 4종은 "유저 단위로 한 번 계산한 숫자 하나"를 모든 후보에 그대로 비교했지만, 체크인 2종은
 * 후보 배지마다 자기 `condition_json`(어떤 카테고리인지·어떤 배지 목록인지)이 달라 **후보별로**
 * 현재값·임계값을 다시 계산해야 한다 — 그래서 `currentValue: number` 하나가 아니라
 * `thresholdOf`/`currentValueOf` 함수를 받는다. `triggeredByOf`도 마찬가지로 후보마다 다른
 * `triggered_by` 문자열을 만들 수 있게 함수로 받는다(체크인 카테고리 지표는 카테고리 값을
 * 함께 남긴다).
 */
async function issueQualifyingBadges(
  supabase: SupabaseClient,
  userId: string,
  candidates: BadgeRow[],
  thresholdOf: (badge: BadgeRow) => number,
  currentValueOf: (badge: BadgeRow) => number,
  triggeredByOf: (badge: BadgeRow) => string,
  logContext: string
): Promise<UsageBadgeEarned[]> {
  const { data: ownedRaw, error: ownedError } = await supabase
    .from('user_activity_badges')
    .select('badge_id')
    .eq('user_id', userId)
    .in('badge_id', candidates.map((b) => b.id))

  if (ownedError) {
    console.error(`[issueQualifyingBadges] 보유 배지 조회 오류 (${logContext}):`, ownedError)
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
      return currentValueOf(b) >= thresholdOf(b)
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
      if (currentValueOf(b) < thresholdOf(b)) continue // 프런티어가 막힘 — 위 레벨도 계속 이 분기에서 스킵된다
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
        `[issueQualifyingBadges] 섀도우밴으로 발급 차단 — userId: ${userId}, badge: ${badge.name}, rarity: ${badge.rarity}`
      )
      continue
    }

    const { error: insertError } = await supabase
      .from('user_activity_badges')
      .insert({ user_id: userId, badge_id: badge.id, triggered_by: triggeredByOf(badge) })

    if (insertError) {
      // 23505(중복키)는 «이미 보유»다 — 동시 호출이 같은 배지를 동시에 채운 경우뿐이므로
      // 조용히 넘긴다. 어느 쪽이든 부수효과는 일으키지 않는다.
      if (insertError.code !== '23505') {
        console.error(`[issueQualifyingBadges] 배지 발급 오류 (badge_id: ${badge.id}, ${logContext}):`, insertError)
      }
      continue
    }

    console.info(
      `[issueQualifyingBadges] 배지 발급 — userId: ${userId}, badge: ${badge.name} (${logContext})`
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

/** `checkin_category_count` 값 형태 가드 — jsonb라 형태 보장이 없다(카탈로그 오류 방어) */
function isCheckinCategoryCountValue(v: unknown): v is { category: string; count: number } {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as { category?: unknown }).category === 'string' &&
    typeof (v as { count?: unknown }).count === 'number'
  )
}

/** `checkin_badge_count` 값 형태 가드 — jsonb라 형태 보장이 없다(카탈로그 오류 방어) */
function isCheckinBadgeCountValue(v: unknown): v is { checkin_badge_names: string[]; count: number } {
  return (
    !!v &&
    typeof v === 'object' &&
    Array.isArray((v as { checkin_badge_names?: unknown }).checkin_badge_names) &&
    typeof (v as { count?: unknown }).count === 'number'
  )
}

/**
 * JAM! 카테고리 — 체크인 배지 보유 조건 2종 판정·발급 (티켓 20260914_1725)
 *
 * ① `checkin_category_count` — 지정된 체크인 카테고리(effective category, `badges.category`
 *    우선 없으면 연결된 `poi.category` 폴백 — `admin/badges/page.tsx`의 정의와 동일) 내에서
 *    유저가 보유한(distinct) 체크인 배지 개수 ≥ 조건값.
 * ② `checkin_badge_count` — 어드민이 CSV로 지정한 체크인 배지 이름 목록 중 유저가 보유한
 *    이름 개수 ≥ 조건값. 이름은 `type='checkin'` 배지로만 해석한다(§2.8 "이름은 유일 식별자가
 *    아니다" — 동명이인이 있어도 체크인 배지로 한정하면 판정 대상이 명확하다). 목록에 실제로
 *    존재하지 않는 이름(카탈로그 오탈자)은 저장을 막지 않은 대신, 평가 시점에 조용히
 *    무시하고 나머지 이름만으로 판정한다(AC5, "구현 중 택1" 중 평가 시점 방어 쪽을 택함).
 *
 * `evaluateUsageBadges`와 달리 "유저당 미리 계산한 숫자 하나"를 받지 않는다 — 후보 배지마다
 * 자기 `condition_json`이 가리키는 카테고리·이름 목록이 달라 후보별로 현재값을 계산해야
 * 한다(`issueQualifyingBadges`의 `currentValueOf`). 체크인 배지 발급(`sync.ts`) 직후 호출한다.
 *
 * DB 조회 실패는 예외를 던지지 않고 빈 배열로 폴백한다(로그만 남긴다) — 체크인 배지 자체의
 * 발급·동기화 API 응답은 이 판정과 무관하게 계속 성공해야 한다.
 */
export async function evaluateCheckinUsageBadges(userId: string, client?: SupabaseClient): Promise<UsageBadgeEarned[]> {
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
    console.error('[evaluateCheckinUsageBadges] 배지 목록 조회 오류:', badgesError)
    return []
  }

  const candidates = ((allBadgesRaw as BadgeRow[] | null) ?? []).filter(
    (b) =>
      isCheckinCategoryCountValue(b.condition_json?.checkin_category_count) ||
      isCheckinBadgeCountValue(b.condition_json?.checkin_badge_count)
  )
  if (candidates.length === 0) return []

  // 유저가 지금까지 획득한(반복 방문 무관, distinct) 체크인 배지 id
  const { data: earnsRaw, error: earnsError } = await supabase
    .from('user_checkin_badge_earns')
    .select('badge_id')
    .eq('user_id', userId)

  if (earnsError) {
    console.error('[evaluateCheckinUsageBadges] 체크인 배지 이력 조회 오류:', earnsError)
    return []
  }
  const earnedBadgeIds = new Set((earnsRaw ?? []).map((r: { badge_id: string }) => r.badge_id))

  // ① 카테고리 지표 — effective category(badges.category 우선, 없으면 연결된 poi.category)별
  // distinct 보유 개수. `admin/badges/page.tsx`의 effectiveCategory 정의와 동일한 우선순위.
  const categoryCandidates = candidates.filter((b) => isCheckinCategoryCountValue(b.condition_json?.checkin_category_count))
  const categoryCounts = new Map<string, number>()
  if (categoryCandidates.length > 0 && earnedBadgeIds.size > 0) {
    const earnedIdList = [...earnedBadgeIds]
    const [{ data: earnedBadgesRaw, error: earnedBadgesError }, { data: linkedPoiRaw, error: linkedPoiError }] = await Promise.all([
      supabase.from('badges').select('id, category').in('id', earnedIdList),
      supabase.from('poi').select('linked_badge_id, category').in('linked_badge_id', earnedIdList),
    ])
    if (earnedBadgesError) console.error('[evaluateCheckinUsageBadges] 보유 체크인 배지 카테고리 조회 오류:', earnedBadgesError)
    if (linkedPoiError) console.error('[evaluateCheckinUsageBadges] 연결 지점 카테고리 조회 오류:', linkedPoiError)

    const poiCategoryByBadge = new Map<string, string>()
    for (const row of (linkedPoiRaw ?? []) as { linked_badge_id: string; category: string }[]) {
      if (!poiCategoryByBadge.has(row.linked_badge_id)) poiCategoryByBadge.set(row.linked_badge_id, row.category)
    }
    for (const row of (earnedBadgesRaw ?? []) as { id: string; category: string | null }[]) {
      const effectiveCategory = row.category ?? poiCategoryByBadge.get(row.id) ?? null
      if (!effectiveCategory) continue
      categoryCounts.set(effectiveCategory, (categoryCounts.get(effectiveCategory) ?? 0) + 1)
    }
  }

  // ② 목록 지표 — CSV로 지정한 체크인 배지 이름 중 실제로 보유(이름→id 해석 후 매칭)한 이름 집합.
  const listCandidates = candidates.filter((b) => isCheckinBadgeCountValue(b.condition_json?.checkin_badge_count))
  const ownedNames = new Set<string>()
  if (listCandidates.length > 0) {
    const allNames = [
      ...new Set(
        listCandidates.flatMap((b) => (b.condition_json!.checkin_badge_count as { checkin_badge_names: string[] }).checkin_badge_names)
      ),
    ]
    if (allNames.length > 0) {
      const { data: namedBadgesRaw, error: namedBadgesError } = await supabase
        .from('badges')
        .select('id, name')
        .eq('type', 'checkin') // §2.8 — 이름은 유일 식별자가 아니다. 체크인 배지로 한정한다.
        .in('name', allNames)
      if (namedBadgesError) {
        console.error('[evaluateCheckinUsageBadges] 배지 이름 조회 오류:', namedBadgesError)
      } else {
        const idsByName = new Map<string, string[]>()
        for (const row of (namedBadgesRaw ?? []) as { id: string; name: string }[]) {
          if (!idsByName.has(row.name)) idsByName.set(row.name, [])
          idsByName.get(row.name)!.push(row.id)
        }
        for (const name of allNames) {
          const ids = idsByName.get(name) ?? [] // 카탈로그에 없는 이름 — 무시하고 나머지로 판정
          if (ids.some((id) => earnedBadgeIds.has(id))) ownedNames.add(name)
        }
      }
    }
  }

  const thresholdOf = (b: BadgeRow): number => {
    const cat = b.condition_json?.checkin_category_count
    if (isCheckinCategoryCountValue(cat)) return cat.count
    const list = b.condition_json?.checkin_badge_count
    if (isCheckinBadgeCountValue(list)) return list.count
    return 0
  }
  const currentValueOf = (b: BadgeRow): number => {
    const cat = b.condition_json?.checkin_category_count
    if (isCheckinCategoryCountValue(cat)) return categoryCounts.get(cat.category) ?? 0
    const list = b.condition_json?.checkin_badge_count
    if (isCheckinBadgeCountValue(list)) return list.checkin_badge_names.filter((n) => ownedNames.has(n)).length
    return 0
  }
  const triggeredByOf = (b: BadgeRow): string => {
    const cat = b.condition_json?.checkin_category_count
    if (isCheckinCategoryCountValue(cat)) return `checkin_category_count:${cat.category}`
    return 'checkin_badge_count'
  }

  return issueQualifyingBadges(supabase, userId, candidates, thresholdOf, currentValueOf, triggeredByOf, 'evaluateCheckinUsageBadges')
}

/**
 * `daily_sync_count`·`daily_sync_streak_days` 전용 진입점 — 하루(KST) 동기화 카운터를
 * 원자적으로 올리고, 그 최신 카운트와 "오늘 기준 현재 연속일수"(`dailySyncStreak.ts`)로
 * 두 지표를 각각 판정·발급한다. `syncStravaActivities()`가 `synced > 0`(= 이번 배치로 새
 * 활동을 실제로 받아온 경우)일 때만 호출한다 — 호출 여부 게이트는 호출부의 책임이다.
 *
 * 원자적 증가는 `increment_daily_sync_count()` RPC(마이그레이션 154)가 담당한다 —
 * `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1`은 한 문장 원자 연산이라 동시
 * 요청이 겹쳐도 유실되지 않는다. RPC가 반환하는 값(그 날짜의 최신 카운트)을 그대로 평가에
 * 쓰므로 별도 SELECT 왕복이 필요 없다.
 *
 * 연속일수(`daily_sync_streak_days`, 티켓 20260911_2304)는 이 RPC가 "오늘" 행을 반드시
 * 만든 직후에만 계산한다 — 오늘 동기화가 실제로 기록됐다는 전제가 있어야 "오늘까지 끊기지
 * 않은 연속"이 의미를 갖는다.
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

  const countEarned = await evaluateUsageBadges(userId, 'daily_sync_count', syncCount, supabase)

  const streakDays = await fetchCurrentSyncStreakDays(userId, supabase)
  const streakEarned = await evaluateUsageBadges(userId, 'daily_sync_streak_days', streakDays, supabase)

  return [...countEarned, ...streakEarned]
}
