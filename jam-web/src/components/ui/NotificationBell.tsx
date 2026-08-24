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
 * - 노출 판정(루트 화면에만)은 이 컴포넌트가 아니라 서비스 `TopNav` 래퍼가 한다.
 */
export default function NotificationBell() {
  const { hasUnreadNotifications } = useTopNavData()

  return (
    <Link
      href="/notifications"
      aria-label={
        hasUnreadNotifications
          ? `${d.notifications.bellLabel}, ${d.notifications.unreadDotLabel}`
          : d.notifications.bellLabel
      }
      className="relative w-11 h-11 flex items-center justify-center shrink-0 text-text active:scale-95 transition-transform duration-100"
    >
      <BellIcon className="w-6 h-6" />
      {hasUnreadNotifications && (
        <span
          aria-hidden="true"
          className="absolute top-2.5 right-2.5 w-2 h-2 rounded-[var(--radius-pill)]"
          style={{ background: 'var(--color-notification-dot)' }}
        />
      )}
    </Link>
  )
}
