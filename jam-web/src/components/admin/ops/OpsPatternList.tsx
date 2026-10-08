import Link from 'next/link'
import { cn } from '@/lib/utils'
import { formatKstDay } from '@/lib/admin/opsInbox/labels'
import {
  PATTERN_STATUS_FILTERS,
  PATTERN_STATUS_FILTER_LABELS,
  countByStatus,
  filterPatternRows,
  patternListHref,
  type PatternListRow,
  type PatternStatusFilter,
} from '@/lib/admin/opsPatterns/listView'
import { OpsStatusBadge } from './OpsStatusBadge'

/**
 * 패턴 사전의 목록 (티켓 20261008_1400, 채원 판정 「⑨ 목록」). 훅이 없는 서버 컴포넌트다.
 *
 * 상태 필터 탭(링크, 주소 `status`) → 표(번호·이름·상태·최근 4주·마지막 사용·샘플·취향 신호). 40rem 미만에서는 카드 목록이다. 번호 숫자 순으로 고정이고 정렬·검색은 없다.
 * **행에 링크를 걸지 않는다** — 상세 경로는 ⑨b가 만들고 그때 행 링크를 단다(링크가 404로 남지 않게). 쓰기 버튼도 없다(⑩a·⑩b).
 *
 * 못 읽은 재료는 0으로 바꾸지 않는다. 사용 기록을 못 읽으면(`usageFailed`) 숫자 칸이 「–」이고 표 위에 알린다. 샘플이 깨졌으면 「모름」, 취향 신호를 못 읽었으면 「–」다.
 * 이름·쉬는 이유는 사람이 쓴 글이라 텍스트 노드로만 그린다.
 */

export const PATTERN_EMPTY_TEXT = '아직 패턴이 없어요'
export const PATTERN_FILTER_EMPTY_TEXT = '이 상태의 패턴이 없어요'
export const PATTERN_FILTER_CLEAR_LABEL = '전체 보기'
export const PATTERN_USAGE_FAILED_TEXT = '사용 기록을 읽지 못했어요'
export const PATTERN_NEVER_USED_TEXT = '쓴 적 없어요'
export const PATTERN_USAGE_NOTE = '최근 4주 사용은 시험 묶음을 세지 않아요. 조합 뽑기와 같은 기준이에요'
export const PATTERN_UNKNOWN_TEXT = '모름'
export const PATTERN_MISSING_TEXT = '–'

const NUMBER_CLASS = 'text-right tabular-nums'

export function usesText(row: Pick<PatternListRow, 'uses'>): string {
  return row.uses === null ? PATTERN_MISSING_TEXT : `${row.uses}회`
}

/** 마지막 사용: 사용 기록을 못 읽었으면 「–」, 한 번도 안 썼으면 「쓴 적 없어요」, 아니면 KST 날짜(예: 10/1(수))다. */
export function lastUsedText(row: Pick<PatternListRow, 'uses' | 'lastUsedAt'>): string {
  if (row.uses === null) return PATTERN_MISSING_TEXT
  if (row.lastUsedAt === null) return PATTERN_NEVER_USED_TEXT
  return formatKstDay(row.lastUsedAt) ?? PATTERN_MISSING_TEXT
}

export function sampleCountText(row: Pick<PatternListRow, 'sampleCount'>): string {
  return row.sampleCount === null ? PATTERN_UNKNOWN_TEXT : String(row.sampleCount)
}

/** 취향 신호: 못 읽었으면 「–」, 있는 것만 「추정 3 · 확정 1」로 잇고, 하나도 없으면 「없어요」다. */
export function tasteSignalText(row: Pick<PatternListRow, 'estimateCount' | 'confirmedCount'>): string {
  if (row.estimateCount === null || row.confirmedCount === null) return PATTERN_MISSING_TEXT
  const parts: string[] = []
  if (row.estimateCount > 0) parts.push(`추정 ${row.estimateCount}`)
  if (row.confirmedCount > 0) parts.push(`확정 ${row.confirmedCount}`)
  return parts.length > 0 ? parts.join(' · ') : '없어요'
}

function pauseReasonText(row: Pick<PatternListRow, 'status' | 'pauseReason'>): string | null {
  if (row.status !== 'paused') return null
  const reason = row.pauseReason?.trim()
  return `쉬는 이유: ${reason ? reason : '적지 않았어요'}`
}

function StatusFilter({ status, counts }: { status: PatternStatusFilter; counts: Record<PatternStatusFilter, number> }) {
  return (
    <nav aria-label="상태 거르기">
      <ul className="flex flex-wrap gap-1.5">
        {PATTERN_STATUS_FILTERS.map((candidate) => {
          const current = candidate === status
          return (
            <li key={candidate}>
              <Link
                href={patternListHref({ status: candidate })}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-8 items-center rounded-full border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @max-[40rem]:min-h-11',
                  current ? 'border-transparent bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:bg-muted'
                )}
              >
                {PATTERN_STATUS_FILTER_LABELS[candidate]} <span className="ml-1 tabular-nums">{counts[candidate]}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function NameCell({ row }: { row: PatternListRow }) {
  const reason = pauseReasonText(row)
  return (
    <>
      <span className="font-medium break-words">{row.name}</span>
      {reason && <span className="mt-0.5 block text-xs text-muted-foreground break-words">{reason}</span>}
    </>
  )
}

function PatternTable({ rows }: { rows: readonly PatternListRow[] }) {
  return (
    <table className="w-full border-collapse text-sm @max-[40rem]:hidden">
      <caption className="sr-only">패턴 사전 목록</caption>
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th scope="col" className="px-3 py-2 font-medium">번호</th>
          <th scope="col" className="px-3 py-2 font-medium">이름</th>
          <th scope="col" className="px-3 py-2 font-medium">상태</th>
          <th scope="col" className={cn('px-3 py-2 font-medium', NUMBER_CLASS)}>최근 4주</th>
          <th scope="col" className="px-3 py-2 font-medium">마지막 사용</th>
          <th scope="col" className={cn('px-3 py-2 font-medium', NUMBER_CLASS)}>샘플</th>
          <th scope="col" className="px-3 py-2 font-medium">취향 신호</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((row) => (
          <tr key={row.patternNo} className="align-top">
            <th scope="row" className="px-3 py-2.5 text-left font-medium tabular-nums">{row.patternNo}</th>
            <td className="px-3 py-2.5">
              <NameCell row={row} />
            </td>
            <td className="px-3 py-2.5">
              <OpsStatusBadge type="pattern-status" status={row.status} />
            </td>
            <td className={cn('px-3 py-2.5', NUMBER_CLASS)}>{usesText(row)}</td>
            <td className="px-3 py-2.5">{lastUsedText(row)}</td>
            <td className={cn('px-3 py-2.5', NUMBER_CLASS)}>{sampleCountText(row)}</td>
            <td className="px-3 py-2.5">{tasteSignalText(row)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PatternCards({ rows }: { rows: readonly PatternListRow[] }) {
  return (
    <ul className="hidden divide-y divide-border @max-[40rem]:block">
      {rows.map((row) => (
        <li key={row.patternNo} className="space-y-2 px-3 py-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium tabular-nums">{row.patternNo}</span>
            <OpsStatusBadge type="pattern-status" status={row.status} />
          </div>
          <p>
            <NameCell row={row} />
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">최근 4주</dt>
            <dd className="tabular-nums">{usesText(row)}</dd>
            <dt className="text-muted-foreground">마지막 사용</dt>
            <dd>{lastUsedText(row)}</dd>
            <dt className="text-muted-foreground">샘플</dt>
            <dd className="tabular-nums">{sampleCountText(row)}</dd>
            <dt className="text-muted-foreground">취향 신호</dt>
            <dd>{tasteSignalText(row)}</dd>
          </dl>
        </li>
      ))}
    </ul>
  )
}

interface OpsPatternListProps {
  /** 사전의 모든 패턴(보관 포함, 번호의 숫자 순서). 거르는 것은 여기서 한다. */
  rows: readonly PatternListRow[]
  status: PatternStatusFilter
  /** 사용 기록을 못 읽었는지. 참이면 숫자 칸은 「–」이고 표 위에 알린다. */
  usageFailed?: boolean
  className?: string
}

export function OpsPatternList({ rows, status, usageFailed = false, className }: OpsPatternListProps) {
  const counts = countByStatus(rows)
  const visible = filterPatternRows(rows, status)
  return (
    <section aria-label="패턴 목록" className={cn('@container space-y-3', className)}>
      <StatusFilter status={status} counts={counts} />
      {usageFailed && <p className="text-sm text-muted-foreground">{PATTERN_USAGE_FAILED_TEXT}</p>}
      {rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted-foreground">{PATTERN_EMPTY_TEXT}</p>
      ) : visible.length === 0 ? (
        <div className="space-y-2 rounded-lg border border-border bg-background p-5 text-sm">
          <p className="text-muted-foreground">{PATTERN_FILTER_EMPTY_TEXT}</p>
          {status !== 'all' && (
            <Link href={patternListHref()} className="inline-flex min-h-6 items-center font-medium underline underline-offset-4 @max-[40rem]:min-h-11">
              {PATTERN_FILTER_CLEAR_LABEL}
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-background">
          <PatternTable rows={visible} />
          <PatternCards rows={visible} />
        </div>
      )}
      {visible.length > 0 && <p className="text-xs text-muted-foreground">{PATTERN_USAGE_NOTE}</p>}
    </section>
  )
}
