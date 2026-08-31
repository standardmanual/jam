'use client'

import Link from 'next/link'
import { LockIcon } from '@/components/ui/icons'

/**
 * 배지 트리(/badges/tree) 전용 — 선행조건(배지/미션) 잠금 칩.
 * 클릭 시 선행 배지 상세(`/badges/{id}`) 또는 선행 미션 상세(`/missions/{id}`)로 이동한다.
 * 서비스 전용 UI(MODULAR 승격 대상 아님) — 티켓 20260831_2208.
 */
export interface BadgeTreeLockChipProps {
  label: string
  href: string
}

export default function BadgeTreeLockChip({ label, href }: BadgeTreeLockChipProps) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 min-h-11 w-fit max-w-full px-[var(--spacing-12)] py-[var(--spacing-8)] rounded-[var(--radius-nav-buttons)] bg-white/8 text-[length:var(--text-caption)] leading-snug text-[var(--color-text-secondary)] active:scale-95 transition-transform duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
    >
      <LockIcon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </Link>
  )
}
