'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { cn } from '@/lib/utils'
import { shiftDateStr } from '@/lib/admin/today-calendar'
import type { WeeklyMissionBar } from '@/lib/admin/weeklyMissions'

export interface CalendarCellItem {
  id: string
  /** "09:00" 또는 "매시간"처럼 화면에 그대로 찍을 시각 라벨. 카드 항목은 유형 ID(또는 "유형 없음")를 담는다(티켓 20260924_0906) */
  time: string
  label: string
  /**
   * 항목 종류 표식. 'routine'이면 크론과 구분되는 표식을, 'card'면 홈피드 카드임을(티켓
   * 20260924_0905, 20260924_0906), 'mission'이면 그 주에 새로 시작하는 상시 미션임을
   * 나타낸다(티켓 20260924_0907)
   */
  kind?: 'routine' | 'card' | 'mission'
  /** true면 흐리게 표시한다(꺼진 루틴, 비활성 카드 등) */
  dim?: boolean
  /** 있으면 항목 전체가 이 경로로 이동하는 링크가 된다(티켓 20260924_0906) */
  href?: string
}

export interface CalendarColumn {
  /** 'YYYY-MM-DD' */
  date: string
  weekdayLabel: string
  dateLabel: string
  items: CalendarCellItem[]
  /** 그 날짜에 걸치는 활성 장기 카드 수. 있으면 "장기 카드 N장" 한 줄로 표시하고 `/admin/today?date=`로 링크한다(티켓 20260924_0906) */
  longCardsCount?: number
  /** true면 "미편성"을 표시한다(활성 단기 카드가 없는 날, 티켓 20260924_0906) */
  unprogrammed?: boolean
}

interface WeeklyCalendarProps {
  /** 표시 중인 주의 월요일, 'YYYY-MM-DD' */
  weekStart: string
  weekRangeLabel: string
  columns: CalendarColumn[]
  /** 주 이동 시 이동할 경로. 기본값 '/admin' */
  basePath?: string
  /** 그 주와 겹치는 기간 미션 막대 목록. 있으면 7칸 그리드 위에 같은 7열 그리드로 그린다(티켓 20260924_0907) */
  missionBars?: WeeklyMissionBar[]
  /** 있으면 "상시 미션 N개" 한 줄을 `/admin/missions` 링크로 표시한다(티켓 20260924_0907) */
  openEndedMissionCount?: number
}

/**
 * 어드민 메인 주간 캘린더 뼈대(티켓 20260924_0904).
 *
 * 크론 전용이 아니라 **요일별 항목 목록**을 받는 범용 컴포넌트다 — 이 파일은 크론을
 * 전혀 모른다. 하위 티켓(루틴·카드·미션·반응, 0905~0908)이 각자의 항목을
 * `columns[].items`에 채워 같은 컴포넌트에 얹는다.
 */
export default function WeeklyCalendar({
  weekStart,
  weekRangeLabel,
  columns,
  basePath = '/admin',
  missionBars,
  openEndedMissionCount,
}: WeeklyCalendarProps) {
  const router = useRouter()
  const goToWeek = (monday: string) => router.push(`${basePath}?week=${monday}`)

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="이전 주"
          onClick={() => goToWeek(shiftDateStr(weekStart, -7))}
        >
          <IconChevronLeft className="w-4 h-4" />
        </Button>
        <span className="font-bold text-sm">{weekRangeLabel}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="다음 주"
          onClick={() => goToWeek(shiftDateStr(weekStart, 7))}
        >
          <IconChevronRight className="w-4 h-4" />
        </Button>
      </div>
      {!!missionBars?.length && (
        <div className="grid grid-cols-7 gap-2 mb-2">
          {missionBars.map((bar) => (
            <Link
              key={bar.id}
              href={`/admin/missions/${bar.id}`}
              style={{ gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}` }}
              className="flex items-center gap-1 truncate rounded-lg border border-border bg-muted px-2 py-1 text-xs hover:underline"
            >
              {bar.startsThisWeek && <span className="shrink-0 text-[10px] font-medium text-muted-foreground">시작</span>}
              {bar.isGate && (
                <span className="shrink-0 rounded bg-white px-1 text-[10px] font-medium text-muted-foreground">게이트</span>
              )}
              <span className="truncate">{bar.title}</span>
              {bar.endsThisWeek && <span className="shrink-0 text-[10px] font-medium text-muted-foreground">종료</span>}
            </Link>
          ))}
        </div>
      )}
      {openEndedMissionCount !== undefined && (
        <Link href="/admin/missions" className="mb-2 block text-xs text-muted-foreground hover:underline">
          상시 미션 {openEndedMissionCount}개
        </Link>
      )}
      <div className="grid grid-cols-7 gap-2">
        {columns.map((col) => (
          <div key={col.date} className="bg-white border border-border rounded-xl p-3 min-h-[110px]">
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              {col.weekdayLabel} <span className="font-normal">{col.dateLabel}</span>
            </p>
            {col.items.length === 0 && !col.longCardsCount && !col.unprogrammed ? (
              <p className="text-xs text-muted-foreground/60">일정 없음</p>
            ) : (
              <div className="space-y-1">
                {col.unprogrammed && <p className="text-xs font-bold text-red-600">미편성</p>}
                {!!col.longCardsCount && (
                  <Link href={`/admin/today?date=${col.date}`} className="block text-xs hover:underline">
                    장기 카드 {col.longCardsCount}장
                  </Link>
                )}
                {col.items.length > 0 && (
                  <ul className="space-y-1">
                    {col.items.map((item) => {
                      const content = (
                        <>
                          <span className="font-mono text-muted-foreground">{item.time}</span>{' '}
                          {item.kind === 'mission' && (
                            <span className="mr-1 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                              시작
                            </span>
                          )}
                          {item.kind === 'routine' && (
                            <span className="mr-1 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                              루틴
                            </span>
                          )}
                          <span>{item.label}</span>
                        </>
                      )
                      return (
                        <li key={item.id} className={cn('text-xs leading-snug', item.dim && 'opacity-40')}>
                          {item.href ? (
                            <Link href={item.href} className="hover:underline">
                              {content}
                            </Link>
                          ) : (
                            content
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
