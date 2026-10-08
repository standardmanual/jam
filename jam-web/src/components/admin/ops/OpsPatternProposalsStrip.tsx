import Link from 'next/link'
import { IconArrowRight } from '@tabler/icons-react'
import { inboxListHref } from '@/lib/admin/opsHome/links'

/**
 * 패턴 사전의 「승인 대기 제안」 줄 (티켓 20261008_1400, 채원 판정 「⑨ 목록」). 훅이 없는 서버 컴포넌트다.
 *
 * `count`는 받은 기획함에서 결정을 기다리는 `pattern_proposal` 항목 수(`countPendingPatternProposals`, 시험 묶음 제외)이고, 못 읽었으면 `null`이다.
 * 0건이면 muted 한 줄이고 링크가 없다. 못 읽었으면 0건으로 보이지 않고 「읽지 못했어요」를 알린다. 링크는 받은 기획함의 「결정할 것」 탭이다.
 */

export const PROPOSALS_NONE_TEXT = '승인 대기 제안이 없어요'
export const PROPOSALS_FAILED_TEXT = '승인 대기 제안을 읽지 못했어요'
export const PROPOSALS_LINK_LABEL = '받은 기획함으로'

const LINK_CLASS =
  'inline-flex min-h-6 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function OpsPatternProposalsStrip({ count }: { count: number | null }) {
  if (count === null) {
    return <p className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted-foreground">{PROPOSALS_FAILED_TEXT}</p>
  }
  if (count === 0) {
    return <p className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted-foreground">{PROPOSALS_NONE_TEXT}</p>
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-border bg-background px-4 py-3">
      <p className="text-sm">
        <span className="font-medium">승인 대기 제안 {count}건</span>
        <span className="text-muted-foreground"> · 받은 기획함에서 승인해요</span>
      </p>
      <Link href={inboxListHref({ tab: 'decide' })} className={LINK_CLASS}>
        {PROPOSALS_LINK_LABEL}
        <IconArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </div>
  )
}
