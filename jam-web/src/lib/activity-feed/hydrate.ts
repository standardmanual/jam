/**
 * 피드 배지 정보 실시간 리프레시 (서버 전용)
 *
 * user_activity_feed.metadata는 기록 시점의 배지 스냅샷(이름·이미지·등급)을
 * 그대로 저장한다. 이후 배지 이미지를 일괄 재배정하거나 이름을 고쳐도 이미
 * 기록된 과거 피드 항목은 그 스냅샷을 계속 보여줘 "피드만 개선사항이 반영되지
 * 않는" 문제가 반복됐다 (실사례: 배지 이미지 일괄 배정 후에도 피드는 여전히 404).
 *
 * 근본 해결: badge_id는 절대 바뀌지 않으므로, 렌더링 직전 badge_id로 badges를
 * 다시 조인해 name/image_url/rarity를 항상 최신값으로 덮어쓴다. 이후 어떤
 * 배지 수정이든 백필 마이그레이션 없이 다음 페이지 로드부터 자동 반영된다.
 *
 * v5(티켓 20260905_0038 B): 리프레시 대상에 **level**과 **획득 횟수(earn_count)**를 더한다.
 * - `level` — 레벨형 배지는 `rarity`가 NULL이라 등급 칩을 그릴 수 없다. 피드·갤러리가
 *   Lv.N 칩으로 갈라지려면 이 값이 필요하다(마이그레이션 130).
 * - `earn_count` — 반복형의 회차는 **발급이 아니라서 피드 이벤트를 만들지 않는다**
 *   (티켓 20260905_0030 §2). 즉 피드 행을 아무리 세도 회차를 알 수 없고,
 *   `user_activity_badges.earn_count`가 유일한 출처다. 스냅샷으로 굳히지 않고
 *   렌더 직전에 읽는 이유도 같다 — 회차는 계속 오른다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { ActivityFeedRow, ActivityFeedEventType, BadgeEarnHistoryEntry } from '@/types/database'

const BADGE_METADATA_EVENTS = new Set<ActivityFeedEventType>(['badge_earned', 'item_dropped', 'item_picked_up'])

/** `${user_id}:${badge_id}` — 친구 피드는 여러 유저의 행이 섞이므로 유저까지 키에 넣는다 */
function earnKey(userId: string, badgeId: string): string {
  return `${userId}:${badgeId}`
}

/**
 * 소프트 삭제된 배지(badges.deleted_at)는 서비스 화면(피드 포함)에서 완전히 숨긴다.
 * DB의 user_activity_feed/user_activity_badges 등 원본 기록은 건드리지 않으므로
 * 필요 시 관리자·시스템 조회로는 여전히 확인 가능하다 — 여기서는 화면 노출만 걸러낸다.
 *
 * ⚠️ 이 규칙은 v5 전환에서 **전수 발화**했다(티켓 20260905_0038 B 실측): v4 활동 배지가
 * 2026-09-05에 전부 소프트 삭제돼, 기존 유저의 과거 badge_earned 피드가 통째로 화면에서
 * 사라진다(프로필 배지 갤러리도 이 피드를 원본으로 쓰므로 함께 빈다).
 * **그럼에도 이 티켓에서는 규칙을 바꾸지 않는다.** 근거:
 *   - 배지 상세(`badges/[id]/page.tsx`)가 `deleted_at` 배지를 `notFound()`로 404 처리한다.
 *     피드만 되살리면 카드 → 상세 버튼이 곧장 404로 떨어지는 막다른 길이 생긴다.
 *   - 「소프트 삭제된 배지를 과거 이력으로 계속 보여줄지」는 피드 한 곳이 아니라 상세·갤러리·
 *     공유·홈이 함께 따라야 하는 **정책**이다. UI 티켓이 단독으로 뒤집을 범위가 아니다.
 * 판단 결과는 티켓 완료 기록의 alerts로 올린다.
 */
export async function hydrateFeedBadgeInfo(items: ActivityFeedRow[]): Promise<ActivityFeedRow[]> {
  const badgeIds = new Set<string>()
  const userIds = new Set<string>()
  for (const item of items) {
    if (!BADGE_METADATA_EVENTS.has(item.event_type)) continue
    const id = (item.metadata as Record<string, unknown>).badge_id
    if (typeof id === 'string') {
      badgeIds.add(id)
      userIds.add(item.user_id)
    }
  }
  if (badgeIds.size === 0) return items

  const supabase = createServiceClient()
  const [{ data }, { data: earnRows }] = await Promise.all([
    supabase.from('badges').select('id, name, image_url, rarity, level, deleted_at').in('id', [...badgeIds]),
    // 회차는 활동 배지(user_activity_badges)에만 있다. 체크인 배지의 반복은 예전부터
    // metadata.visit_count로 실려 오므로 여기서 건드리지 않는다.
    // earn_history: 반복 발급형 배지는 재발급돼도 피드 행이 새로 생기지 않는다(§ 파일 상단
    // 주석). 표시 시각을 "최초 발급일"이 아니라 "가장 최근 회차"로 보이려면 이 배열의 마지막
    // 원소가 필요하다(티켓 20260923_1237).
    supabase
      .from('user_activity_badges')
      .select('user_id, badge_id, earn_count, earn_history')
      .in('badge_id', [...badgeIds])
      .in('user_id', [...userIds]),
  ])

  const badgeMap = new Map(
    // rarity는 nullable이다(무한레벨형, 마이그레이션 130) — 티켓 20260905_0027 «경계 3곳» 중 하나.
    ((data ?? []) as { id: string; name: string; image_url: string | null; rarity: string | null; level: number | null; deleted_at: string | null }[])
      .map((b) => [b.id, b])
  )
  const earnCountMap = new Map(
    ((earnRows ?? []) as { user_id: string; badge_id: string; earn_count: number | null }[])
      .map((r) => [earnKey(r.user_id, r.badge_id), r.earn_count ?? 1])
  )
  // earn_history는 회차마다 뒤에 추가되므로(마이그레이션 132) 마지막 원소가 가장 최근 회차다.
  // 반복형이 아닌 배지도 earn_history에 최초 발급 1건이 항상 들어 있어(마이그레이션 130 백필)
  // 마지막 원소가 곧 최초 발급 시각과 같다 — 그래서 반복형 여부를 따로 가리지 않고 항상 이
  // 값을 우선 쓴다. JSONB라 타입이 없으므로 배열·문자열 형태를 런타임에서 확인하고, 형태가
  // 어긋나면(과거 데이터 등) 이 배지는 맵에 넣지 않아 아래에서 created_at 원값으로 폴백한다.
  const latestEarnedAtMap = new Map<string, string>()
  for (const r of (earnRows ?? []) as { user_id: string; badge_id: string; earn_history: unknown }[]) {
    const history = r.earn_history
    if (!Array.isArray(history) || history.length === 0) continue
    const last = history[history.length - 1] as BadgeEarnHistoryEntry | undefined
    const earnedAt = last?.earned_at
    if (typeof earnedAt === 'string') {
      latestEarnedAtMap.set(earnKey(r.user_id, r.badge_id), earnedAt)
    }
  }

  return items
    .filter((item) => {
      if (!BADGE_METADATA_EVENTS.has(item.event_type)) return true
      const badgeId = (item.metadata as Record<string, unknown>).badge_id
      if (typeof badgeId !== 'string') return true
      const badge = badgeMap.get(badgeId)
      // 조회 안 되거나(삭제 등으로 아예 없어짐) 소프트 삭제된 배지는 피드에서 제외
      return !!badge && !badge.deleted_at
    })
    .map((item) => {
      if (!BADGE_METADATA_EVENTS.has(item.event_type)) return item
      const meta = item.metadata as Record<string, unknown>
      const badgeId = meta.badge_id
      const live = typeof badgeId === 'string' ? badgeMap.get(badgeId) : undefined
      if (!live) return item
      const earnCount = typeof badgeId === 'string' ? earnCountMap.get(earnKey(item.user_id, badgeId)) : undefined
      // 피드 카드·그룹 헤더·상세 시트(FeedSection.tsx)가 전부 이 created_at 하나만 읽어 "N일
      // 전"·"획득 일시"를 그린다. 반복 발급형은 재발급돼도 이 피드 행 자체가 새로 생기지
      // 않으므로(파일 상단 주석), DB 삽입 시각 대신 가장 최근 회차 시각으로 덮어써야 화면이
      // 최신 발급을 반영한다(티켓 20260923_1237). `/api/badges/recent-earned` 라우트는 같은
      // 컬럼명을 "DB 삽입 시각·방금 획득 판정 기준"이라는 다른 의미로 쓰는데, 그 라우트의
      // 조회 경로와는 완전히 분리돼 있어 여기서 덮어써도 서로 영향을 주지 않는다.
      const latestEarnedAt = typeof badgeId === 'string' ? latestEarnedAtMap.get(earnKey(item.user_id, badgeId)) : undefined
      return {
        ...item,
        ...(latestEarnedAt != null ? { created_at: latestEarnedAt } : {}),
        metadata: {
          ...meta,
          badge_name: live.name,
          badge_image_url: live.image_url ?? '',
          rarity: live.rarity,
          level: live.level,
          // 조회되지 않으면(아이템 배지 등 user_activity_badges에 행이 없는 종류) 키를 넣지
          // 않는다 — 0이나 1을 넣으면 「회차를 모르는 것」과 「1회 획득」이 구분되지 않는다.
          ...(earnCount != null ? { earn_count: earnCount } : {}),
        },
      }
    })
}
