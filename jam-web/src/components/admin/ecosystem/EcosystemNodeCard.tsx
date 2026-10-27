/**
 * 순환 지도의 마디 카드 (티켓 20261026_2027 3-1, PRD admin-boards §7)
 *
 * 카드 전체가 `?node=<마디 ID>` 링크라서 서버에서 그리고, 공유하고 새로 고쳐도 같은 마디가 열린다. 선택된 마디는 `aria-current`와 굵은 테두리로 보인다.
 * `shortcut`은 필드 순환 끝의 인벤토리처럼 같은 마디로 가는 바로가기 카드다(값 없이 이름과 안내만 보이고 누르면 성장 쪽 마디가 선택된다).
 * 상태가 없는 서버·클라이언트 공용 컴포넌트다.
 */
import Link from 'next/link'
import { formatSample } from '@/components/admin/balanceDashboard/MetricCard'
import { cn } from '@/lib/utils'
import type { NodeIndicator } from '@/lib/admin/ecosystem/types'
import { formatHeadlineValue, formatShortfall } from './format'
import { StatusMark } from './StatusMark'

export function nodeHref(nodeId: string): string {
  return `/admin/ecosystem?node=${nodeId}`
}

const BASE = 'block h-full w-full rounded-lg border bg-white p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5'

export interface EcosystemNodeCardProps {
  node: NodeIndicator
  selected: boolean
  /** 같은 마디로 가는 바로가기(필드 순환 끝의 인벤토리) */
  shortcut?: boolean
}

export function EcosystemNodeCard({ node, selected, shortcut = false }: EcosystemNodeCardProps) {
  const className = cn(BASE, selected ? 'border-2 border-primary' : 'border-border')

  if (shortcut) {
    return (
      <Link
        href={nodeHref(node.id)}
        data-node={node.id}
        data-shortcut=""
        aria-current={selected ? 'true' : undefined}
        className={className}
      >
        <span className="block text-sm font-semibold break-keep wrap-break-word">{node.label}</span>
        <span className="mt-1 block text-xs text-muted-foreground break-keep wrap-break-word">성장 순환의 같은 마디로 가요</span>
      </Link>
    )
  }

  return (
    <Link
      href={nodeHref(node.id)}
      data-node={node.id}
      data-status={node.statusKind}
      aria-current={selected ? 'true' : undefined}
      className={className}
    >
      <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-sm font-semibold break-keep wrap-break-word">{node.label}</span>
        <StatusMark status={node.statusKind} />
      </span>
      <span className="mt-2 block text-lg font-bold tabular-nums break-keep wrap-break-word">
        {formatHeadlineValue(node.headline.unit, node.headline.value)}
      </span>
      <span className="block text-xs text-muted-foreground break-keep wrap-break-word">{node.headline.label}</span>
      {node.sub ? (
        <span data-sub="" className="mt-1 block text-xs text-muted-foreground break-keep wrap-break-word">
          {node.sub.label} {formatHeadlineValue(node.sub.unit, node.sub.value)}
        </span>
      ) : null}
      {node.shortfall ? (
        <span data-shortfall="" className="mt-1 block text-xs text-muted-foreground break-keep wrap-break-word">
          {formatShortfall(node.shortfall)}
        </span>
      ) : null}
      {node.sample ? (
        <span className="mt-1 block text-xs text-muted-foreground break-keep wrap-break-word">
          {formatSample(node.sample.unit, node.sample.value)}
        </span>
      ) : null}
      {node.message ? (
        <span data-message="" className="mt-1 block text-xs text-orange-700 break-keep wrap-break-word">
          {node.message}
        </span>
      ) : null}
      <span className="mt-2 block text-xs text-muted-foreground break-keep wrap-break-word">{node.periodText}</span>
    </Link>
  )
}
