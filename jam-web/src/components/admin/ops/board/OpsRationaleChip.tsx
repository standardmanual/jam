import { IconActivity, IconCloud, IconHash, IconLeaf, IconTrendingUp } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import type { OpsRationaleKind } from '@/lib/admin/opsInbox/constants'
import { RATIONALE_KIND_LABELS } from '@/lib/admin/opsBoard/rationale'
import type { OpsIcon } from '../opsIcons'

/**
 * 기획 이유 칩 (티켓 20261026_2024 1회차, 어드민 상황판 PRD §3 원칙 4·§6.3). 훅이 없어 서버·클라이언트 모두에서 쓴다.
 *
 * 상태 색(호박·파랑·초록·빨강)과 헷갈리지 않게 점선 테두리 + 종류 아이콘 + 회색 계열 글자로 그린다. 아이콘은 장식(`aria-hidden`)이고
 * 글자가 이름이다. 글자는 에이전트가 보낸 문자열이라 React 텍스트 노드로만 그린다.
 */

const KIND_ICONS: Record<OpsRationaleKind, OpsIcon> = {
  trend: IconTrendingUp,
  season: IconLeaf,
  weather: IconCloud,
  signal: IconActivity,
  pattern: IconHash,
}

const TEXT_CLASS = 'break-keep wrap-break-word'

interface OpsRationaleChipProps {
  kind: OpsRationaleKind
  /** 칩 글자. 목록에서는 에이전트가 정한 이유 이름, 묶음 요약에서는 종류 이름이다. */
  label: string
  /** 있으면 글자 뒤에 건수를 붙인다(묶음 요약). */
  count?: number
  /** 마우스를 올렸을 때 보이는 설명(이유 메모). */
  title?: string
  className?: string
}

export function OpsRationaleChip({ kind, label, count, title, className }: OpsRationaleChipProps) {
  const Icon = KIND_ICONS[kind]
  return (
    <span
      data-rationale-kind={kind}
      title={title}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border border-dashed border-neutral-400 px-2 py-0.5 text-xs text-neutral-600',
        className
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className={cn('truncate', TEXT_CLASS)}>{label}</span>
      {count !== undefined && <span className="tabular-nums">{count}</span>}
    </span>
  )
}

export interface OpsRationaleChipEntry {
  kind: OpsRationaleKind
  label: string
  count?: number
  title?: string
}

interface OpsRationaleChipsProps {
  chips: readonly OpsRationaleChipEntry[]
  /** 이 개수를 넘으면 나머지를 「+N」 하나로 줄인다. 비우면 전부 보인다. */
  max?: number
  className?: string
}

/** 이유 칩 줄. 칩이 없으면 아무것도 그리지 않는다. */
export function OpsRationaleChips({ chips, max, className }: OpsRationaleChipsProps) {
  if (chips.length === 0) return null
  const shown = max !== undefined ? chips.slice(0, max) : chips
  const hidden = chips.length - shown.length
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {shown.map((chip, index) => (
        <OpsRationaleChip key={`${chip.kind}:${chip.label}:${index}`} {...chip} />
      ))}
      {hidden > 0 && <span className="text-xs tabular-nums text-neutral-600">{`+${hidden}`}</span>}
    </span>
  )
}

/** 종류 이름만 쓰는 칩 항목 만들기(묶음 요약용). */
export function kindChipEntries(chips: readonly { kind: OpsRationaleKind; count: number }[]): OpsRationaleChipEntry[] {
  return chips.map((chip) => ({ kind: chip.kind, label: RATIONALE_KIND_LABELS[chip.kind], count: chip.count }))
}
