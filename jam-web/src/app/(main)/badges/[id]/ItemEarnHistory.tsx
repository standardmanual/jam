'use client'

import { useState } from 'react'
import BottomSheet from '@/components/ui/BottomSheet'
import ListRowCard from '@/components/ui/ListRowCard'
import LocalDate from '@/components/LocalDate'
import { ChevronRightIcon } from '@/components/ui/icons'
import { d, t } from '@/lib/i18n'

export type ItemEarnEntry = {
  id: string
  serial: string
  obtained_at: string
  expires_at: string | null
}

function ItemCardContent({ entry }: { entry: ItemEarnEntry }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <span className="text-[14px] text-[var(--color-text-secondary)]">{d.inventory.serialNumber}</span>
        <span className="text-[14px] text-text font-mono tracking-widest">{entry.serial}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-[14px] text-[var(--color-text-secondary)]">{d.inventory.obtainedAt}</span>
        <span className="text-[14px] text-text">
          <LocalDate iso={entry.obtained_at} options={{ year: 'numeric', month: '2-digit', day: '2-digit' }} />
        </span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-[14px] text-[var(--color-text-secondary)]">{d.inventory.expiresAt}</span>
        <span className="text-[14px] text-text">
          {entry.expires_at
            ? <LocalDate iso={entry.expires_at} options={{ year: 'numeric', month: '2-digit', day: '2-digit' }} />
            : d.inventory.expiresNone}
        </span>
      </div>
    </div>
  )
}

export default function ItemEarnHistory({ items }: { items: ItemEarnEntry[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  if (items.length === 0) return null

  const [first, ...rest] = items

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[15px] font-bold text-text">{d.badges.earnHistoryTitle}</p>
        <span className="text-[13px] text-[var(--color-text-secondary)]">{t(d.badges.earnHistoryCount, { count: items.length })}</span>
      </div>

      {/* 최신(첫 번째) 이력 — 카드 형식 */}
      <div className="bg-[var(--color-surface)] shadow-[inset_0_0_0_1px_var(--color-border)] rounded-[var(--radius-cards)] p-6">
        <ItemCardContent entry={first} />
      </div>

      {/* 2번째부터 — ListRowCard */}
      {rest.map((entry, i) => (
        <ListRowCard
          key={entry.id}
          onClick={() => setOpenIdx(i + 1)}
          trailing={<ChevronRightIcon className="w-4 h-4 text-[var(--color-text-secondary)]" />}
        >
          <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text font-mono tracking-widest">
            {entry.serial}
          </p>
        </ListRowCard>
      ))}

      {/* 이력 상세 바텀시트 */}
      <BottomSheet open={openIdx !== null} onClose={() => setOpenIdx(null)}>
        <div className="px-6 pt-2 pb-8">
          {openIdx !== null && (
            <div className="bg-[var(--color-surface)] shadow-[inset_0_0_0_1px_var(--color-border)] rounded-[var(--radius-cards)] p-6">
              <ItemCardContent entry={items[openIdx]} />
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  )
}
