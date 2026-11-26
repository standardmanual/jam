import type { MouseEvent, ReactNode } from 'react'
import Button from '@/components/ui/Button'

/**
 * 컬렉션 칸 안의 작은 알약 버튼 — 지금은 «교체»만 쓴다(티켓 20261104_2153, 채원 사전 판정).
 * «빼기»·«추가»는 2026-11-09부터 칸 우측 상단의 원 버튼(`SlotCircleButton`)이 맡아 `neutral` 호출부와 «추가» 호출부가 없다(tone은 남겨 둔다).
 * 정본 `Button size="xs"`를 감싼 얇은 래퍼다(티켓 20261126_1408). 호출부는 색 의도(`tone`)만 고른다.
 * - `accent`: 장착 쪽 양성 행동(교체·추가). `Button primary surface="sub"` (--accent 면 + --accent-foreground 글자)
 * - `neutral`: 취소성 행동(빼기). `Button secondary`
 * 격자 카드 전체가 링크라 `preventDefault`/`stopPropagation`은 호출부 `onClick`이 맡는다.
 */
type SlotActionPillTone = 'accent' | 'neutral'

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
    <Button
      size="xs"
      variant={tone === 'accent' ? 'primary' : 'secondary'}
      surface={tone === 'accent' ? 'sub' : undefined}
      onClick={onClick}
      disabled={pending || disabled}
      className="block mx-auto"
    >
      {pending ? '…' : children}
    </Button>
  )
}
