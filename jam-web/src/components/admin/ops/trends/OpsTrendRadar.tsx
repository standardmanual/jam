import Link from 'next/link'
import { IconTrendingUp } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/admin/ui/card'
import type { OpsTrendOutcome } from '@/lib/admin/opsInbox/constants'
import { formatKstDayTime } from '@/lib/admin/opsInbox/labels'
import { withSampleParam } from '@/lib/admin/opsHome/links'
import type { RadarEntry, RadarSummary } from '@/lib/admin/opsTrends/radar'
import { TONE, type Tone } from '../OpsStatusBadge'
import { OpsTrendSparkline } from './OpsTrendSparkline'

/**
 * 읽은 트렌드 (티켓 20261026_2033 2회차, 어드민 상황판 PRD §6.4). 트렌드 레이더 아래쪽 구역이다(서버 컴포넌트).
 *
 * 요약 줄(「반영 N · 보류 N · 자동 제외 N」, 점+글자) → 트렌드 카드 목록(받은 시각 내림차순).
 * 카드: 이름 · 한 줄 요약 · 출처 칩(「출처 N · 이름」) · 추이 막대 · 결과 칩(자동 제외는 범주 한 줄) · 받은 기획 제목과 시각 ·
 * 반영이면 「연결 항목 N건」 링크(그 트렌드에서 나온 항목만 걸러 기획 상세를 연다).
 */

export const TREND_RADAR_EMPTY = '최근 14일에 읽은 트렌드가 없어요'

export const OUTCOME_VIEW: Record<OpsTrendOutcome, { label: string; tone: Tone; dot: string }> = {
  used: { label: '반영', tone: 'neutral', dot: 'bg-primary' },
  held: { label: '보류', tone: 'warning', dot: 'bg-amber-500' },
  excluded: { label: '자동 제외', tone: 'muted', dot: 'bg-muted-foreground' },
}

const OUTCOME_ORDER: OpsTrendOutcome[] = ['used', 'held', 'excluded']
const CHIP_CLASS =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium'

export function trendLinkedItemsHref(entry: Pick<RadarEntry, 'bundleId' | 'trend'>, includeSample: boolean): string {
  return withSampleParam(`/admin/ops-inbox/${entry.bundleId}?trend=${entry.trend.index}`, includeSample)
}

function OutcomeChip({ outcome }: { outcome: OpsTrendOutcome }) {
  const view = OUTCOME_VIEW[outcome]
  return (
    <span className={cn(CHIP_CLASS, TONE[view.tone])}>
      <span aria-hidden="true" className={cn('size-2 rounded-full', view.dot)} />
      {view.label}
    </span>
  )
}

function SummaryLine({ summary }: { summary: RadarSummary }) {
  return (
    <p aria-label="읽은 트렌드 결과 요약" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {OUTCOME_ORDER.map((outcome) => {
        const view = OUTCOME_VIEW[outcome]
        return (
          <span key={outcome} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span aria-hidden="true" className={cn('size-2 rounded-full', view.dot)} />
            {view.label} <span className="tabular-nums font-medium">{summary[outcome]}</span>
          </span>
        )
      })}
    </p>
  )
}

export function OpsTrendRadar({
  entries,
  summary,
  sourceNames,
  includeSample,
}: {
  entries: readonly RadarEntry[]
  summary: RadarSummary
  /** 출처 번호 → 이름. 출처 목록을 읽지 못했거나 없는 번호면 「출처 N」만 보인다. */
  sourceNames: ReadonlyMap<number, string>
  includeSample: boolean
}) {
  if (entries.length === 0) {
    return (
      <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <IconTrendingUp className="size-5 shrink-0" aria-hidden="true" />
        <span className="break-keep wrap-break-word text-pretty">{TREND_RADAR_EMPTY}</span>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <SummaryLine summary={summary} />
      <ul className="space-y-3">
        {entries.map((entry) => {
          const { trend } = entry
          const received = formatKstDayTime(entry.receivedAt)
          return (
            <li key={`${entry.bundleId}-${trend.index}`}>
              <Card className="space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold break-keep wrap-break-word text-balance">{trend.label}</h3>
                      <OutcomeChip outcome={trend.outcome} />
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground" title={trend.summary}>
                      {trend.summary}
                    </p>
                  </div>
                  {trend.series && <OpsTrendSparkline series={trend.series} label={trend.label} />}
                </div>

                {trend.outcome === 'excluded' && trend.outcomeReason && (
                  <p className="text-sm break-keep wrap-break-word">제외 범주: {trend.outcomeReason}</p>
                )}

                {trend.sourceNos.length > 0 && (
                  <ul aria-label="출처" className="flex flex-wrap gap-1.5">
                    {trend.sourceNos.map((no) => {
                      const name = sourceNames.get(no)
                      return (
                        <li key={no} className={cn(CHIP_CLASS, TONE.secondary, 'whitespace-normal break-keep wrap-break-word')}>
                          {name ? `출처 ${no} · ${name}` : `출처 ${no}`}
                        </li>
                      )
                    })}
                  </ul>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="break-keep wrap-break-word">
                    {entry.bundleTitle}
                    {received ? ` · ${received}` : ''}
                  </span>
                  {trend.outcome === 'used' &&
                    (entry.linkedItemCount > 0 ? (
                      <Link
                        href={trendLinkedItemsHref(entry, includeSample)}
                        className="whitespace-nowrap text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline"
                      >
                        연결 항목 {entry.linkedItemCount}건
                      </Link>
                    ) : (
                      <span className="whitespace-nowrap text-sm">연결 항목 0건</span>
                    ))}
                </div>
              </Card>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
