import Link from 'next/link'
import { IconArrowRight } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import type { OpsRecentDecisionRecord } from '@/lib/admin/opsDecisions/read'
import { decisionLineText } from '@/lib/admin/opsDecisions/line'
import { inboxListHref, opsTargetHref } from '@/lib/admin/opsHome/links'
import { formatKstDayTime, kindLabel } from '@/lib/admin/opsInbox/labels'
import { OpsStatusBadge } from './OpsStatusBadge'

/**
 * 운영 홈의 최근 이력 (티켓 20261006_1340 ②-b, 채원 판정 「S1 운영 홈」 「최근 이력(최신 10건, 줄을 누르면 그 항목의 S3)」). 훅이 없는 서버 컴포넌트다.
 *
 * 한 줄: 결정 문장(받은 기획함 상세의 결정 기록과 같은 `decisionLineText`) · 종류 이름 · 패턴 · 시각(KST) · [시험]. 줄 어디를 눌러도 그 항목의 받은 기획함
 * 상세(`opsTargetHref`, 묶음 단위 결정은 기획 상세)로 간다. 에이전트 이름은 자기 신고 값이라 **텍스트 노드로만** 그린다.
 * 시험 묶음의 줄은 시험 묶음을 포함해서 볼 때만 오고 「시험」 칩이 붙는다(읽기 함수가 거른다). 0건이면 「아직 기록이 없어요」다.
 */

const LINK_CLASS =
  'inline-flex min-h-6 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @max-[40rem]:min-h-11'

function DecisionLine({ record, includeSample }: { record: OpsRecentDecisionRecord; includeSample: boolean }) {
  const sentence = decisionLineText({ action: record.action, actorType: record.actorType, agentName: record.agentName })
  const href = opsTargetHref({ bundleId: record.bundleId, itemId: record.itemId }, { includeSample })
  const meta = [record.kind ? kindLabel(record.kind) : null, record.patternNo, formatKstDayTime(record.createdAt)].filter(
    (part): part is string => part !== null && part !== ''
  )
  return (
    <li className="relative flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-sm hover:bg-muted/50">
      {href ? (
        <Link
          href={href}
          className="min-w-0 break-words font-medium underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {sentence}
        </Link>
      ) : (
        <span className="min-w-0 break-words font-medium">{sentence}</span>
      )}
      {meta.length > 0 && <span className="text-muted-foreground">{meta.join(' · ')}</span>}
      {record.isSample && <OpsStatusBadge type="sample" />}
    </li>
  )
}

interface OpsRecentDecisionsProps {
  /** 최신순 최근 이력(`listRecentOpsDecisions`, 기본 10건). */
  records: readonly OpsRecentDecisionRecord[]
  /** 시험 묶음을 포함해서 보는 중이면 링크에 `sample=1`을 이어 붙인다. */
  includeSample?: boolean
  className?: string
}

export function OpsRecentDecisions({ records, includeSample = false, className }: OpsRecentDecisionsProps) {
  return (
    <section aria-labelledby="ops-recent-decisions-heading" className={cn('@container space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="ops-recent-decisions-heading" className="text-lg font-semibold">
          최근 이력
        </h2>
        <Link href={inboxListHref({ includeSample })} className={LINK_CLASS}>
          받은 기획함
          <IconArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      {records.length === 0 ? (
        <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted-foreground">아직 기록이 없어요</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
          {records.map((record) => (
            <DecisionLine key={record.id} record={record} includeSample={includeSample} />
          ))}
        </ul>
      )}
    </section>
  )
}
