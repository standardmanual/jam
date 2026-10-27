import Link from 'next/link'
import { IconArrowRight } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { inboxListHref, scheduleHomeHref, withSampleParam } from '@/lib/admin/opsHome/links'
import { SCREEN_STATE_LABELS, type ScreenState } from '@/lib/admin/opsBoard/screenState'
import { FLOW_COLUMNS, type FlowColumn, type FlowColumnState, type WeekFlowRow } from '@/lib/admin/opsBoard/weekFlow'
import { SCREEN_STATE_STYLES } from './screenStateStyle'

/**
 * 운영 상황판의 「주간 흐름」 지도 (티켓 20261026_2023 2회차, 어드민 상황판 PRD §6.2). 훅이 없는 서버 컴포넌트다.
 *
 * `computeWeekFlow`의 행(최근 5주)을 7열 격자로 그린다(왼쪽 행 머리 120px). 열 머리는 단계 이름과 담당이고 「내 결정」 열만 호박색 바탕이다.
 * 셀은 선로(가로선)를 이어 그리고, `done` 열은 작은 점 + 결과 글, `current` 열은 정류장(건수 + 화면 상태 글자 + 작은 글), `upcoming` 열은 빈 점이다.
 * 예약 열에 실패 항목이 있으면 「문제 N」 정류장을 하나 더 쌓는다. 정류장은 링크다: 결정 필요·문제는 그 주 결정 패널, 나머지는 일정표.
 * 좁으면 지도 영역만 가로로 스크롤한다(최소 폭 980px). 묶음 제목은 에이전트가 보낸 문자열이라 React 텍스트 노드로만 그린다.
 */

const TEXT_CLASS = 'break-keep wrap-break-word'
const GRID_CLASS = 'grid grid-cols-[120px_repeat(7,minmax(0,1fr))]'
const STATION_CLASS =
  'flex min-w-0 flex-col gap-0.5 rounded-md border px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export const FLOW_EMPTY_TEXT = '최근 5주에 올라온 기획이 없어요'
export const UNTITLED_ROW_TEXT = '제목 없음'
const OWNER_DISPLAY: Record<string, string> = { 나: '나(운영자)' }

/** 「44주차」. */
export function weekNumberLabel(week: string): string {
  const number = Number(week.slice(-2))
  return Number.isNaN(number) ? week : `${number}주차`
}

function monthDay(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
}

/** 「10/26~11/1」. */
export function rowRangeLabel(row: Pick<WeekFlowRow, 'weekStart' | 'weekEnd'>): string {
  return `${monthDay(row.weekStart)}~${monthDay(row.weekEnd)}`
}

interface StationProps {
  state: ScreenState
  /** 첫 줄: 「3 · 결정 필요」처럼 건수와 상태 글자. */
  headline: string
  note: string | null
  href: string
}

function Station({ state, headline, note, href }: StationProps) {
  const style = SCREEN_STATE_STYLES[state]
  return (
    <Link href={href} className={cn(STATION_CLASS, style.box, style.text, 'hover:brightness-95')}>
      <span className="flex items-center gap-1 text-xs font-medium">
        <style.Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className={cn('truncate', TEXT_CLASS)}>{headline}</span>
        <span
          aria-hidden="true"
          className={cn('ml-auto size-2 shrink-0 rounded-full', style.dot, style.pulse && 'motion-safe:animate-pulse')}
        />
      </span>
      {note && <span className={cn('text-[11px] leading-tight', TEXT_CLASS)}>{note}</span>}
    </Link>
  )
}

function stationHref(state: ScreenState, rowHref: string, scheduleHref: string): string {
  return state === 'decide' || state === 'problem' ? rowHref : scheduleHref
}

function CurrentCell({ column, rowHref, scheduleHref }: { column: FlowColumnState; rowHref: string; scheduleHref: string }) {
  const stations: StationProps[] = []
  const state = column.screenState
  // 건수가 없는 문제 정류장(예약 열에 실패 항목만 있는 경우)은 아래 「문제 N」 하나로 갈음한다.
  const problemOnly = state === 'problem' && column.count === null && column.problemCount > 0
  if (state && !problemOnly) {
    const label = SCREEN_STATE_LABELS[state]
    stations.push({
      state,
      headline: column.count !== null ? `${column.count} · ${label}` : label,
      note: column.note,
      href: stationHref(state, rowHref, scheduleHref),
    })
  }
  if (column.problemCount > 0) {
    stations.push({ state: 'problem', headline: `문제 ${column.problemCount}`, note: null, href: rowHref })
  }
  return (
    <div className="relative z-10 flex w-full flex-col gap-1">
      {stations.map((station, index) => (
        <Station key={`${station.state}-${index}`} {...station} />
      ))}
    </div>
  )
}

function DoneCell({ column }: { column: FlowColumnState }) {
  return (
    <div className="relative z-10 flex items-center gap-1.5 bg-background pr-1">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-muted-foreground" />
      {column.note ? (
        <span className={cn('text-xs text-muted-foreground', TEXT_CLASS)}>{column.note}</span>
      ) : (
        <span className="sr-only">지나갔어요</span>
      )}
    </div>
  )
}

function UpcomingCell() {
  return (
    <div className="relative z-10 bg-background px-1">
      <span aria-hidden="true" className="block size-2 rounded-full border border-muted-foreground bg-background" />
      <span className="sr-only">아직이에요</span>
    </div>
  )
}

function FlowRow({
  row,
  rowHref,
  scheduleHref,
}: {
  row: WeekFlowRow
  rowHref: string
  scheduleHref: string
}) {
  return (
    <div role="row" className={cn(GRID_CLASS, 'border-t border-border')}>
      <div role="rowheader" className="flex min-w-0 flex-col justify-center gap-0.5 py-2 pr-2">
        <span className="text-sm font-semibold tabular-nums">{weekNumberLabel(row.week)}</span>
        <span className={cn('truncate text-xs text-foreground', TEXT_CLASS)} title={row.title ?? undefined}>
          {row.title ?? UNTITLED_ROW_TEXT}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{rowRangeLabel(row)}</span>
      </div>
      {FLOW_COLUMNS.map((def) => {
        const column = row.columns.find((col) => col.key === def.key)
        return (
          <div
            key={def.key}
            role="cell"
            className={cn('relative flex min-h-16 items-center px-1.5 py-2', def.emphasis && 'bg-amber-50')}
          >
            {/* 선로: 열을 가로질러 이어진다. */}
            <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-border" />
            {column?.phase === 'current' ? (
              <CurrentCell column={column} rowHref={rowHref} scheduleHref={scheduleHref} />
            ) : column?.phase === 'done' ? (
              <DoneCell column={column} />
            ) : (
              <UpcomingCell />
            )}
          </div>
        )
      })}
    </div>
  )
}

function ColumnHeader({ column }: { column: FlowColumn }) {
  return (
    <div
      role="columnheader"
      className={cn('flex flex-col gap-0.5 px-1.5 py-2', column.emphasis && 'bg-amber-50')}
    >
      <span className={cn('text-xs font-semibold whitespace-nowrap', column.emphasis && 'text-amber-900')}>{column.label}</span>
      <span className="text-[11px] whitespace-nowrap text-muted-foreground">{OWNER_DISPLAY[column.owner] ?? column.owner}</span>
    </div>
  )
}

interface OpsWeekFlowMapProps {
  /** `computeWeekFlow`의 행(이번 주부터 거꾸로 5주). */
  rows: readonly WeekFlowRow[]
  /** 주 월요일(KST `YYYY-MM-DD`) → 그 주 결정 패널 경로(`flowRowHrefs`). 없는 주는 받은 기획함 목록이다. */
  rowHrefs: Readonly<Record<string, string>>
  includeSample?: boolean
  className?: string
}

export function OpsWeekFlowMap({ rows, rowHrefs, includeSample = false, className }: OpsWeekFlowMapProps) {
  const empty = rows.every((row) => row.columns.every((column) => column.phase === 'upcoming'))
  const scheduleHref = scheduleHomeHref({ includeSample })
  const inboxHref = inboxListHref({ includeSample })
  return (
    <section aria-labelledby="ops-week-flow-heading" className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="ops-week-flow-heading" className={cn('text-lg font-semibold', TEXT_CLASS)}>
          주간 흐름
        </h2>
        <Link
          href={scheduleHref}
          className="inline-flex min-h-6 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          일정표 보기
          <IconArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      {empty ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-background p-5">
          <p className={cn('font-medium', TEXT_CLASS)}>{FLOW_EMPTY_TEXT}</p>
          <Link
            href={inboxHref}
            className="inline-flex min-h-6 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            받은 기획함 보기
            <IconArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-label="주간 흐름 지도"
          className="overflow-x-auto rounded-lg border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div role="table" aria-label="최근 5주 주간 흐름" className="min-w-[980px] px-3 py-1">
            <div role="row" className={GRID_CLASS}>
              <div role="columnheader" className="px-0 py-2 text-xs font-semibold text-muted-foreground">
                주차
              </div>
              {FLOW_COLUMNS.map((column) => (
                <ColumnHeader key={column.key} column={column} />
              ))}
            </div>
            {rows.map((row) => (
              <FlowRow
                key={row.weekStart}
                row={row}
                rowHref={withSampleParam(rowHrefs[row.weekStart] ?? '/admin/ops-inbox', includeSample)}
                scheduleHref={scheduleHref}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
