'use client'

import { IconSearch } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { kindLabel } from '@/lib/admin/opsInbox/labels'
import {
  DAY_EMPTY_TEXT,
  dayItemsNotice,
  dayRepresentativeNotice,
  daySignalNotice,
  formatDayTitle,
  type ScheduleSourceErrors,
} from '@/lib/admin/opsSchedule/drawerView'
import type { ScheduleDay, ScheduleItem } from '@/lib/admin/opsSchedule/weekView'
import { OpsDrawerFrame } from './OpsDrawerFrame'
import { OpsKindIcon } from './opsIcons'
import { OpsSignalRow } from './OpsSignalRow'
import { OpsStatusBadge } from './OpsStatusBadge'

/**
 * 일정표 날짜 서랍 (티켓 20261006_1537 ③-b, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 「날짜 서랍」, 카리나 가정 1·5).
 *
 * 칸 머리를 누르면 열린다. 「10월 7일(화)」 · 신호 N건(`OpsSignalRow`) · 그날 항목 목록(누르면 항목 서랍) · 대표 카드. 데이터는 **이미 읽은 주간 데이터**로 그린다(새 요청 없음, 가정 1).
 *
 * - 신호: 줄은 중단 → 주의 → 참고 순이다. 검사 범위 밖 날짜는 「이 날짜는 신호를 확인하는 기간이 아니에요」(「이상 없음」을 말하지 않는다), 신호를 못 읽었으면 신호가 없다는 뜻이 아니라고 알린다.
 *   신호 줄의 이동 링크는 `OpsSignalRow`가 정한다(항목이 있으면 기획 상세, 날짜만 있으면 그날).
 * - 항목 목록: 칸에 올라간 항목(운영 항목·옛 카드·미션). 반려·취소·실패 항목은 칸에 없어 여기에도 없다(가정 4). 못 읽은 재료가 있으면 빠졌을 수 있다고 알린다.
 * - 대표 카드: 그날 전원 대상 카드 가운데 정렬이 가장 앞인 카드. 목록에 있는 항목이면 눌러 항목 서랍을 연다.
 */

interface OpsScheduleDayDrawerProps {
  /** 열린 날짜(KST `YYYY-MM-DD`). */
  date: string
  /** 지금 보는 주의 날짜들. */
  days: readonly ScheduleDay[]
  sourceErrors: ScheduleSourceErrors
  /** 시험 묶음 포함 여부. 신호 줄의 이동 링크에 이어 붙인다. */
  includeSample: boolean
  onClose: () => void
  /** 항목 서랍을 연다(항목 서랍 키). */
  onOpenItem: (key: string) => void
  className?: string
}

export const SCHEDULE_DAY_MISSING_TEXT = '이 주 일정에 없는 날짜예요'
const DAY_ITEM_BUTTON =
  'flex min-h-11 w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @[40rem]:min-h-9'

function SectionTitle({ children }: { children: string }) {
  return <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">{children}</h3>
}

function DayItemRow({ item, isRepresentative, onOpen }: { item: ScheduleItem; isRepresentative: boolean; onOpen: (key: string) => void }) {
  return (
    <li>
      <button type="button" className={cn(DAY_ITEM_BUTTON, item.dim && 'opacity-40')} onClick={() => onOpen(item.drawerKey)}>
        <OpsKindIcon kind={item.kind} className="size-4 shrink-0 text-muted-foreground" />
        <span className="sr-only">{kindLabel(item.kind)}</span>
        {item.time !== '' && <span className="font-mono text-xs text-muted-foreground">{item.time}</span>}
        <span className="min-w-0 break-words font-medium">{item.title}</span>
        {item.status !== null && <OpsStatusBadge type="item" status={item.status} />}
        {item.isSample && <OpsStatusBadge type="sample" />}
        {isRepresentative && <span className="rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">대표</span>}
        <span className="sr-only"> 서랍 열기</span>
      </button>
    </li>
  )
}

export function OpsScheduleDayDrawer({ date, days, sourceErrors, includeSample, onClose, onOpenItem, className }: OpsScheduleDayDrawerProps) {
  const day = days.find((entry) => entry.date === date)
  if (!day) {
    return (
      <OpsDrawerFrame onClose={onClose} className={className}>
        <div className="flex flex-col items-start gap-2">
          <IconSearch className="size-5 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">{SCHEDULE_DAY_MISSING_TEXT}</p>
        </div>
      </OpsDrawerFrame>
    )
  }

  const signalNotice = daySignalNotice(day.signals)
  const signalLines = day.signals?.lines ?? []
  const itemsNotice = dayItemsNotice(sourceErrors)
  const representative = day.representative
  const representativeNotice = dayRepresentativeNotice(day, sourceErrors)
  const representativeItem = representative ? day.items.find((item) => item.drawerKey === representative.drawerKey) : undefined

  return (
    <OpsDrawerFrame title={`서랍 · ${formatDayTitle(day)}`} onClose={onClose} className={className}>
      <div className="space-y-5">
        <section aria-label="신호">
          <SectionTitle>{day.signals === null ? '신호' : `신호 ${day.signals.count}건`}</SectionTitle>
          {signalLines.length > 0 && (
            <ul className="space-y-2">
              {signalLines.map((line, index) => (
                <li key={`${line.signalKey}-${index}`}>
                  <OpsSignalRow name={line.name} level={line.level} result={line.result} includeSample={includeSample} />
                </li>
              ))}
            </ul>
          )}
          {signalNotice && <p className={cn('text-sm text-muted-foreground', signalLines.length > 0 && 'mt-2')}>{signalNotice}</p>}
        </section>

        <section aria-label="항목">
          <SectionTitle>{`항목 ${day.items.length}개`}</SectionTitle>
          {itemsNotice && <p className="mb-2 text-sm text-muted-foreground">{itemsNotice}</p>}
          {day.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{DAY_EMPTY_TEXT}</p>
          ) : (
            <ul className="space-y-0.5">
              {day.items.map((item) => (
                <DayItemRow
                  key={item.id}
                  item={item}
                  isRepresentative={representative !== null && item.drawerKey === representative.drawerKey}
                  onOpen={onOpenItem}
                />
              ))}
            </ul>
          )}
        </section>

        <section aria-label="대표 카드">
          <SectionTitle>대표 카드</SectionTitle>
          {representative ? (
            representativeItem ? (
              <button type="button" className={DAY_ITEM_BUTTON} onClick={() => onOpenItem(representative.drawerKey)}>
                <span className="min-w-0 break-words font-medium">{representative.title}</span>
                <span className="sr-only"> 서랍 열기</span>
              </button>
            ) : (
              <p className="break-words text-sm font-medium">{representative.title}</p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">{representativeNotice}</p>
          )}
        </section>
      </div>
    </OpsDrawerFrame>
  )
}
