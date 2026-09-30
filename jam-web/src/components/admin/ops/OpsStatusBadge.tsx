import { IconAlertTriangle, IconFlask2 } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { OPS_ITEM_STATUSES, type OpsItemStatus } from '@/lib/admin/opsInbox/constants'
import type { OpsBundleStage } from '@/lib/admin/opsInbox/bundleStatus'
import { OPS_BUNDLE_STAGE_LABELS, OPS_ITEM_STATUS_LABELS } from '@/lib/admin/opsInbox/labels'
import { OPS_BUNDLE_STAGE_ICONS, OPS_ITEM_STATUS_ICONS, type OpsIcon } from './opsIcons'

/**
 * 받은 기획함의 상태 표시(티켓 20260930_1817, 채원 화면 설계 「토큰과 상태 표시」). S1·S2·S3·S4가 함께 쓴다.
 *
 * 항목 상태 10개, 묶음 단계, 「일부 실패」, 「형식 오류 N」, 「시험」을 **아이콘과 글자**로 그린다(색만으로 나누지 않는다).
 * 새 토큰은 없다 — shadcn 시맨틱 토큰과 어드민 Alert warning 값(`border-amber-300 bg-amber-50 text-amber-900`)만 쓴다.
 * 반려·실패는 붉은 테두리와 글자뿐이고 연한 붉은 배경은 쓰지 않는다(대비 실측: 연한 붉은 배경 위 붉은 글은 12px 기준 미달).
 */

const CHIP = 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium'

const TONE = {
  neutral: 'border-border bg-background text-foreground',
  secondary: 'border-transparent bg-secondary text-secondary-foreground',
  primary: 'border-transparent bg-primary text-primary-foreground',
  muted: 'border-border bg-background text-muted-foreground',
  destructive: 'border-destructive bg-background text-destructive',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
} as const

type Tone = keyof typeof TONE

const ITEM_STATUS_TONES: Record<OpsItemStatus, Tone> = {
  arrived: 'neutral',
  reviewing: 'neutral',
  approved: 'secondary',
  preparing: 'secondary',
  scheduled: 'secondary',
  live: 'primary',
  ended: 'muted',
  rejected: 'destructive',
  cancelled: 'muted',
  failed: 'destructive',
}

const BUNDLE_STAGE_TONES: Record<OpsBundleStage, Tone> = {
  arrived: 'neutral',
  review: 'neutral',
  prepare: 'secondary',
  scheduled: 'secondary',
  live: 'primary',
  ended: 'muted',
  rejected: 'destructive',
  cancelled: 'muted',
  failed: 'destructive',
}

const KNOWN_STATUSES: ReadonlySet<string> = new Set(OPS_ITEM_STATUSES)

export type OpsStatusBadgeProps =
  /** 항목 상태 10개. 10개 밖 값은 「상태 확인 필요」다. */
  | { type: 'item'; status: string }
  /** 묶음 단계(항목 상태에서 계산한 값). */
  | { type: 'stage'; stage: OpsBundleStage }
  /** 실패 항목이 섞인 묶음. */
  | { type: 'partial-failure' }
  /** 형식 오류 개수. `short`이면 「3건」이고, 아니면 「형식 오류 3」이다(열 제목이 「형식 오류」인 표 안에서는 short). */
  | { type: 'format-errors'; count: number; short?: boolean }
  /** 시험 묶음. */
  | { type: 'sample' }

function Chip({ tone, Icon, className, children }: { tone: Tone; Icon: OpsIcon; className?: string; children: string }) {
  return (
    <span className={cn(CHIP, TONE[tone], className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {children}
    </span>
  )
}

export function OpsStatusBadge(props: OpsStatusBadgeProps & { className?: string }) {
  const { className } = props
  switch (props.type) {
    case 'item': {
      if (!KNOWN_STATUSES.has(props.status)) {
        return (
          <Chip tone="muted" Icon={IconAlertTriangle} className={className}>
            상태 확인 필요
          </Chip>
        )
      }
      const status = props.status as OpsItemStatus
      return (
        <Chip tone={ITEM_STATUS_TONES[status]} Icon={OPS_ITEM_STATUS_ICONS[status]} className={className}>
          {OPS_ITEM_STATUS_LABELS[status]}
        </Chip>
      )
    }
    case 'stage':
      return (
        <Chip tone={BUNDLE_STAGE_TONES[props.stage]} Icon={OPS_BUNDLE_STAGE_ICONS[props.stage]} className={className}>
          {OPS_BUNDLE_STAGE_LABELS[props.stage]}
        </Chip>
      )
    case 'partial-failure':
      return (
        <Chip tone="destructive" Icon={IconAlertTriangle} className={className}>
          일부 실패
        </Chip>
      )
    case 'format-errors':
      return (
        <Chip tone="warning" Icon={IconAlertTriangle} className={className}>
          {props.short ? `${props.count}건` : `형식 오류 ${props.count}`}
        </Chip>
      )
    case 'sample':
      return (
        <Chip tone="neutral" Icon={IconFlask2} className={className}>
          시험
        </Chip>
      )
  }
}
