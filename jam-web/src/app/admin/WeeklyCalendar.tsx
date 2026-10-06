'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { OpsKindIcon } from '@/components/admin/ops/opsIcons'
import { OpsStatusBadge } from '@/components/admin/ops/OpsStatusBadge'
import { cn } from '@/lib/utils'
import { kindLabel } from '@/lib/admin/opsInbox/labels'
import type { OpsSignalLevel } from '@/lib/admin/opsSignals/catalog'
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
  /** 있으면 항목 아래 작은 글씨 한 줄로 표시한다. 카드 항목의 노출·열람 수 등(티켓 20260924_0908) */
  note?: string
  /** 항목 종류(`OPS_ITEM_KINDS` 값). 있으면 시각 앞에 종류 아이콘을 그린다(일정표 주간 보기, 티켓 20261006_1536) */
  itemKind?: string
  /** 운영 항목 상태. 있으면 항목 아래 줄에 상태 칩(아이콘 + 글자)을 그린다(티켓 20261006_1536) */
  status?: string
  /** 시험 묶음의 항목이면 상태 칩 옆에 「시험」 칩을 그린다(티켓 20261006_1536) */
  isSample?: boolean
  /** 서랍을 여는 키. `data-drawer-key`로 남겨 서랍이 닫힐 때 포커스가 돌아올 자리를 찾는 데 쓴다(③-b) */
  drawerKey?: string
}

/** 칸 머리의 신호 칩: 그날 가장 높은 수준 하나와 건수(칩을 쌓지 않는다, 티켓 20261006_1536) */
export interface CalendarDaySignal {
  level: OpsSignalLevel
  count: number
}

/** 미션 막대. 일정표에서는 운영 미션의 상태·시험 표식과 이동 경로를 더 가진다(티켓 20261006_1536). 없으면 옛 막대와 같다 */
export interface CalendarMissionBar extends WeeklyMissionBar {
  status?: string | null
  isSample?: boolean
  /** 없으면 `/admin/missions/{id}` */
  href?: string | null
  drawerKey?: string
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
  /** 그 날짜에 걸치는 비활성 장기 카드 수. 있으면 「장기 카드 N장 · 비활성 M장」으로 표시한다(티켓 20260924_1151, 20261006_1536) */
  longInactiveCount?: number
  /** true면 오늘 칸이다. 「오늘」 글자 + 굵은 테두리 + `aria-current="date"`(티켓 20261006_1536) */
  isToday?: boolean
  /** 칸 머리 오른쪽의 신호 칩. 없거나 null이면 칩이 없다(티켓 20261006_1536) */
  signal?: CalendarDaySignal | null
  /** 있으면 「자동 실행 N개 ▸」 접힘 줄로 따로 둔다(크론·루틴). 없으면 `items`에 섞인 옛 모양 그대로다(티켓 20261006_1536, 승인 #14) */
  automationItems?: CalendarCellItem[]
}

interface WeeklyCalendarProps {
  /** 표시 중인 주의 월요일, 'YYYY-MM-DD' */
  weekStart: string
  weekRangeLabel: string
  columns: CalendarColumn[]
  /** 주 이동 시 이동할 경로. 기본값 '/admin' */
  basePath?: string
  /** 그 주와 겹치는 기간 미션 막대 목록. 있으면 7칸 그리드 위에 같은 7열 그리드로 그린다(티켓 20260924_0907) */
  missionBars?: CalendarMissionBar[]
  /** 있으면 "상시 미션 N개" 한 줄을 `/admin/missions` 링크로 표시한다(티켓 20260924_0907) */
  openEndedMissionCount?: number
  /** false면 머리의 이전·다음 주 이동을 그리지 않는다(일정표의 도구줄이 대신한다, 티켓 20261006_1536). 기본은 그린다 */
  nav?: boolean
  /** true면 달력 영역 폭(`@container`)에 맞춰 56rem 이상은 7열, 미만은 날짜별 가로 줄로 바뀐다(티켓 20261006_1536). 기본은 항상 7열이다 */
  adaptive?: boolean
}

/** 항목 칩 줄을 그려야 하는 항목인가(종류·상태·시험 중 하나라도 있으면 일정표용 두 줄 모양이다). 없으면 옛 모양 그대로다 */
function isRichItem(item: CalendarCellItem): boolean {
  return item.itemKind !== undefined || item.status !== undefined || item.isSample === true
}

/** 항목 한 줄. 옛 항목은 옛 마크업 그대로이고, 종류·상태·시험이 있는 항목은 아이콘 + 시각 + 제목 / 상태 칩 + 시험 칩 두 줄이다 */
function CalendarItem({ item }: { item: CalendarCellItem }) {
  const content = (
    <>
      {item.time !== '' || !isRichItem(item) ? <span className="font-mono text-muted-foreground">{item.time}</span> : null}
      {item.time !== '' || !isRichItem(item) ? ' ' : null}
      {item.kind === 'mission' && (
        <span className="mr-1 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">시작</span>
      )}
      {item.kind === 'routine' && (
        <span className="mr-1 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">루틴</span>
      )}
      <span>{item.label}</span>
    </>
  )
  const linked = item.href ? (
    <Link href={item.href} className="hover:underline">
      {content}
    </Link>
  ) : (
    content
  )

  if (!isRichItem(item)) {
    return (
      <li className={cn('text-xs leading-snug', item.dim && 'opacity-40')}>
        {linked}
        {item.note && <p className="text-[11px] text-muted-foreground">{item.note}</p>}
      </li>
    )
  }

  return (
    <li data-drawer-key={item.drawerKey} className={cn('text-xs leading-snug', item.dim && 'opacity-40')}>
      <div className="flex items-start gap-1">
        {item.itemKind !== undefined && (
          <>
            <OpsKindIcon kind={item.itemKind} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="sr-only">{kindLabel(item.itemKind)}</span>
          </>
        )}
        <div className="min-w-0 break-words">{linked}</div>
      </div>
      {item.note && <p className="text-[11px] text-muted-foreground">{item.note}</p>}
      {(item.status !== undefined || item.isSample === true) && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {item.status !== undefined && <OpsStatusBadge type="item" status={item.status} />}
          {item.isSample === true && <OpsStatusBadge type="sample" />}
        </div>
      )}
    </li>
  )
}

/** 미션 막대 한 줄의 안쪽. 옛 막대(상태 없음)는 옛 마크업 그대로다 */
function MissionBarContent({ bar }: { bar: CalendarMissionBar }) {
  return (
    <>
      {bar.status != null && <OpsStatusBadge type="item" status={bar.status} />}
      {bar.isSample === true && <OpsStatusBadge type="sample" />}
      {bar.startsThisWeek && <span className="shrink-0 text-[10px] font-medium text-muted-foreground">시작</span>}
      {bar.isGate && (
        <span className="shrink-0 rounded bg-white px-1 text-[10px] font-medium text-muted-foreground">게이트</span>
      )}
      <span className="truncate">{bar.title}</span>
      {bar.endsThisWeek && <span className="shrink-0 text-[10px] font-medium text-muted-foreground">종료</span>}
    </>
  )
}

/**
 * 어드민 메인 주간 캘린더 뼈대(티켓 20260924_0904).
 *
 * 크론 전용이 아니라 **요일별 항목 목록**을 받는 범용 컴포넌트다 — 이 파일은 크론을
 * 전혀 모른다. 하위 티켓(루틴·카드·미션·반응, 0905~0908)이 각자의 항목을
 * `columns[].items`에 채워 같은 컴포넌트에 얹는다.
 *
 * 일정표(`/admin/ops-schedule`)의 주간 보기가 같은 컴포넌트를 쓴다(티켓 20261006_1536 ③-a, 상위 20260930_1502 「채원 S1·S4 사전 판정」).
 * 확장은 모두 **선택**이다 — `nav`·`adaptive`·항목의 `itemKind`·`status`·`isSample`·칸의 `isToday`·`signal`·`longInactiveCount`·`automationItems`·막대의 `status`를
 * 주지 않으면 운영 홈이 그리던 마크업 그대로다(`app/admin/__tests__/home-sections.test.tsx`가 지킨다).
 */
export default function WeeklyCalendar({
  weekStart,
  weekRangeLabel,
  columns,
  basePath = '/admin',
  missionBars,
  openEndedMissionCount,
  nav = true,
  adaptive = false,
}: WeeklyCalendarProps) {
  const router = useRouter()
  const goToWeek = (monday: string) => router.push(`${basePath}?week=${monday}`)

  return (
    <section className={cn('mb-10', adaptive && '@container')}>
      {nav && (
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
      )}
      {!!missionBars?.length && (
        <>
          <div className={cn('grid grid-cols-7 gap-2 mb-2', adaptive && 'hidden @[56rem]:grid')}>
            {missionBars.map((bar) => (
              <Link
                key={bar.id}
                href={bar.href ?? `/admin/missions/${bar.id}`}
                style={{ gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}` }}
                className="flex items-center gap-1 truncate rounded-lg border border-border bg-muted px-2 py-1 text-xs hover:underline"
              >
                <MissionBarContent bar={bar} />
              </Link>
            ))}
          </div>
          {adaptive && (
            // 좁은 달력에서는 막대를 7열에 걸지 않고 기간 글자와 함께 한 줄씩 쌓는다
            <ul className="mb-2 space-y-1 @[56rem]:hidden">
              {missionBars.map((bar) => (
                <li key={bar.id}>
                  <Link
                    href={bar.href ?? `/admin/missions/${bar.id}`}
                    className="flex min-w-0 flex-wrap items-center gap-1 rounded-lg border border-border bg-muted px-2 py-1 text-xs hover:underline"
                  >
                    <MissionBarContent bar={bar} />
                    <span className="text-[11px] text-muted-foreground">
                      {columns[bar.startCol]?.dateLabel} ~ {columns[bar.endCol]?.dateLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {openEndedMissionCount !== undefined && (
        <Link href="/admin/missions" className="mb-2 block text-xs text-muted-foreground hover:underline">
          상시 미션 {openEndedMissionCount}개
        </Link>
      )}
      <div className={cn('grid grid-cols-7 gap-2', adaptive && 'grid-cols-1 @[56rem]:grid-cols-7')}>
        {columns.map((col) => {
          const contentEmpty = col.items.length === 0 && !col.longCardsCount && !col.longInactiveCount && !col.unprogrammed
          const head =
            col.signal || col.isToday ? (
              <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
                <p className="text-xs font-semibold text-muted-foreground">
                  {col.weekdayLabel} <span className="font-normal">{col.dateLabel}</span>
                  {col.isToday && <span className="ml-1 font-bold text-foreground">오늘</span>}
                </p>
                {col.signal && (
                  <span className="inline-flex items-center gap-1">
                    <OpsStatusBadge type="signal" level={col.signal.level} />
                    <span className="text-xs tabular-nums text-muted-foreground">{col.signal.count}건</span>
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                {col.weekdayLabel} <span className="font-normal">{col.dateLabel}</span>
              </p>
            )
          const body = (
            <>
              {contentEmpty ? (
                <p className="text-xs text-muted-foreground/60">일정 없음</p>
              ) : (
                <div className="space-y-1">
                  {col.unprogrammed && <p className="text-xs font-bold text-red-600">미편성</p>}
                  {(!!col.longCardsCount || !!col.longInactiveCount) && (
                    <Link href={`/admin/today?date=${col.date}`} className="block text-xs hover:underline">
                      장기 카드 {col.longCardsCount ?? 0}장{!!col.longInactiveCount && ` · 비활성 ${col.longInactiveCount}장`}
                    </Link>
                  )}
                  {col.items.length > 0 && (
                    <ul className="space-y-1">
                      {col.items.map((item) => (
                        <CalendarItem key={item.id} item={item} />
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {!!col.automationItems?.length && (
                <details className="group mt-2 text-xs">
                  <summary className="flex min-h-6 cursor-pointer list-none items-center gap-1 text-muted-foreground [&::-webkit-details-marker]:hidden">
                    <IconChevronRight
                      className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                    자동 실행 {col.automationItems.length}개
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {col.automationItems.map((item) => (
                      <CalendarItem key={item.id} item={item} />
                    ))}
                  </ul>
                </details>
              )}
            </>
          )
          return (
            <div
              key={col.date}
              aria-current={col.isToday ? 'date' : undefined}
              className={cn(
                'bg-white border border-border rounded-xl p-3 min-h-[110px]',
                col.isToday && 'border-foreground ring-1 ring-foreground',
                adaptive && 'grid min-h-0 min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-x-3 @[56rem]:block @[56rem]:min-h-[110px]'
              )}
            >
              {head}
              {adaptive ? <div className="min-w-0">{body}</div> : body}
            </div>
          )
        })}
      </div>
    </section>
  )
}
