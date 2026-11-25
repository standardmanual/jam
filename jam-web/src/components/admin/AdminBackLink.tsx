'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentProps, MouseEvent, ReactNode } from 'react'
import { canGoBackInApp } from '@/lib/appHistory'

export interface AdminBackLinkProps extends Omit<ComponentProps<typeof Link>, 'href'> {
  /** 직접 진입(새 탭·공유 링크·외부 유입)이나 새 탭 열기 클릭 시 이동할 기본 목록 경로 */
  fallbackHref: string
  children: ReactNode
}

/**
 * 어드민 상세·편집·신규 화면의 공용 뒤로가기 링크 (티켓 20261125_1136).
 *
 * `<Link href={fallbackHref}>` 시맨틱을 유지해 우클릭·새 탭 열기·SSR 링크 계약을 보존하되,
 * 일반 클릭 시 앱 내부 히스토리가 있으면 `router.back()`으로 직전 목록의 탭·필터·검색·정렬·페이지를
 * 그대로 복원한다. 직접 진입이면 `fallbackHref`로 이동한다.
 */
export function AdminBackLink({ fallbackHref, children, onClick, ...rest }: AdminBackLinkProps) {
  const router = useRouter()

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return
    }
    if (canGoBackInApp()) {
      e.preventDefault()
      router.back()
    }
  }

  return (
    <Link href={fallbackHref} onClick={handleClick} {...rest}>
      {children}
    </Link>
  )
}
