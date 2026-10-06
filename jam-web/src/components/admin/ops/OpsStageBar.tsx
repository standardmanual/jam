import type { ReactNode } from 'react'
import { IconBan, IconCheck, IconCircleX, IconAlertTriangle } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/admin/ui/card'
import { OPS_STAGES, computeBundleStatus, stageCounts } from '@/lib/admin/opsInbox/bundleStatus'
import { OPS_STAGE_BAR_LABELS } from '@/lib/admin/opsInbox/labels'

/**
 * 단계 표시줄(티켓 20260930_1817, 채원 화면 설계 「S3 기획 상세」). 도착 → 검토 → 준비 → 예약 → 게재 → 종료 6단계다.
 *
 * - 지난 단계는 채운 원과 체크, 지금 단계는 굵은 테두리 원과 굵은 글자(`aria-current="step"`, 숨은 글 「지금 단계」),
 *   아직은 점선 원이다. 지난 구간의 연결선만 실선이다. 색만으로 나누지 않는다.
 * - 단계 아래에 그 단계 항목 수(0이면 「-」). 단계 매핑은 PRD §7.1이다.
 * - 표시줄 밖(반려·취소·실패)은 표시줄 아래 한 줄에 「{단계}에서 {상태} N개」 칩으로 알린다(0인 것은 숨긴다).
 * - 묶음이 전부 반려·취소이면 표시줄 자리에 배너를 둔다. 전부 실패이면 모든 단계를 점선으로 그린다.
 * - `barAction`은 표시줄 오른쪽 자리다(1818이 「N개 승인하기」를 채운다). 비어 있으면 자리를 잡지 않는다.
 */

interface OpsStageBarProps {
  /** 이 묶음 항목들의 상태. 묶음 단계와 단계별 개수를 여기서 계산한다. */
  statuses: readonly string[]
  barAction?: ReactNode
}

const STEP_TRANSITION = 'transition-colors duration-200 motion-reduce:transition-none'

type StepState = 'done' | 'current' | 'pending'

interface OffBarChip {
  key: string
  text: string
  tone: 'destructive' | 'muted'
  Icon: typeof IconBan
}

function bannerText(offBar: { rejected: number; cancelled: number }): string {
  if (offBar.rejected > 0 && offBar.cancelled > 0) return '이 기획은 모두 반려되거나 취소됐어요'
  return offBar.cancelled > 0 ? '이 기획은 모두 취소됐어요' : '이 기획은 모두 반려됐어요'
}

function StepMark({ state, number }: { state: StepState; number: number }) {
  const base = cn('relative z-10 flex size-8 items-center justify-center rounded-full text-sm tabular-nums', STEP_TRANSITION)
  if (state === 'done') {
    return (
      <span className={cn(base, 'border-2 border-primary bg-primary text-primary-foreground')}>
        <IconCheck className="size-4" aria-hidden="true" />
      </span>
    )
  }
  if (state === 'current') {
    return <span className={cn(base, 'border-[3px] border-primary bg-background font-bold text-foreground')}>{number}</span>
  }
  return (
    <span className={cn(base, 'border-2 border-dashed border-muted-foreground bg-background text-muted-foreground')}>
      {number}
    </span>
  )
}

export function OpsStageBar({ statuses, barAction }: OpsStageBarProps) {
  const status = computeBundleStatus(statuses)
  const counts = stageCounts(statuses)
  const currentIndex = (OPS_STAGES as readonly string[]).indexOf(status.stage) // 표시줄 밖 단계이면 -1
  const allStopped = status.stage === 'rejected' || status.stage === 'cancelled'
  const { offBar } = status

  // 「{단계}에서 {상태} N개」. 반려는 검토에서만, 취소는 예약 단계에서만 나온다(PRD §7). 실패는 어느 단계에서 났는지 결정 기록에
  // 남는 것은 뒤 티켓(20260930_1500)이라 지금은 「실패 N개」로만 알린다.
  const offBarChips: OffBarChip[] = []
  if (offBar.rejected > 0) {
    offBarChips.push({ key: 'rejected', text: `검토에서 반려 ${offBar.rejected}개`, tone: 'destructive', Icon: IconCircleX })
  }
  if (offBar.cancelled > 0) {
    offBarChips.push({ key: 'cancelled', text: `예약 단계에서 취소 ${offBar.cancelled}개`, tone: 'muted', Icon: IconBan })
  }
  if (offBar.failed > 0) {
    offBarChips.push({ key: 'failed', text: `실패 ${offBar.failed}개`, tone: 'destructive', Icon: IconAlertTriangle })
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        {allStopped ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-muted px-3 py-3 text-sm font-medium text-foreground">
            {status.stage === 'cancelled' ? (
              <IconBan className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <IconCircleX className="size-4 shrink-0" aria-hidden="true" />
            )}
            {bannerText(offBar)}
          </div>
        ) : (
          <ol className="flex min-w-[24rem] flex-1 items-start" aria-label="기획 진행 단계">
            {OPS_STAGES.map((stage, index) => {
              const state: StepState = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending'
              const count = counts[stage]
              return (
                <li
                  key={stage}
                  aria-current={state === 'current' ? 'step' : undefined}
                  className="relative flex flex-1 flex-col items-center gap-1"
                >
                  {index < OPS_STAGES.length - 1 && (
                    // 이 단계 원의 가운데에서 다음 단계 원의 가운데까지. 지난 구간(이 단계가 지금 단계보다 앞)만 실선이다.
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute left-1/2 top-4 w-full -translate-y-1/2',
                        STEP_TRANSITION,
                        index < currentIndex ? 'h-0.5 bg-primary' : 'h-0 border-t-2 border-dashed border-muted-foreground/50'
                      )}
                    />
                  )}
                  <StepMark state={state} number={index + 1} />
                  <span className={cn('text-sm', state === 'current' ? 'font-bold text-foreground' : 'text-muted-foreground')}>
                    {OPS_STAGE_BAR_LABELS[stage]}
                    <span className="sr-only">
                      {state === 'current' ? ' 지금 단계' : state === 'done' ? ' 지난 단계' : ' 아직'}
                    </span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{count === 0 ? '-' : `${count}개`}</span>
                </li>
              )
            })}
          </ol>
        )}
        {barAction && <div className="flex shrink-0 items-center self-center">{barAction}</div>}
      </div>

      {offBarChips.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3" aria-label="표시줄 밖 상태">
          {offBarChips.map(({ key, text, tone, Icon }) => (
            <li
              key={key}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium',
                tone === 'destructive' ? 'border-destructive text-destructive' : 'border-border text-muted-foreground'
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
