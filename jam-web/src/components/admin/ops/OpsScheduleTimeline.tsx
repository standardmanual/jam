'use client'

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { drawerTriggerValue, isSameDrawerTarget, type ScheduleDrawerTarget } from '@/lib/admin/opsSchedule/drawerParams'
import type { ScheduleSourceErrors } from '@/lib/admin/opsSchedule/load'
import {
  TIMELINE_SIGNAL_ROW_LABEL,
  TIMELINE_TODAY_LABEL,
  timelineRowNotice,
  type ScheduleTimeline,
  type TimelineBar,
  type TimelineRow,
  type TimelineSignalCell,
} from '@/lib/admin/opsSchedule/timeline'
import type { CalendarDrawerControl } from '@/app/admin/WeeklyCalendar'
import { OPS_ITEM_STATUS_ICONS } from './opsIcons'
import { ITEM_STATUS_TONES, OpsStatusBadge, TONE } from './OpsStatusBadge'

/**
 * 일정표 타임라인 (티켓 20261006_1538 ③-c, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 타임라인).
 *
 * 6주 창을 열 42개로 나눈 CSS 그리드다. 줄은 맨 위 **신호**(그날 가장 높은 수준 칩 → 날짜 서랍)와 **미션·드랍 일정·컬렉션 런칭**이고, 줄 목록은 `role="list"`다.
 * 막대 색은 항목 상태 칩과 같다(`ITEM_STATUS_TONES`: 승인 전 neutral 점선·예약됨 secondary·게재중 primary·종료 muted·실패 destructive 테두리). 막대 안에는 상태 아이콘 + 제목이고,
 * 막대마다 `aria-label`에 종류·기간·상태가 있다. 컬렉션 막대 앞의 점선 칸은 준비 구간(R4 리드일)이고 노출 구간은 실선 막대다.
 * 오늘은 세로선과 「오늘」 글자다. 하루짜리 막대도 한 칸 폭이라 아이콘이 보인다.
 *
 * ## 스크롤
 * 타임라인 상자 **안에서만** 가로로 스크롤된다(`overflow-x-auto`, 키보드로 닿도록 `tabIndex=0`·`aria-label`). 안쪽 폭은 칸 하나 최소 1.5rem(42칸) + 줄 이름 6rem이라 좁은 화면(320px)에서도
 * 페이지가 아니라 상자만 스크롤된다. 상자에 `contain-inline-size`를 줘 안쪽 폭이 바깥 틀(어드민 `main`은 `min-w-0`이 없는 flex 항목이라 안쪽 폭이 최소 폭으로 번진다)의 폭을 밀어내지 못하게 한다.
 * 줄 이름은 스크롤해도 왼쪽에 붙어 있다(`sticky`).
 *
 * ## 서랍
 * 운영 항목 막대는 항목 서랍을 여는 버튼이다(`WeeklyCalendar`와 같은 `drawer` 제어: 선택 표시·1.2초 잔상·포커스 복귀 `data-drawer-trigger`). 운영 항목과 합치지 않은 실제 자원 막대는
 * 항목 서랍이 없어 각자의 관리 화면으로 가는 링크다. 이동 기간(‹ 4주·오늘·4주 ›)은 도구줄이 맡는다.
 *
 * `style`은 숫자로 계산한 격자 위치(`gridColumn`·`gridRow`)와 오늘 선의 `left` 비율뿐이다(`__tests__/no-html.test.ts`가 지킨다). 제출 문자열(제목)은 React 텍스트 노드로만 그린다.
 */

/** 안쪽 폭: 줄 이름 6rem + 열 42개 × 1.5rem. 열 개수는 아래 `TRACK`의 `repeat(42, …)`와 `TIMELINE_WINDOW_DAYS`(42)가 같아야 한다. */
const INNER_MIN_WIDTH = 'min-w-[69rem]'
const ROW_GRID = 'grid grid-cols-[6rem_minmax(0,1fr)]'
const TRACK = 'relative grid grid-cols-[repeat(42,minmax(0,1fr))] items-center gap-y-1 py-1.5'
const LABEL_CELL = 'sticky left-0 z-10 border-r border-border bg-white px-2 py-2 text-xs font-semibold text-muted-foreground'

/** 격자 위치: 시작 열부터 끝 열까지(끝 열 포함)와 가로줄(1부터). 이 파일이 `style`로 쓰는 값은 이 숫자 위치와 오늘 선의 `left` 비율뿐이다. */
function placement(startCol: number, endCol: number, row = 1, rowSpan = 1): CSSProperties {
  return { gridColumn: `${startCol} / ${endCol + 1}`, gridRow: `${row} / span ${rowSpan}` }
}

/** 한 줄 안의 주 경계선(첫 주 제외). 줄마다 같은 세로 눈금이 이어져 보이게 한다. */
function WeekRules({ ticks, laneCount }: { ticks: ScheduleTimeline['ticks']; laneCount: number }) {
  return (
    <>
      {ticks.slice(1).map((tick) => (
        <span
          key={tick.col}
          aria-hidden="true"
          className="self-stretch border-l border-border/60"
          style={placement(tick.col, tick.col + 6, 1, laneCount)}
        />
      ))}
    </>
  )
}

function SignalButton({ cell, drawer }: { cell: TimelineSignalCell; drawer: CalendarDrawerControl }) {
  const target: ScheduleDrawerTarget = { kind: 'day', date: cell.date }
  const selected = isSameDrawerTarget(drawer.selected, target)
  return (
    <button
      type="button"
      data-drawer-trigger={drawerTriggerValue(target)}
      aria-current={selected ? 'true' : undefined}
      aria-label={cell.ariaLabel}
      onClick={(event) => drawer.onOpen(target, event.currentTarget)}
      style={placement(cell.col, cell.col)}
      className={cn(
        'z-[1] mx-px flex h-7 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'bg-muted ring-1 ring-foreground'
      )}
    >
      <OpsStatusBadge type="signal" level={cell.level} iconOnly />
    </button>
  )
}

/** 막대의 안쪽: 상태 아이콘 + 제목(시험이면 시험 아이콘). 글자는 `aria-label`이 읽는다. */
function BarContent({ bar }: { bar: TimelineBar }) {
  const StatusIcon = OPS_ITEM_STATUS_ICONS[bar.status]
  return (
    <>
      <StatusIcon className="size-3.5 shrink-0" aria-hidden="true" />
      {bar.isSample && <OpsStatusBadge type="sample" iconOnly />}
      <span className="min-w-0 truncate">{bar.title}</span>
    </>
  )
}

/** 막대 한 개(+ 컬렉션이면 앞의 준비 구간 점선 칸). 운영 항목은 서랍 버튼, 실제 자원은 관리 화면 링크다. */
function BarView({ bar, drawer }: { bar: TimelineBar; drawer: CalendarDrawerControl }) {
  const target: ScheduleDrawerTarget | null = bar.drawerKey !== null ? { kind: 'item', key: bar.drawerKey } : null
  const selected = target !== null && isSameDrawerTarget(drawer.selected, target)
  const flashing = bar.drawerKey !== null && (drawer.flashingKeys?.has(bar.drawerKey) ?? false)
  const className = cn(
    'z-[1] mx-px flex h-7 min-w-0 items-center gap-1 border px-1.5 text-left text-xs hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    TONE[ITEM_STATUS_TONES[bar.status]],
    bar.dashed && 'border-dashed',
    bar.clippedStart ? 'rounded-l-none border-l-0' : 'rounded-l-md',
    bar.clippedEnd ? 'rounded-r-none border-r-0' : 'rounded-r-md',
    bar.dim && 'opacity-40',
    selected && 'ring-2 ring-foreground',
    flashing && !selected && 'ring-2 ring-border'
  )
  const style = placement(bar.startCol, bar.endCol, bar.lane + 1)
  return (
    <>
      {bar.prep && (
        <span
          aria-hidden="true"
          className="mx-px h-7 rounded-l-md border border-dashed border-muted-foreground/60 bg-muted"
          style={placement(bar.prep.startCol, bar.prep.endCol, bar.lane + 1)}
        />
      )}
      {target ? (
        <button
          type="button"
          data-drawer-trigger={drawerTriggerValue(target)}
          aria-current={selected ? 'true' : undefined}
          aria-label={bar.ariaLabel}
          onClick={(event) => drawer.onOpen(target, event.currentTarget)}
          className={className}
          style={style}
        >
          <BarContent bar={bar} />
        </button>
      ) : (
        <Link href={bar.href ?? '#'} aria-label={bar.ariaLabel} className={className} style={style}>
          <BarContent bar={bar} />
        </Link>
      )}
    </>
  )
}

function RowShell({ label, ticks, laneCount, children }: { label: string; ticks: ScheduleTimeline['ticks']; laneCount: number; children: ReactNode }) {
  return (
    <li className={cn(ROW_GRID, 'border-t border-border')}>
      <div className={LABEL_CELL}>{label}</div>
      <div className={TRACK}>
        <WeekRules ticks={ticks} laneCount={laneCount} />
        {children}
      </div>
    </li>
  )
}

function Notice({ children }: { children: string }) {
  return <p className="col-span-full px-2 text-xs text-muted-foreground">{children}</p>
}

function BarRow({ row, timeline, drawer, sourceErrors }: { row: TimelineRow; timeline: ScheduleTimeline; drawer: CalendarDrawerControl; sourceErrors: ScheduleSourceErrors }) {
  const notice = timelineRowNotice(row, sourceErrors)
  return (
    <RowShell label={row.label} ticks={timeline.ticks} laneCount={row.laneCount}>
      {notice ? <Notice>{notice}</Notice> : row.bars.map((bar) => <BarView key={bar.id} bar={bar} drawer={drawer} />)}
    </RowShell>
  )
}

export function OpsScheduleTimeline({
  timeline,
  drawer,
  sourceErrors,
}: {
  timeline: ScheduleTimeline
  drawer: CalendarDrawerControl
  sourceErrors: ScheduleSourceErrors
}) {
  const todayLeft = timeline.todayCol === null ? null : ((timeline.todayCol - 0.5) / timeline.columnCount) * 100
  return (
    <section aria-label="타임라인" className="mb-10 min-w-0">
      <div
        tabIndex={0}
        role="region"
        aria-label="타임라인, 가로로 밀어서 볼 수 있어요"
        className="overflow-x-auto rounded-xl border border-border bg-white contain-inline-size focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className={cn('relative', INNER_MIN_WIDTH)}>
          <div className={ROW_GRID}>
            <div className={cn(LABEL_CELL, 'py-1')} aria-hidden="true" />
            <div className="grid h-7 grid-cols-[repeat(42,minmax(0,1fr))] items-end" aria-hidden="true">
              {timeline.ticks.map((tick, index) => (
                <span
                  key={tick.col}
                  className={cn('px-1 pb-1 text-[11px] text-muted-foreground', index > 0 && 'border-l border-border/60')}
                  style={placement(tick.col, tick.col + 6)}
                >
                  {tick.label}
                </span>
              ))}
            </div>
          </div>

          <ul role="list">
            <RowShell label={TIMELINE_SIGNAL_ROW_LABEL} ticks={timeline.ticks} laneCount={1}>
              {timeline.signalNotice ? (
                <Notice>{timeline.signalNotice}</Notice>
              ) : (
                timeline.signalCells.map((cell) => <SignalButton key={cell.date} cell={cell} drawer={drawer} />)
              )}
            </RowShell>
            {timeline.rows.map((row) => (
              <BarRow key={row.key} row={row} timeline={timeline} drawer={drawer} sourceErrors={sourceErrors} />
            ))}
          </ul>

          {todayLeft !== null && (
            // 오늘 세로선: 줄 이름 칸(6rem)을 뺀 칸 영역 위에 얹고 클릭을 막지 않는다. 줄 이름은 sticky(z-10)라 스크롤하면 선이 그 아래로 지나간다.
            <div className="pointer-events-none absolute inset-y-0 left-24 right-0">
              <div className="absolute inset-y-0 w-0" style={{ left: `${todayLeft}%` }}>
                <span aria-hidden="true" className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground" />
                <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1 text-[10px] font-bold text-background">
                  {TIMELINE_TODAY_LABEL}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
