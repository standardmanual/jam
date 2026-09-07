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

export default function ItemEarnHistory({
  items,
  activeItemId = null,
}: {
  items: ItemEarnEntry[]
  /**
   * 화면 위쪽 히어로에 일련번호가 크게 표시된 **바로 그 개체**의 id(`?item`으로 지목됐거나
   * 폴백으로 선정된 대표 개체). 이력 첫 카드는 이 개체의 획득일·만료일을 그린다.
   *
   * 이 prop이 없던 20260907_2059 1차 구현에서는 첫 카드가 항상 `items[0]`(=obtained_at DESC
   * 최신 개체)이라, 컬렉션에서 장착된 개체로 진입하면 히어로 일련번호와 첫 카드의 날짜가
   * **서로 다른 개체**를 가리켰다(실측: "아지랑이의 환영" 히어로 MMBT829356(09-06 획득),
   * 첫 카드 획득일 2026.09.07).
   */
  activeItemId?: string | null
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (items.length === 0) return null

  const first = items.find((item) => item.id === activeItemId) ?? items[0]
  const rest = items.filter((item) => item.id !== first.id)
  const openEntry = openId ? items.find((item) => item.id === openId) ?? null : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[15px] font-bold text-text">{d.badges.earnHistoryTitle}</p>
        <span className="text-[13px] text-[var(--color-text-secondary)]">{t(d.badges.earnHistoryCount, { count: items.length })}</span>
      </div>

      {/* 히어로에 일련번호가 표시된 개체의 이력 — 카드 형식 */}
      <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6">
        <ItemCardContent entry={first} />
      </div>

      {/* 2번째부터 — ListRowCard. 대표 serial은 위 ItemSerialCode가 이미 보여주므로,
          이 줄은 개체 구분용으로 획득일을 보여준다(PoiEarnHistory의 같은 자리 관례 재사용). */}
      {rest.map((entry) => (
        <ListRowCard
          key={entry.id}
          onClick={() => setOpenId(entry.id)}
          trailing={<ChevronRightIcon className="w-4 h-4 text-[var(--color-text-secondary)]" />}
        >
          <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text">
            <LocalDate iso={entry.obtained_at} options={{ year: 'numeric', month: '2-digit', day: '2-digit' }} />
          </p>
        </ListRowCard>
      ))}

      {/* 이력 상세 바텀시트 */}
      <BottomSheet open={openEntry !== null} onClose={() => setOpenId(null)}>
        <div className="px-6 pt-2 pb-8">
          {openEntry && <ItemCardContent entry={openEntry} />}
        </div>
      </BottomSheet>
    </div>
  )
}
