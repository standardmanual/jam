'use client'

import { useState } from 'react'
import BottomSheet from '@/components/ui/BottomSheet'
import { SHEET_VALUE_ROW_STYLE } from '@/components/ui/sheetClasses'
import { ListRow } from '@/components/ui/ListRow'
import { Card } from '@ds/components/cards/Card'
import LocalDate from '@/components/LocalDate'
import { d } from '@/lib/i18n'

export type ItemEarnEntry = {
  id: string
  serial: string
  obtained_at: string
  expires_at: string | null
}

/** 획득 내용 — 페이지의 첫 카드와 시트가 같이 쓴다. `inSheet`이면 값 행을 줄이고 행 사이에 가는 선을 긋는다(티켓 20261110_2150) */
function ItemCardContent({ entry, inSheet = false }: { entry: ItemEarnEntry; inSheet?: boolean }) {
  const rows = [
    { key: 'obtained', title: d.inventory.obtainedAt, iso: entry.obtained_at },
    ...(entry.expires_at ? [{ key: 'expires', title: d.inventory.expiresAt, iso: entry.expires_at }] : []),
  ]
  return (
    <div className={inSheet ? 'flex flex-col' : 'flex flex-col -mb-3'}>
      {rows.map((row, i) => (
        <ListRow
          key={row.key}
          tone="flat"
          titleVariant="label"
          titleLines={0}
          title={row.title}
          value={<LocalDate iso={row.iso} stamp stampBreak />}
          valueNoWrap
          separator={inSheet && i < rows.length - 1}
          style={inSheet ? SHEET_VALUE_ROW_STYLE : undefined}
        />
      ))}
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
      {/* 제목만 둔다 — 오른쪽의 «총 N회»는 걷었고 제목은 다른 배지 상세와 같은 «획득 정보»다(2026-11-09 사용자 지시) */}
      <p className="text-[15px] font-bold text-foreground">{d.badges.earnInfoTitle}</p>

      {/* 히어로에 일련번호가 표시된 개체의 이력 — 카드 형식 */}
      <Card>
        <ItemCardContent entry={first} />
      </Card>

      {/* 2번째부터 — lead 없는 ListRow(날짜 제목 + 쉐브론). 대표 serial은 위 ItemSerialCode가 이미 보여주므로,
          이 줄은 개체 구분용으로 획득일을 보여준다(PoiEarnHistory의 같은 자리 관례 재사용). */}
      {rest.map((entry) => (
        <ListRow
          key={entry.id}
          title={<LocalDate iso={entry.obtained_at} stamp />}
          titleVariant="regular"
          titleLines={2}
          chevron
          onClick={() => setOpenId(entry.id)}
        />
      ))}

      {/* 이력 상세 바텀시트 */}
      <BottomSheet open={openEntry !== null} onClose={() => setOpenId(null)}>
        <div className="px-6 pt-5 pb-6">
          {openEntry && <ItemCardContent entry={openEntry} inSheet />}
        </div>
      </BottomSheet>
    </div>
  )
}
