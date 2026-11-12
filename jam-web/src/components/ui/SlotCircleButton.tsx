import type { MouseEvent } from 'react'
import { MinusIcon, PlusIcon } from '@/components/ui/icons'

/**
 * 컬렉션 칸의 «빼기»·«추가» 버튼 — 칸의 우측 상단 안쪽에 놓이는 검은 원 안의 «−»·«+» 아이콘이다(2026-11-09 사용자 지시).
 * 이전의 칸 아래 알약(`SlotActionPill`의 빼기·추가)을 대신한다. «교체»는 알약 그대로다. 서비스 전용이다.
 * - 검정 면(--background-inverse) + --snow 아이콘. 카드 면(--card-bg) 위에서 대비가 충분하다.
 * - 원은 24px이고 카드의 우측·위 가장자리에서 6px 안쪽에 놓인다.
 * - `before`로 사방 10px씩 넓혀 눌리는 영역을 44px로 맞춘다(점검표 기준, 티켓 20261112_1817).
 * - 이름은 보이지 않으므로 `aria-label`로 알린다(«빼기»·«추가»).
 * - 위치(`absolute`)는 이 버튼을 감싸는 호출부의 `relative` 래퍼가 정한다. 격자 카드 전체가 링크라
 *   `preventDefault`/`stopPropagation`은 호출부 `onClick`이 맡는다(`SlotActionPill`과 같다).
 * - 한 칸에는 둘 중 하나만 나온다: 장착된 칸은 «−», 장착하지 않았고 넣을 수 있는 칸은 «+».
 * - `position="center"`(티켓 20261112_1627, 캔버스 확정): «+»를 카드 모서리가 아니라 **이미지 상자의 정중앙**에 놓는다.
 *   버튼을 움직이지 않고 틀(frame)로 맞춘다 — 바깥 틀(`pointer-events-none`, 카드 안쪽 여백만큼 안으로)이 `BadgeGridCard`의 이미지 상자와
 *   같은 기하(`aspect-square w-full max-w-[90px]`)의 안쪽 틀을 품고, 버튼은 그 안쪽 틀의 flex 가운데에 놓인다. 버튼에 `translate`를 쓰지 않으므로
 *   퀘스트 펄스(`jam-quest-pulse`, transform 애니메이션)와 충돌하지 않는다. 틀이 `pointer-events-none`이라 틀 자체는 카드 탭을 가로채지 않고,
 *   눌리는 44px 영역만 카드 링크 위에 얹힌다. `dense`(믹스 4열, 카드 `p-2`)이면 틀의 안쪽 여백을 8px로 줄인다.
 *   기본값 `corner`는 이전과 같다(«−»는 계속 우상단).
 */
export type SlotCircleIcon = 'minus' | 'plus'
export type SlotCirclePosition = 'corner' | 'center'

interface SlotCircleButtonProps {
  icon: SlotCircleIcon
  label: string
  /** 해당 칸의 요청이 진행 중 — 비활성이 되고 반투명해진다 */
  pending?: boolean
  disabled?: boolean
  /** 덧붙일 클래스 — 믹서 칸이 퀘스트 펄스(`jam-quest-pulse`)를 걸 때 쓴다. 기본값은 빈 문자열이라 컬렉션 칸은 그대로다 */
  className?: string
  /** `corner`(기본) = 카드 우상단 안쪽(«−»), `center` = 이미지 상자의 정중앙(«+»). 위 설명 참고 */
  position?: SlotCirclePosition
  /** `center`일 때만 쓴다 — 카드 안쪽 여백이 `p-2`(믹스 4열)이면 true */
  dense?: boolean
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
}

export default function SlotCircleButton({
  icon,
  label,
  pending = false,
  disabled = false,
  className = '',
  position = 'corner',
  dense = false,
  onClick,
}: SlotCircleButtonProps) {
  const Icon = icon === 'plus' ? PlusIcon : MinusIcon
  const circleCls = 'flex h-6 w-6 items-center justify-center rounded-full bg-background-inverse text-snow transition-all before:absolute before:-inset-2.5 disabled:opacity-40'
  const extra = className ? ` ${className}` : ''
  const button = (placement: string) => (
    <button
      type="button"
      aria-label={label}
      aria-busy={pending || undefined}
      onClick={onClick}
      disabled={pending || disabled}
      className={`${placement} ${circleCls}${extra}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={4.5} />
    </button>
  )

  if (position === 'center') {
    return (
      <div className={`pointer-events-none absolute z-10 ${dense ? 'inset-x-2 top-2' : 'inset-x-3 top-3'}`}>
        <div className="relative mx-auto flex aspect-square w-full max-w-[90px] items-center justify-center">
          {button('pointer-events-auto relative')}
        </div>
      </div>
    )
  }
  return button('absolute right-1.5 top-1.5 z-10')
}
