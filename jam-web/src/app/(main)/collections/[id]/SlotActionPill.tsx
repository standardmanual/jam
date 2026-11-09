import type { MouseEvent, ReactNode } from 'react'

/**
 * 컬렉션 칸 안의 작은 알약 버튼 — 지금은 «교체»만 쓴다(티켓 20261104_2153, 채원 사전 판정).
 * «빼기»·«추가»는 2026-11-09부터 칸 우측 상단의 원 버튼(`SlotCircleButton`)이 맡아 `neutral` 호출부와 «추가» 호출부가 없다(tone은 남겨 둔다).
 * 모양(크기·둥근 정도·전환)은 여기 한 곳에만 있고, 호출부는 색 의도(`tone`)만 고른다.
 * - `accent`: 장착 쪽 양성 행동(교체·추가). --accent 면 + --accent-foreground 글자
 * - `neutral`: 취소성 행동(빼기). --default 면 + --foreground 글자(`Button secondary`와 같은 쌍)
 * 서비스 전용이다: 격자 카드 전체가 링크라 `preventDefault`/`stopPropagation`은 호출부 `onClick`이 맡고,
 * 크기는 칸 높이를 바꾸지 않는 지금 값(px-3 py-1 text-xs)에 묶여 있어 `Button`(최소 44px)으로 대신할 수 없다.
 * 색 클래스를 호출부에서 덮어쓰지 않는다. tone으로 안 풀리는 요구는 tone을 늘린다.
 * `--default` 면은 흰 카드(--surface) 위 전제다. Card tone=tint 위에 두면 같은 색이라 알약이 사라진다.
 */
export type SlotActionPillTone = 'accent' | 'neutral'

const TONE_CLASS: Record<SlotActionPillTone, string> = {
  accent: 'bg-accent text-accent-foreground',
  neutral: 'bg-default text-foreground',
}

interface SlotActionPillProps {
  tone: SlotActionPillTone
  /** 해당 칸의 요청이 진행 중 — 라벨 대신 «…»를 보이고 비활성이 된다 */
  pending?: boolean
  disabled?: boolean
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}

export default function SlotActionPill({ tone, pending = false, disabled = false, onClick, children }: SlotActionPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || disabled}
      className={`block mx-auto px-3 py-1 text-xs rounded-full whitespace-nowrap transition-all disabled:opacity-40 ${TONE_CLASS[tone]}`}
    >
      {pending ? '…' : children}
    </button>
  )
}
