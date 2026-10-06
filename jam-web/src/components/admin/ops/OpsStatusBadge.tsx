import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconFlask2,
  IconInfoCircle,
  IconQuestionMark,
  IconScale,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { OPS_ITEM_STATUSES, type OpsItemStatus } from '@/lib/admin/opsInbox/constants'
import type { OpsBundleStage } from '@/lib/admin/opsInbox/bundleStatus'
import { OPS_BUNDLE_STAGE_LABELS, OPS_ITEM_STATUS_LABELS } from '@/lib/admin/opsInbox/labels'
import { balanceRowChipLabel } from '@/lib/admin/opsInbox/balance/messages'
import {
  OPS_SIGNAL_LEVEL_LABELS,
  OPS_SIGNAL_UNCHECKED_TEXT,
  type OpsSignalLevel,
  type OpsSignalUncheckedReason,
} from '@/lib/admin/opsSignals/catalog'
import { OPS_BUNDLE_STAGE_ICONS, OPS_ITEM_STATUS_ICONS, type OpsIcon } from './opsIcons'

/**
 * 받은 기획함의 상태 표시(티켓 20260930_1817, 채원 화면 설계 「토큰과 상태 표시」). S1·S2·S3·S4가 함께 쓴다.
 *
 * 항목 상태 10개, 묶음 단계, 「일부 실패」, 「형식 오류 N」, 「시험」, 「밸런스 주의·참고 N」, 신호 수준(중단·주의·참고)과 「확인 안 함」을
 * **아이콘과 글자**로 그린다(색만으로 나누지 않는다).
 * 새 토큰은 없다 — shadcn 시맨틱 토큰과 어드민 Alert warning 값(`border-amber-300 bg-amber-50 text-amber-900`)만 쓴다.
 * 반려·실패는 붉은 테두리와 글자뿐이고 연한 붉은 배경은 쓰지 않는다(대비 실측: 연한 붉은 배경 위 붉은 글은 12px 기준 미달).
 */

const CHIP = 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium'

/** 칩 틀과 색(밸런스 경고 줄의 수준 칩 `OpsBalanceWarnings`도 같은 것을 쓴다). */
export const TONE = {
  neutral: 'border-border bg-background text-foreground',
  secondary: 'border-transparent bg-secondary text-secondary-foreground',
  primary: 'border-transparent bg-primary text-primary-foreground',
  muted: 'border-border bg-background text-muted-foreground',
  destructive: 'border-destructive bg-background text-destructive',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
} as const

export type Tone = keyof typeof TONE

/** 항목 상태마다의 칩 색. 일정표의 타임라인 막대가 같은 색을 쓴다(티켓 20261006_1339, 채원 판정 「②가 먼저 만들어 둘 공용」 (2)). */
export const ITEM_STATUS_TONES: Record<OpsItemStatus, Tone> = {
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
  /** 항목의 밸런스 경고 칩(티켓 20260930_1459). 주의가 있으면 「밸런스 주의 N」, 참고·점검 못 함만 있으면 「밸런스 참고 N」이다. */
  | { type: 'balance'; level: 'warn' | 'info'; count: number }
  /** 신호 수준(티켓 20261006_1339). 중단은 붉은 테두리 + 팔각 느낌표, 주의는 경고 색 + 삼각 느낌표, 참고는 중립 + 정보 아이콘이다. */
  | { type: 'signal'; level: OpsSignalLevel }
  /** 확인 안 함 신호. 점선 테두리 + 물음표이고, 글자는 사유마다(「아직 확인하지 않아요」·「확인하지 못했어요」)다. */
  | { type: 'signal-unchecked'; reason: OpsSignalUncheckedReason }

/** 신호 수준 칩의 색과 아이콘. 주의·참고는 밸런스 경고 줄(`OpsBalanceWarnings`의 `LINE_CHIPS`)과 같다. 새로 정한 것은 중단 하나다. */
const SIGNAL_LEVEL_CHIPS: Record<OpsSignalLevel, { tone: Tone; Icon: OpsIcon }> = {
  stop: { tone: 'destructive', Icon: IconAlertOctagon },
  warn: { tone: 'warning', Icon: IconAlertTriangle },
  info: { tone: 'neutral', Icon: IconInfoCircle },
}

/**
 * 칩 하나. `iconOnly`면 아이콘만 보이고 글자는 `sr-only`로 남긴다(좁은 월간 칸·타임라인 막대, 티켓 20261006_1538 ③-c — 뜻은 범례 `OpsStatusLegend`가 알려 준다).
 * 글자가 화면 읽기에서 빠지지 않으므로 아이콘만 보여도 색·모양에만 기대지 않는다.
 */
export function Chip({
  tone,
  Icon,
  className,
  iconOnly = false,
  children,
}: {
  tone: Tone
  Icon: OpsIcon
  className?: string
  iconOnly?: boolean
  children: string
}) {
  return (
    <span className={cn(CHIP, TONE[tone], iconOnly && 'gap-0 px-1.5 py-1', className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {iconOnly ? <span className="sr-only">{children}</span> : children}
    </span>
  )
}

/** `iconOnly`는 모든 종류에 쓴다: 아이콘만 그리고 글자는 화면 읽기용으로 남긴다. */
export function OpsStatusBadge(props: OpsStatusBadgeProps & { className?: string; iconOnly?: boolean }) {
  const { className, iconOnly } = props
  switch (props.type) {
    case 'item': {
      if (!KNOWN_STATUSES.has(props.status)) {
        return (
          <Chip tone="muted" Icon={IconAlertTriangle} className={className} iconOnly={iconOnly}>
            상태 확인 필요
          </Chip>
        )
      }
      const status = props.status as OpsItemStatus
      return (
        <Chip tone={ITEM_STATUS_TONES[status]} Icon={OPS_ITEM_STATUS_ICONS[status]} className={className} iconOnly={iconOnly}>
          {OPS_ITEM_STATUS_LABELS[status]}
        </Chip>
      )
    }
    case 'stage':
      return (
        <Chip tone={BUNDLE_STAGE_TONES[props.stage]} Icon={OPS_BUNDLE_STAGE_ICONS[props.stage]} className={className} iconOnly={iconOnly}>
          {OPS_BUNDLE_STAGE_LABELS[props.stage]}
        </Chip>
      )
    case 'partial-failure':
      return (
        <Chip tone="destructive" Icon={IconAlertTriangle} className={className} iconOnly={iconOnly}>
          일부 실패
        </Chip>
      )
    case 'format-errors':
      return (
        <Chip tone="warning" Icon={IconAlertTriangle} className={className} iconOnly={iconOnly}>
          {props.short ? `${props.count}건` : `형식 오류 ${props.count}`}
        </Chip>
      )
    case 'sample':
      return (
        <Chip tone="neutral" Icon={IconFlask2} className={className} iconOnly={iconOnly}>
          시험
        </Chip>
      )
    case 'balance':
      return (
        <Chip tone={props.level === 'warn' ? 'warning' : 'neutral'} Icon={IconScale} className={className} iconOnly={iconOnly}>
          {balanceRowChipLabel(props.level, props.count)}
        </Chip>
      )
    case 'signal': {
      const chip = SIGNAL_LEVEL_CHIPS[props.level]
      return (
        <Chip tone={chip.tone} Icon={chip.Icon} className={className} iconOnly={iconOnly}>
          {OPS_SIGNAL_LEVEL_LABELS[props.level]}
        </Chip>
      )
    }
    case 'signal-unchecked':
      return (
        <Chip tone="muted" Icon={IconQuestionMark} className={cn('border-dashed', className)} iconOnly={iconOnly}>
          {OPS_SIGNAL_UNCHECKED_TEXT[props.reason].label}
        </Chip>
      )
  }
}
