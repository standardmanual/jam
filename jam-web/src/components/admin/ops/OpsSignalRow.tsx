import Link from 'next/link'
import { IconArrowRight } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { formatSignalDay, type OpsSignalLevel, type OpsSignalResult } from '@/lib/admin/opsSignals/catalog'
import { opsTargetKind, signalResultHref } from '@/lib/admin/opsHome/links'
import { OpsStatusBadge } from './OpsStatusBadge'

/**
 * 신호 한 줄 (티켓 20261006_1339 ②-a, 채원 판정 「신호 한 줄 `OpsSignalRow`」). 운영 홈의 신호 영역(S1)과 일정표의 날짜 서랍(S4)이 함께 쓴다.
 *
 * `[수준 칩] 신호 이름 · 문장 · 날짜 · [시험] · [이동 링크]`. 수준은 아이콘과 글자로 말하고(색만으로 나누지 않는다), 시험 묶음에서 온
 * 결과에는 「시험」 칩을 단다. **문장은 React 텍스트 노드로만 그린다**(에이전트가 보낸 제목이 문장에 섞여 들어올 수 있다).
 * 이동 링크는 `signalResultHref` 한 곳에서만 만든다: 항목이 있으면 받은 기획함의 그 항목, 묶음만 있으면 기획 상세, 날짜만 있으면 그날,
 * 갈 곳이 없으면 링크를 그리지 않는다. 훅이 없는 서버 컴포넌트다.
 */

interface OpsSignalRowProps {
  /** 신호 이름(`OpsSignalOutcome.name`). */
  name: string
  level: OpsSignalLevel
  result: OpsSignalResult
  /** 시험 묶음을 포함해서 보는 중이면 링크에 `sample=1`을 이어 붙인다. */
  includeSample?: boolean
  className?: string
}

const LINK_LABELS = { inbox: '기획 보기', day: '그날 보기' } as const

export function OpsSignalRow({ name, level, result, includeSample = false, className }: OpsSignalRowProps) {
  const href = signalResultHref(result, { includeSample })
  const kind = opsTargetKind(result)
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-sm', className)}>
      <OpsStatusBadge type="signal" level={level} />
      <span className="font-medium">{name}</span>
      <span aria-hidden="true" className="text-muted-foreground">
        ·
      </span>
      <span className="min-w-0 break-words">{result.message}</span>
      {result.date && (
        <>
          <span aria-hidden="true" className="text-muted-foreground">
            ·
          </span>
          <span className="text-muted-foreground">{formatSignalDay(result.date)}</span>
        </>
      )}
      {result.isSample && <OpsStatusBadge type="sample" />}
      {href && kind && (
        <Link
          href={href}
          className="inline-flex min-h-6 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {LINK_LABELS[kind]}
          <span className="sr-only"> ({name})</span>
          <IconArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
