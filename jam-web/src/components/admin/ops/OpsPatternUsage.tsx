import Link from 'next/link'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { opsTargetHref } from '@/lib/admin/opsHome/links'
import {
  USAGE_EMPTY_TEXT,
  USAGE_FAILED_TEXT,
  pageOfUsage,
  usagePageCount,
  usageSummaryText,
  type UsageLine,
} from '@/lib/admin/opsPatterns/detailView'
import type { OpsPatternUsageCount } from '@/lib/admin/opsPatterns/draw'
import { patternDetailHref } from '@/lib/admin/opsPatterns/listView'
import { OpsSectionNotice } from './OpsSectionNotice'
import { OpsStatusBadge } from './OpsStatusBadge'

/**
 * 패턴 상세의 「사용 이력」 구역 내용 (티켓 20261008_1435, 채원 판정 「⑨ 상세」 사용 이력). 훅이 없는 서버 컴포넌트다(실패 안내 `OpsSectionNotice`만 클라이언트).
 *
 * 요약 줄(최근 4주 N회 · 마지막 사용)은 목록·조합 뽑기와 같은 세기 함수의 값이고, 이력 줄은 같은 판정으로 고른 것이다(`detailView.ts`).
 * 줄 = 사용 시각(KST) · 종류 · 이름 · 항목 상태 칩이고, 줄 어디를 눌러도 그 항목의 받은 기획함 상세로 간다. 10건/쪽, 40rem 미만에서는 카드 줄이다.
 * 읽기에 실패하면(`lines`가 `null`) 요약 숫자는 「–」이고 구역에 안내를 띄운다 — 실패를 0건으로 보이지 않는다. 항목 이름은 제출 문자열이라 텍스트 노드로만 그린다.
 */

const LINK_CLASS =
  'min-w-0 break-words font-medium underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring'
const PAGE_LINK_CLASS =
  'inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @max-[40rem]:min-h-11'

function LineName({ line }: { line: UsageLine }) {
  const href = opsTargetHref({ bundleId: line.bundleId, itemId: line.itemId })
  return href ? (
    <Link href={href} className={LINK_CLASS}>
      {line.name}
    </Link>
  ) : (
    <span className="min-w-0 break-words font-medium">{line.name}</span>
  )
}

function UsageTable({ lines }: { lines: readonly UsageLine[] }) {
  return (
    <table className="w-full border-collapse text-sm @max-[40rem]:hidden">
      <caption className="sr-only">패턴 사용 이력</caption>
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th scope="col" className="px-3 py-2 font-medium">사용 시각</th>
          <th scope="col" className="px-3 py-2 font-medium">종류</th>
          <th scope="col" className="px-3 py-2 font-medium">이름</th>
          <th scope="col" className="px-3 py-2 font-medium">상태</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {lines.map((line) => (
          <tr key={line.itemId} className="relative align-top hover:bg-muted/50">
            <td className="px-3 py-2.5 tabular-nums">{line.usedAtText}</td>
            <td className="px-3 py-2.5">{line.kindText}</td>
            <td className="px-3 py-2.5">
              <LineName line={line} />
            </td>
            <td className="px-3 py-2.5">
              <OpsStatusBadge type="item" status={line.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function UsageCards({ lines }: { lines: readonly UsageLine[] }) {
  return (
    <ul className="hidden divide-y divide-border @max-[40rem]:block">
      {lines.map((line) => (
        <li key={line.itemId} className="relative space-y-1.5 px-3 py-3 hover:bg-muted/50">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm tabular-nums">{line.usedAtText}</span>
            <OpsStatusBadge type="item" status={line.status} />
          </div>
          <p>
            <LineName line={line} />
          </p>
          <p className="text-sm text-muted-foreground">{line.kindText}</p>
        </li>
      ))}
    </ul>
  )
}

function PageNav({ patternNo, page, pageCount }: { patternNo: string; page: number; pageCount: number }) {
  if (pageCount <= 1) return null
  return (
    <nav aria-label="사용 이력 쪽 이동" className="flex flex-wrap items-center justify-between gap-2">
      {page > 1 ? (
        <Link href={patternDetailHref(patternNo, { usagePage: page - 1 })} className={PAGE_LINK_CLASS}>
          <IconChevronLeft className="size-3.5" aria-hidden="true" />
          이전
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      <span className="text-sm tabular-nums text-muted-foreground">
        {page} / {pageCount}쪽
      </span>
      {page < pageCount ? (
        <Link href={patternDetailHref(patternNo, { usagePage: page + 1 })} className={PAGE_LINK_CLASS}>
          다음
          <IconChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  )
}

interface OpsPatternUsageProps {
  patternNo: string
  /** `countOpsPatternUsage`의 값. 사용 기록을 못 읽었으면 `null`. */
  summary: OpsPatternUsageCount | null
  /** `selectPatternUsage`의 전체 줄(최신순). 사용 기록을 못 읽었으면 `null`. */
  lines: readonly UsageLine[] | null
  /** 보고 있는 쪽(1부터, `parseUsagePage`로 이미 걸러진 값). */
  page: number
  className?: string
}

export function OpsPatternUsage({ patternNo, summary, lines, page, className }: OpsPatternUsageProps) {
  return (
    <div className={cn('@container space-y-3', className)}>
      <p className="text-sm font-medium tabular-nums">{usageSummaryText(summary)}</p>
      {lines === null ? (
        <OpsSectionNotice icon="patterns" title={USAGE_FAILED_TEXT} />
      ) : lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">{USAGE_EMPTY_TEXT}</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <UsageTable lines={pageOfUsage(lines, page)} />
            <UsageCards lines={pageOfUsage(lines, page)} />
          </div>
          <PageNav patternNo={patternNo} page={page} pageCount={usagePageCount(lines.length)} />
        </>
      )}
    </div>
  )
}
