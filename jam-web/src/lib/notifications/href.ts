/**
 * 알림(소식) 착지점 계산 — 티켓 20260824_021
 * 스펙: Specs/PRD/Notification/PRD.md §3(20종 표의 "착지점" 열) · §6-6
 *
 * ## 착지점을 저장하지 않는 이유
 *
 * `target_href`를 컬럼으로 저장하면 라우트를 바꿀 때 **과거 소식이 전부 깨진다.**
 * `type`은 안정적이고 라우트는 변하므로, 변하는 쪽을 코드에 둔다.
 * PRD §3의 20종 표가 이 함수의 명세다.
 *
 * ## 2단 타겟 (아바타 탭 → 사람 / 본문 탭 → 대상)
 *
 * #13 단건·#26 단건·#30·#32는 아바타와 본문의 착지점이 다르다. 그런 행은
 * `avatarHref`가 채워지고, 화면은 행 전체를 링크로 감싸는 대신 아바타·본문에 각각
 * 링크를 넣는다(`<a>` 안의 `<a>`는 HTML상 무효라 행 전체 래핑을 쓸 수 없다).
 */
import { idList, recapContent, type NotificationView } from './message'

export interface NotificationTarget {
  /** 본문 탭 착지점. null이면 이동하지 않는 행 */
  href: string | null
  /** 아바타 탭 착지점. null이면 행 전체가 단일 링크(href 모드) */
  avatarHref: string | null
}

function profileHref(username: string | null | undefined): string | null {
  return username ? `/${username}` : null
}

/** R15 사람 단위 묶음 행인가 — 착지를 그 사람 프로필로 올린다 */
function followingGrouped(payload: Record<string, unknown>): boolean {
  const v = payload.more_count
  return typeof v === 'number' && v >= 1
}

/** R11 묶음 행인가 — 착지를 목록 화면으로 올린다 */
function grouped(payload: Record<string, unknown>): boolean {
  const v = payload.target_count
  return typeof v === 'number' && v >= 2
}

export function notificationTarget(view: NotificationView): NotificationTarget {
  const p = view.payload
  const actorHref = profileHref(view.actor?.username)
  const meHref = profileHref(view.me.username)
  const single = (href: string | null): NotificationTarget => ({ href, avatarHref: null })

  switch (view.type) {
    // ── ① 활동 결산 — R6(새 화면을 만들지 않는다)의 착지 규칙 ──────────────
    //
    //   단일 개체(A칸)  → 그 개체 상세          첫 배지 + α    → 프로필
    //   1종 다수(B칸)   → 카테고리 목록          활동 2건 이상  → 프로필
    //   2종 이상        → /badges               포인트 섞임    → 프로필
    //
    // 포인트가 섞이면 배지 목록으로 보낼 수 없어 프로필로 올라간다. 다만 A칸은
    // 보여줄 개체가 하나로 확정돼 있어(A2) 개체 상세를 유지한다.
    case 'activity_recap': {
      const c = recapContent(p)
      if (c.firstBadgeId) {
        return single(c.totalBadges > 1 ? (meHref ?? '/badges') : `/badges/${c.firstBadgeId}`)
      }
      if (c.totalBadges === 0) return single(c.points > 0 ? '/points' : meHref ?? '/badges')
      if (c.activityCount >= 2) return single(meHref ?? '/badges')

      const single1 = c.totalBadges === 1
      if (single1) {
        if (c.rare) return single(`/badges/${c.rare.id}`)
        if (c.activityBadges.length === 1) return single(`/badges/${c.activityBadges[0].id}`)
        if (c.checkins.length === 1) return single(`/badges/${c.checkins[0].badge_id}`)
        // 아이템은 도감이 아니라 **내가 받은 개체**로 보낸다(A6)
        if (c.items.length === 1) return single(`/inventory/${c.items[0].inventory_item_id}`)
      }
      if (c.points > 0) return single(meHref ?? '/badges')
      if (c.kinds >= 2 || c.rare) return single('/badges')
      if (c.activityBadges.length > 0) return single('/badges?tab=activity')
      if (c.checkins.length > 0) return single('/badges?tab=checkin')
      return single('/inventory')
    }

    // ── ② 컬렉션 ──────────────────────────────────────────────────────────
    case 'collection_slottable': {
      // 묶음은 컬렉션이 아니라 **배지를 센다** — 착지도 배지가 있는 곳(인벤토리)이다
      if (grouped(p)) return single('/inventory')
      const bookId = typeof p.item_book_id === 'string' ? p.item_book_id : ''
      return single(bookId ? `/collections/${bookId}` : '/collections')
    }
    case 'collection_near_complete': {
      if (grouped(p)) return single('/collections')
      const bookId = typeof p.item_book_id === 'string' ? p.item_book_id : ''
      return single(bookId ? `/collections/${bookId}` : '/collections')
    }
    case 'collection_completable': {
      if (grouped(p)) return single('/collections')
      // "완성할 수 있는데 아직 안 넣은" 시점의 소식이라 단순 이동이 아니라 **장착 모드**로 보낸다
      const bookId = typeof p.item_book_id === 'string' ? p.item_book_id : ''
      return single(bookId ? `/collections/${bookId}?slot=1` : '/collections')
    }

    // ── ③ 내가 드랍한 아이템 배지 ──────────────────────────────────────────
    case 'drop_picked_up': {
      const badgeIds = idList(p, 'badge_ids')
      if (badgeIds.length <= 1) {
        // 픽업된 아이템은 이미 내 손을 떠나 인벤토리가 소프트 삭제 상태다 → 본문은 배지 상세로
        return { href: badgeIds[0] ? `/badges/${badgeIds[0]}` : meHref, avatarHref: actorHref }
      }
      // 묶음은 **갈 곳이 없다.** 픽업된 아이템은 소프트 삭제 상태라 개별 배지 상세로도
      // 못 가고 프로필로 보내봐야 볼 게 없다 — 갈 곳이 없으면 보내지 않는다
      return single(null)
    }
    case 'drop_spot_active': {
      if (grouped(p)) return single('/drops')
      const poiId = typeof p.poi_id === 'string' ? p.poi_id : ''
      return single(poiId ? `/drops?poi=${encodeURIComponent(poiId)}` : '/drops')
    }

    // ── ④ 미션 ────────────────────────────────────────────────────────────
    case 'mission_milestone':
    case 'mission_deadline':
    case 'mission_completed': {
      if (grouped(p)) return single('/missions')
      const id = typeof p.mission_id === 'string' ? p.mission_id : ''
      return single(id ? `/missions/${id}` : '/missions')
    }
    case 'mission_rank_up':
    case 'mission_ended': {
      if (grouped(p)) return single('/missions')
      const id = typeof p.mission_id === 'string' ? p.mission_id : ''
      return single(id ? `/missions/${id}/status` : '/missions')
    }

    // ── ⑤ 소셜 — 나에게 ───────────────────────────────────────────────────
    case 'followed': {
      const count = Math.max(view.actorCount, idList(p, 'actor_ids').length, 1)
      if (count <= 1) return { href: actorHref, avatarHref: actorHref }
      return single(meHref ? `${meHref}/followers` : null)
    }

    // ── ⑥ 소셜 — 팔로우한 사람의 활동 ──────────────────────────────────────
    // R15 묶음("소식이 N건 더 있어요")은 **그 사람 프로필**로 보낸다 —
    // 약속한 나머지 소식을 보려면 대상이 아니라 사람이어야 한다
    case 'following_rare_badge':
      if (followingGrouped(p)) return single(actorHref)
      return single(actorHref ? `${actorHref}#badge` : null)
    case 'following_collection_complete':
      if (followingGrouped(p)) return single(actorHref)
      return { href: actorHref ? `${actorHref}/collections` : null, avatarHref: actorHref }
    case 'following_mission_complete': {
      if (followingGrouped(p)) return single(actorHref)
      const id = typeof p.mission_id === 'string' ? p.mission_id : ''
      return single(id ? `/missions/${id}/status` : '/missions')
    }

    // ── ⑧ 계정·시스템 ─────────────────────────────────────────────────────
    case 'strava_disconnected':
    case 'sync_stalled':
      return single('/')
    case 'inventory_full':
      return single('/inventory')
    case 'admin_points_changed':
      return single('/points')
    case 'announcement': {
      // 별도 공지 화면을 만들지 않고 투데이 카드 CMS를 재사용한다
      const cardId = typeof p.today_card_id === 'string' ? p.today_card_id : ''
      return single(cardId ? `/today/${cardId}` : null)
    }
    default:
      return single(null)
  }
}
