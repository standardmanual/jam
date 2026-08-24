'use client'

import Link from 'next/link'
import { BellIcon } from '@/components/ui/icons'
import { useTopNavData } from '@/lib/topNavData'
import { d } from '@/lib/i18n'

/**
 * TopNav 알림함 진입점 (20260824_021)
 *
 * - 위치: `rightSlot`의 **맨 뒤**(=아바타 바로 왼쪽). 배지 상세의 공유 버튼처럼 호출부가
 *   이미 `rightSlot`을 쓰는 화면에서는 `[공유버튼][알림종][아바타]`가 된다.
 * - 버블: **숫자 없는 빨간 점**. 숫자 배지는 강박적 확인(compulsive checking)을 유도한다
 *   (PRD §2-4 게이미피케이션 윤리).
 * - 버블은 **아이콘 바깥의 별도 엘리먼트**다 — 아이콘 세트의 "제3의 컬러 도입 금지" 규칙을
 *   지키려면 색이 SVG 안으로 들어가면 안 된다.
 * - 노출: TopNav가 렌더되는 **모든 화면**. 동기화 버튼·프로필 아바타와 한 세트다.
 * - 형태는 우측 프로필 아바타와 맞춘다 — 44×44 터치영역 안에 36px 서클, 16px 아이콘.
 *
 * ## 점은 조건부 렌더가 아니라 항상 마운트한다 (2차 보강)
 *
 * `{hasUnread && <span/>}`이면 전환이 0프레임이라 "버블이 꺼졌다"는 사실이 유저에게
 * 보이지 않는다. 프로젝트에 이미 설치된 모션 프리미티브(`transitions.css`의
 * `.t-badge`/`.t-badge-dot` — 팝인 + 팝아웃 scale(0)+blur, `prefers-reduced-motion` 가드
 * 포함)를 그대로 쓰고 `data-open`만 토글한다. 앵커만 `.jam-bell-dot`으로 덮어쓴다
 * (TabBar의 `.jam-tabbar-dot`과 같은 방식 — 원본 스니펫은 건드리지 않는다).
 *
 * 점은 종 글리프 **바깥**에 놓는다. 24px 아이콘의 벨 외곽선은 x≈21까지 차지하므로
 * 아이콘 박스 안쪽에 두면 우상단 스트로크와 정면으로 겹친다.
 */
export default function NotificationBell() {
  const { hasUnreadNotifications, clearNotificationDot } = useTopNavData()

  return (
    <Link
      href="/notifications"
      // 낙관적 해제 — 누른 프레임에 점이 scale(0)+blur로 빨려 들어가야 원인(내가 눌렀다)과
      // 결과(버블이 꺼졌다)가 같은 프레임에 보인다. 서버가 잡는 seen_at 스냅샷은 page.tsx가
      // 별도로 읽으므로 영향이 없고, 조회 실패 시에는 NotificationsClient가
      // restoreNotificationDot()으로 되돌린다.
      onPointerDown={clearNotificationDot}
      aria-label={
        hasUnreadNotifications
          ? `${d.notifications.bellLabel}, ${d.notifications.unreadDotLabel}`
          : d.notifications.bellLabel
      }
      // -mr-1: 종↔프로필 간격을 동기화↔종과 같은 12px로 맞춘다.
      // DS TopNav는 헤더 바깥 gap:8, 우측 영역 안쪽도 gap:8인데 44px 터치박스 안의
      // 36px 서클이 양옆 4px 여백을 만들어, 좌측은 8+4=12px인데 우측은 4+8+4=16px이 된다.
      // 안쪽 gap을 4px 상쇄해 균일하게 맞춘다(DS 수정 없이 서비스 쪽에서 해결).
      className="w-11 h-11 -mr-1 rounded-[var(--radius-pill)] flex items-center justify-center shrink-0 active:scale-95 transition-transform duration-100"
    >
      {/* 프로필 아바타와 동일한 형태 — 44×44 터치영역 안에 36px 서클, 그 안에 16px 아이콘.
          .t-badge의 기준 박스는 서클 자신이다(44px 터치영역을 기준으로 잡으면 점이
          모서리로 밀려나 종에서 떨어져 보인다). */}
      <span className="relative w-9 h-9 rounded-[var(--radius-pill)] bg-surface-elevated text-text flex items-center justify-center">
        <BellIcon className="w-4 h-4" />
        <span className="t-badge jam-bell-dot" data-open={hasUnreadNotifications} aria-hidden="true">
          <span
            className="t-badge-dot w-2 h-2 rounded-[var(--radius-pill)]"
            style={{ background: 'var(--color-notification-dot)' }}
          />
        </span>
      </span>
    </Link>
  )
}
