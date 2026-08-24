/**
 * 알림(소식) 착지점 계산 — 티켓 20260824_021
 * 스펙: Specs/PRD/Notification/PRD.md §3(26종 표의 "착지점" 열) · §6-6
 *
 * ## 착지점을 저장하지 않는 이유
 *
 * `target_href`를 컬럼으로 저장하면 라우트를 바꿀 때 **과거 소식이 전부 깨진다.**
 * `type`은 안정적이고 라우트는 변하므로, 변하는 쪽을 코드에 둔다.
 * PRD §3의 26종 표가 이 함수의 명세다.
 *
 * ## 2단 타겟 (아바타 탭 → 사람 / 본문 탭 → 대상)
 *
 * #13 단건·#26 단건·#30·#32는 아바타와 본문의 착지점이 다르다. 그런 행은
 * `avatarHref`가 채워지고, 화면은 행 전체를 링크로 감싸는 대신 아바타·본문에 각각
 * 링크를 넣는다(`<a>` 안의 `<a>`는 HTML상 무효라 행 전체 래핑을 쓸 수 없다).
 */
import { idList, type NotificationView } from './message'

export interface NotificationTarget {
  /** 본문 탭 착지점. null이면 이동하지 않는 행 */
  href: string | null
  /** 아바타 탭 착지점. null이면 행 전체가 단일 링크(href 모드) */
  avatarHref: string | null
}

function profileHref(username: string | null | undefined): string | null {
  return username ? `/${username}` : null
}

function highlightQuery(ids: string[]): string {
  return ids.length > 0 ? `&highlight=${encodeURIComponent(ids.join(','))}` : ''
}

export function notificationTarget(view: NotificationView): NotificationTarget {
  const p = view.payload
  const actorHref = profileHref(view.actor?.username)
  const meHref = profileHref(view.me.username)
  const single = (href: string | null): NotificationTarget => ({ href, avatarHref: null })

  switch (view.type) {
    // ── ① 보상 획득 ────────────────────────────────────────────────────────
    case 'badge_earned': {
      const ids = idList(p, 'badge_ids')
      if (ids.length === 1) return single(`/badges/${ids[0]}`)
      return single(`/badges?tab=activity${highlightQuery(ids)}`)
    }
    case 'rare_badge_earned': {
      const id = typeof p.badge_id === 'string' ? p.badge_id : ''
      return single(id ? `/badges/${id}` : '/badges')
    }
    case 'item_badge_earned': {
      // 착지점이 배지 도감이 아니라 **인벤토리 인스턴스**다 — 유저가 보고 싶은 건
      // "내가 받은 그 개체(시리얼)"이지 도감이 아니다.
      const ids = idList(p, 'inventory_item_ids')
      if (ids.length === 1) return single(`/inventory/${ids[0]}`)
      return single(`/inventory${ids.length > 0 ? `?highlight=${encodeURIComponent(ids.join(','))}` : ''}`)
    }
    case 'poi_badge_earned': {
      const ids = idList(p, 'badge_ids')
      const primary = typeof p.badge_id === 'string' ? p.badge_id : ids[0]
      if (ids.length <= 1) return single(primary ? `/badges/${primary}` : '/badges?tab=poi')
      return single(`/badges?tab=poi${highlightQuery(ids)}`)
    }
    case 'points_earned':
      return single('/points')
    case 'first_badge': {
      const id = typeof p.badge_id === 'string' ? p.badge_id : ''
      return single(id ? `/badges/${id}` : '/badges')
    }

    // ── ② 컬렉션 ──────────────────────────────────────────────────────────
    case 'collection_slottable':
    case 'collection_near_complete': {
      const bookId = typeof p.item_book_id === 'string' ? p.item_book_id : ''
      return single(bookId ? `/collections/${bookId}` : null)
    }
    case 'collection_completable': {
      // "완성할 수 있는데 아직 안 넣은" 시점의 소식이라 단순 이동이 아니라 **장착 모드**로 보낸다
      const bookId = typeof p.item_book_id === 'string' ? p.item_book_id : ''
      return single(bookId ? `/collections/${bookId}?slot=1` : null)
    }

    // ── ③ 내가 드랍한 아이템 배지 ──────────────────────────────────────────
    case 'drop_picked_up': {
      const badgeIds = idList(p, 'badge_ids')
      if (badgeIds.length <= 1) {
        // 픽업된 아이템은 이미 내 손을 떠나 인벤토리가 소프트 삭제 상태다 → 본문은 배지 상세로
        return { href: badgeIds[0] ? `/badges/${badgeIds[0]}` : meHref, avatarHref: actorHref }
      }
      return single(meHref)
    }
    case 'drop_spot_active': {
      const poiId = typeof p.poi_id === 'string' ? p.poi_id : ''
      return single(poiId ? `/drops?poi=${encodeURIComponent(poiId)}` : '/drops')
    }

    // ── ④ 미션 ────────────────────────────────────────────────────────────
    case 'mission_milestone':
    case 'mission_deadline':
    case 'mission_completed': {
      const id = typeof p.mission_id === 'string' ? p.mission_id : ''
      return single(id ? `/missions/${id}` : '/missions')
    }
    case 'mission_rank_up':
    case 'mission_ended': {
      const id = typeof p.mission_id === 'string' ? p.mission_id : ''
      return single(id ? `/missions/${id}/status` : '/missions')
    }

    // ── ⑤ 소셜 — 나에게 ───────────────────────────────────────────────────
    case 'followed': {
      const count = Math.max(view.actorCount, idList(p, 'actor_ids').length, 1)
      if (count <= 1) return { href: actorHref, avatarHref: actorHref }
      return single(meHref ? `${meHref}/followers` : null)
    }
    case 'mutual_follow':
      return single(actorHref)

    // ── ⑥ 소셜 — 팔로우한 사람의 활동 ──────────────────────────────────────
    case 'following_rare_badge':
      return single(actorHref ? `${actorHref}#badge` : null)
    case 'following_collection_complete':
      return { href: actorHref ? `${actorHref}/collections` : null, avatarHref: actorHref }
    case 'following_mission_complete': {
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
