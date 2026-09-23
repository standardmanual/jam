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
 *
 * 티켓 20260923_1237: 반복 발급형 배지는 재발급돼도 `user_activity_feed` 행이 새로
 * 생기지 않는다(위 `earn_count` 설명과 같은 근거). "최근 활동" 피드는 **활동 단위로 그
 * 활동에서 얻은 것을 보여주는 화면**이므로, 재발급 회차도 그 회차가 실제로 일어난 활동의
 * 그룹에 나타나야 한다. DB에 행을 추가하지 않고, `user_activity_badges.earn_history`
 * (회차별 `{earned_at, strava_activity_id}`)를 렌더 시점에 펼쳐 회차마다 **가상 피드
 * 항목**을 만든다. 각 가상 항목은 그 회차의 `strava_activity_id`를 가지므로
 * `FeedSection.tsx`의 기존 그룹핑(`strava_activity_id` 기준)이 자동으로 올바른 활동
 * 그룹에 배치한다.
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
    // 주석). 회차마다 가상 피드 항목을 만들려면 이 배열 전체가 필요하다(티켓 20260923_1237).
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

  // earn_history는 회차마다 뒤에 추가되므로(마이그레이션 132) 배열 순서 그대로가 발급 순서다.
  // 반복형이 아닌 배지도 최초 발급 1건이 항상 들어 있어(마이그레이션 130 백필) 원소가 1개뿐인
  // 채로 이 맵에 들어온다 — 그래서 반복형 여부를 따로 가리지 않고 항상 이 배열을 펼친다.
  // JSONB라 타입이 없으므로 배열·문자열 형태를 런타임에서 확인하고, `earned_at`이 문자열이
  // 아닌 원소는 건너뛴다(형태가 어긋난 과거 데이터 방어). `strava_activity_id` 결번(체크인·POI
  // 트리거로 발급된 회차, 주의 3)은 null로 정규화한다 — 그 자체는 유효한 회차라 건너뛰지 않고,
  // 아래 flatMap에서 원본 item의 strava_activity_id로 대체한다.
  interface NormalizedEarnEntry {
    earned_at: string
    strava_activity_id: number | null
  }
  const earnHistoryMap = new Map<string, NormalizedEarnEntry[]>()
  for (const r of (earnRows ?? []) as { user_id: string; badge_id: string; earn_history: unknown }[]) {
    const history = r.earn_history
    if (!Array.isArray(history)) continue
    const normalized: NormalizedEarnEntry[] = []
    for (const raw of history as BadgeEarnHistoryEntry[]) {
      const earnedAt = raw?.earned_at
      if (typeof earnedAt !== 'string') continue
      const activityId = raw?.strava_activity_id
      normalized.push({
        earned_at: earnedAt,
        strava_activity_id: typeof activityId === 'number' ? activityId : null,
      })
    }
    if (normalized.length > 0) {
      earnHistoryMap.set(earnKey(r.user_id, r.badge_id), normalized)
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
    .flatMap((item): ActivityFeedRow[] => {
      if (!BADGE_METADATA_EVENTS.has(item.event_type)) return [item]
      const meta = item.metadata as Record<string, unknown>
      const badgeId = meta.badge_id
      const live = typeof badgeId === 'string' ? badgeMap.get(badgeId) : undefined
      if (!live) return [item]
      const key = typeof badgeId === 'string' ? earnKey(item.user_id, badgeId) : undefined
      const liveMeta = {
        badge_name: live.name,
        badge_image_url: live.image_url ?? '',
        rarity: live.rarity,
        level: live.level,
      }

      const history = key ? earnHistoryMap.get(key) : undefined
      if (!history) {
        // earn_history를 모르는 종류(체크인 배지·아이템 드랍 등 user_activity_badges 행이
        // 없는 경우) — "회차를 모르는 것"과 "표시 시각을 안다"를 섞지 않는다는 원칙대로,
        // 회차를 쪼개지 않고 기존과 동일하게 단건으로 배지 메타데이터만 최신화한다.
        const earnCount = key ? earnCountMap.get(key) : undefined
        return [
          {
            ...item,
            metadata: {
              ...meta,
              ...liveMeta,
              ...(earnCount != null ? { earn_count: earnCount } : {}),
            },
          },
        ]
      }

      // "최근 활동" 피드는 활동 단위로 그 활동에서 얻은 것을 보여주는 화면이다(티켓
      // 20260923_1237). 회차마다 그 회차가 실제로 일어난 활동의 strava_activity_id를 실어
      // 가상 피드 항목으로 만들면, FeedSection.tsx의 기존 그룹핑이 손대지 않아도 올바른
      // 활동 그룹에 자동으로 배치한다. 포인트는 배지를 처음 발급할 때 1회만 지급되므로
      // (badge-engine/index.ts awardPoints) point_reward는 첫 회차의 가상 항목에만 남기고,
      // earn_count는 넣지 않는다 — 가상 항목은 이미 1회 단위로 쪼개져 있어 누적 칩이 필요 없다.
      const restMeta: Record<string, unknown> = { ...meta }
      delete restMeta.point_reward
      delete restMeta.earn_count
      return history.map((entry, index) => ({
        ...item,
        id: `${item.id}::${index}`,
        created_at: entry.earned_at,
        strava_activity_id: entry.strava_activity_id ?? item.strava_activity_id,
        metadata: {
          ...restMeta,
          ...liveMeta,
          ...(index === 0 && meta.point_reward !== undefined ? { point_reward: meta.point_reward } : {}),
        },
      }))
    })
}
