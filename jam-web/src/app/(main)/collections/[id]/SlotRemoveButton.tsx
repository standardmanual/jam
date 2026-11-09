import type { MouseEvent } from 'react'
import { MinusIcon } from '@/components/ui/icons'

/**
 * 컬렉션 칸의 «빼기» 버튼 — 장착된 칸의 우측 상단에 놓이는 검은 원 안의 «−» 아이콘이다(2026-11-09 사용자 지시).
 * 이전의 칸 아래 회색 알약(`SlotActionPill` neutral)을 대신한다. 서비스 전용이다.
 * - 검정 면(--background-inverse) + --snow 아이콘. 카드 면(--card-bg) 위에서 대비가 충분하다.
 * - 눈에 보이는 원은 24px이고, `before`로 사방 8px씩 넓혀 눌리는 영역을 40px로 맞춘다.
 * - 이름은 보이지 않으므로 `aria-label`로 알린다(«빼기»).
 * - 위치(`absolute`)는 이 버튼을 감싸는 호출부의 `relative` 래퍼가 정한다. 격자 카드 전체가 링크라
 *   `preventDefault`/`stopPropagation`은 호출부 `onClick`이 맡는다(`SlotActionPill`과 같다).
 */
interface SlotRemoveButtonProps {
  label: string
  /** 해당 칸의 요청이 진행 중 — 비활성이 되고 반투명해진다 */
  pending?: boolean
  disabled?: boolean
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
}

export default function SlotRemoveButton({ label, pending = false, disabled = false, onClick }: SlotRemoveButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-busy={pending || undefined}
      onClick={onClick}
      disabled={pending || disabled}
      className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background-inverse text-snow transition-all before:absolute before:-inset-2 disabled:opacity-40"
    >
      <MinusIcon className="h-3.5 w-3.5" strokeWidth={3} />
    </button>
  )
}
