'use client'

import Link from 'next/link'
import { LockIcon, CheckIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'
import type { BadgeTreeLock } from '@/lib/badgeTree'

/**
 * 배지 트리(/badges/tree) 전용 — 선행조건(배지/미션) 잠금 칩.
 * 클릭 시 선행 배지 상세(`/badges/{id}`) 또는 선행 미션 상세(`/missions/{id}`)로 이동한다.
 * 서비스 전용 UI(MODULAR 승격 대상 아님) — 티켓 20260831_2208.
 *
 * kind='badge'이고 이미 보유한 선행 배지면 "획득 완료" 문구로 바뀐다(20260901 UI 수정).
 * 선행 배지/미션 이름은 항상 볼드 처리한다.
 */
export type BadgeTreeLockChipProps = BadgeTreeLock

/** i18n 템플릿의 `{name}` 위치를 기준으로 이름을 볼드 처리할 수 있게 앞/뒤로 쪼갠다. */
function splitAtName(template: string): [string, string] {
  const [before, after = ''] = template.split('{name}')
  return [before, after]
}

export default function BadgeTreeLockChip({ kind, name, href, fulfilled }: BadgeTreeLockChipProps) {
  const template =
    kind === 'mission'
      ? d.badges.treeLockMissionHint
      : fulfilled
        ? d.badges.treeLockBadgeFulfilled
        : d.badges.treeLockBadgeHint
  const [before, after] = splitAtName(template)

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 min-h-11 w-fit max-w-full px-[var(--spacing-12)] py-[var(--spacing-8)] rounded-[var(--radius-nav-buttons)] bg-white/8 text-[length:var(--text-caption)] leading-snug text-[var(--color-text-secondary)] active:scale-95 transition-transform duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
    >
      {kind === 'badge' && fulfilled ? (
        <CheckIcon className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <LockIcon className="w-3.5 h-3.5 shrink-0" />
      )}
      <span>
        {before}
        <strong className="font-bold text-[var(--color-text)]">{name}</strong>
        {after}
      </span>
    </Link>
  )
}
