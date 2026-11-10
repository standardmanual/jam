import BadgeGridCard from '@/components/ui/BadgeGridCard'
import { d } from '@/lib/i18n'
import type { BadgeRarity } from '@/types/database'

/**
 * 내 배지 시트의 셀 하나 — 레시피 믹서 가방과 등급 올리기 재료 시트가 같이 쓴다(티켓 20261022_2119 3회).
 * 티켓 20261110_2150부터 인벤토리·컬렉션·배지 목록과 같은 `BadgeGridCard` 레이아웃으로 그린다(캔버스 «JAM! 바텀시트»).
 *
 * - `active`: 탭해서 담을 수 있음 — 카드가 버튼이다
 * - `used`: 다른 칸에 이미 담음 — 눌리지 않고 카드 아래에 «사용 중»이 붙는다
 * - `needed`: 아예 보유하지 않음 — 눌리지 않고 카드가 흐리며 그림이 그레이스케일이다(미보유 전용)
 * - `inactive`: 지금은 담을 수 없음 — 눌리지 않고 카드가 흐리다. 이유는 셀 밖의 줄이 말한다(등급 올리기의 6개 미만 묶음)
 *
 * 등급 칩은 `rarity`를 줄 때만 그린다(Common이면 카드가 칩을 그리지 않는다). 등급 올리기 시트는 묶음 제목이 등급을 말하므로 주지 않는다.
 */
export type BagItemState = 'active' | 'used' | 'needed' | 'inactive'

export default function BagItemCell({
  name,
  imageUrl,
  rarity = null,
  state,
  pulse = false,
  onClick,
}: {
  name: string
  imageUrl: string | null
  rarity?: BadgeRarity | null
  state: BagItemState
  pulse?: boolean
  onClick: () => void
}) {
  const active = state === 'active'
  const className = [
    'w-full',
    state === 'needed' || state === 'inactive' ? 'opacity-40' : '',
    pulse ? 'jam-quest-pulse' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <BadgeGridCard
      className={className}
      name={name}
      imageUrl={imageUrl}
      rarity={rarity}
      earned={state !== 'needed'}
      onClick={active ? onClick : undefined}
    >
      {state === 'used' && <span className="text-xs text-muted">{d.combine.bagUsedLabel}</span>}
    </BadgeGridCard>
  )
}
