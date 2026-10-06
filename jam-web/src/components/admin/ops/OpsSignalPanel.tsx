'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconCheck, IconChevronDown } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/admin/ui/button'
import { noRaisedSignalsText, signalLevelCounts, zoneSignals } from '@/lib/admin/opsHome/homeView'
import { OPS_SIGNAL_UNCHECKED_TEXT, type OpsSignalOutcome } from '@/lib/admin/opsSignals/catalog'
import { OpsSignalRow } from './OpsSignalRow'
import { OpsStatusBadge } from './OpsStatusBadge'

/**
 * 운영 홈의 신호 패널 (티켓 20261006_1340 ②-b, 채원 판정 「S1 운영 홈」). 일정표 날짜 서랍의 신호 줄은 `OpsSignalRow`를 따로 쓴다.
 *
 * 신호 13종을 **한 구역에만** 둔다(`zoneSignals`): 뜬 신호 · 이상 없는 신호 · 확인 안 함.
 * - 머리 「중단 n · 주의 n · 참고 n」은 「종」 단위다. 뜬 신호는 중단 → 주의 → 참고 순서로 신호마다 접이식 한 칸이고, 중단·주의는 펼쳐 두고 참고는 접어 둔다
 *   (이름·건수는 접어도 보인다). 한 신호는 결과를 3건까지 보이고 나머지는 「N건 더 보기」다. 줄 하나는 `OpsSignalRow`(문장은 텍스트 노드로만)다.
 * - 이상 없는 신호는 이름만 접어 둔다.
 * - 확인 안 함은 접지 않는다: 점선 칩 「아직 확인하지 않아요」, 재료를 못 읽은 것(`load_failed`)은 「확인하지 못했어요」 + [다시 시도](`router.refresh`).
 *   확인하지 않은 신호를 안전한 것으로 오해하지 않게, 뜬 신호가 0이어도 확인 안 함이 있으면 「이상 없어요」라고 쓰지 않는다.
 * 접기는 `<details>`라 키보드·보조 기기가 그대로 다룬다. 붉은색은 중단 칩에만 쓴다.
 */

/** 한 신호가 처음 보이는 결과 수. */
const VISIBLE_RESULTS = 3

const SUMMARY_CLASS =
  'flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @max-[40rem]:min-h-11'

function Chevron() {
  return (
    <IconChevronDown
      className="size-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0 motion-reduce:transition-none"
      aria-hidden="true"
    />
  )
}

function RaisedSignal({ signal, includeSample }: { signal: OpsSignalOutcome; includeSample: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const total = signal.results.length
  const hidden = Math.max(0, total - VISIBLE_RESULTS)
  const shown = expanded ? signal.results : signal.results.slice(0, VISIBLE_RESULTS)
  return (
    <details open={signal.level !== 'info'} className="group rounded-lg border border-border bg-background">
      <summary className={SUMMARY_CLASS}>
        <Chevron />
        <OpsStatusBadge type="signal" level={signal.level} />
        <span className="font-medium">{signal.name}</span>
        <span className="text-muted-foreground">{`· ${total}건`}</span>
      </summary>
      <div className="space-y-2 border-t border-border px-3 py-3">
        <ul className="space-y-2">
          {shown.map((result, index) => (
            <li key={index}>
              <OpsSignalRow name={signal.name} level={signal.level} result={result} includeSample={includeSample} />
            </li>
          ))}
        </ul>
        {hidden > 0 && !expanded && (
          <Button type="button" variant="outline" size="sm" className="@max-[40rem]:h-11" onClick={() => setExpanded(true)}>
            {`${hidden}건 더 보기`}
          </Button>
        )}
      </div>
    </details>
  )
}

interface OpsSignalPanelProps {
  /** 신호 13종(`computeOpsSignals`의 `signals`, 카탈로그 순서). */
  signals: readonly OpsSignalOutcome[]
  /** 시험 묶음을 포함해서 보는 중이면 신호 줄 링크에 `sample=1`을 이어 붙인다. */
  includeSample?: boolean
  className?: string
}

export function OpsSignalPanel({ signals, includeSample = false, className }: OpsSignalPanelProps) {
  const router = useRouter()
  const zones = zoneSignals(signals)
  const counts = signalLevelCounts(signals)
  const hasLoadFailed = zones.unchecked.some((signal) => signal.uncheckedReason === 'load_failed')
  return (
    <section aria-labelledby="ops-signal-panel-heading" className={cn('@container space-y-3', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="ops-signal-panel-heading" className="text-lg font-semibold">
          신호
        </h2>
        <p className="text-sm font-medium">{`중단 ${counts.stop} · 주의 ${counts.warn} · 참고 ${counts.info}`}</p>
      </div>

      {zones.raised.length === 0 ? (
        <p className="text-sm text-muted-foreground">{noRaisedSignalsText(zones.unchecked.length)}</p>
      ) : (
        <div className="space-y-2">
          {zones.raised.map((signal) => (
            <RaisedSignal key={signal.key} signal={signal} includeSample={includeSample} />
          ))}
        </div>
      )}

      {zones.clear.length > 0 && (
        <details className="group rounded-lg border border-border bg-background">
          <summary className={SUMMARY_CLASS}>
            <Chevron />
            <IconCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium">{`이상 없는 신호 ${zones.clear.length}종`}</span>
          </summary>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border px-3 py-3 text-sm text-muted-foreground">
            {zones.clear.map((signal) => (
              <li key={signal.key}>{signal.name}</li>
            ))}
          </ul>
        </details>
      )}

      {zones.unchecked.length > 0 && (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{`확인하지 않은 신호 ${zones.unchecked.length}종`}</p>
            {hasLoadFailed && (
              <Button type="button" variant="outline" size="sm" className="@max-[40rem]:h-11" onClick={() => router.refresh()}>
                다시 시도
              </Button>
            )}
          </div>
          <ul className="space-y-1.5">
            {zones.unchecked.map((signal) => {
              const reason = signal.uncheckedReason ?? 'not_built'
              return (
                <li key={signal.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <OpsStatusBadge type="signal-unchecked" reason={reason} />
                  <span className="font-medium">{signal.name}</span>
                  <span aria-hidden="true" className="text-muted-foreground">
                    ·
                  </span>
                  <span className="text-muted-foreground">{OPS_SIGNAL_UNCHECKED_TEXT[reason].detail}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
