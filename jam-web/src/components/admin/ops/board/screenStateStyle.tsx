import { cn } from '@/lib/utils'
import { SCREEN_STATE_LABELS, type ScreenState } from '@/lib/admin/opsBoard/screenState'
import { OPS_ITEM_STATUS_ICONS, type OpsIcon } from '../opsIcons'

/**
 * 운영 상황판의 화면 상태 표현 (티켓 20261026_2023 2회차, 어드민 상황판 PRD §3.1).
 *
 * 색만 쓰지 않고 점·아이콘·글자를 함께 쓴다. 아이콘은 항목 상태 아이콘(`opsIcons.tsx`)을 재사용한다.
 * 결정 필요: 호박색 / 진행 중: 파랑 / 게재 중: 초록 / 끝남: 회색 / 문제: 빨강.
 * 「결정 필요」·「문제」만 `motion-safe:animate-pulse`로 움직인다(동작 줄이기 설정에서는 멈춘다).
 */

interface StateStyle {
  Icon: OpsIcon
  /** 점 색. */
  dot: string
  /** 글자 색. */
  text: string
  /** 정류장·카드 테두리와 바탕. */
  box: string
  pulse: boolean
}

export const SCREEN_STATE_STYLES: Record<ScreenState, StateStyle> = {
  decide: {
    Icon: OPS_ITEM_STATUS_ICONS.arrived,
    dot: 'bg-amber-500',
    text: 'text-amber-900',
    box: 'border-amber-300 bg-amber-50',
    pulse: true,
  },
  progress: {
    Icon: OPS_ITEM_STATUS_ICONS.preparing,
    dot: 'bg-blue-500',
    text: 'text-blue-900',
    box: 'border-blue-300 bg-blue-50',
    pulse: false,
  },
  live: {
    Icon: OPS_ITEM_STATUS_ICONS.live,
    dot: 'bg-emerald-500',
    text: 'text-emerald-900',
    box: 'border-emerald-300 bg-emerald-50',
    pulse: false,
  },
  done: {
    Icon: OPS_ITEM_STATUS_ICONS.ended,
    dot: 'bg-muted-foreground',
    text: 'text-muted-foreground',
    box: 'border-border bg-muted',
    pulse: false,
  },
  problem: {
    Icon: OPS_ITEM_STATUS_ICONS.failed,
    dot: 'bg-destructive',
    text: 'text-destructive',
    box: 'border-destructive bg-background',
    pulse: true,
  },
}

/** 상태 점. 장식이라 화면 읽기에서 뺀다(뜻은 옆의 글자가 말한다). */
export function StateDot({ state, className }: { state: ScreenState; className?: string }) {
  const style = SCREEN_STATE_STYLES[state]
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2 shrink-0 rounded-full', style.dot, style.pulse && 'motion-safe:animate-pulse', className)}
    />
  )
}

/** 점 + 아이콘 + 글자로 상태를 알린다. */
export function StateLabel({ state, className }: { state: ScreenState; className?: string }) {
  const style = SCREEN_STATE_STYLES[state]
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium', style.text, className)}>
      <StateDot state={state} />
      <style.Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {SCREEN_STATE_LABELS[state]}
    </span>
  )
}
