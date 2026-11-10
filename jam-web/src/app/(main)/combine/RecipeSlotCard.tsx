import BadgeGridCard from '@/components/ui/BadgeGridCard'
import SlotCircleButton from '@/components/ui/SlotCircleButton'
import { d, t } from '@/lib/i18n'

/**
 * 레시피 믹서의 슬롯 칸 — 컬렉션 칸(`SlotGrid`)과 같은 «BadgeGridCard + 형제 SlotCircleButton» 조합이다(티켓 20261110_1115).
 * 서비스 전용 조립 조각이라 새 MODULAR 컴포넌트가 아니다. 칸 본체는 누르는 동작이 없고(`BadgeGridCard`를 비대화형으로 둔다)
 * 우측 상단 원 버튼만 누른다. 버튼은 카드 안이 아니라 형제로 둔다(컬렉션 `SlotGrid`의 래퍼 구조와 같다).
 *
 * - `filled`: 채운 개체를 선명하게 + «−»(누르면 비운다) + 3px 회색 테두리(등급 올리기 칸과 같은 모양, 채웠다는 신호).
 * - `addable`: 대표 후보를 선명하게 + «+»(활성 행이 하나면 바로 채우고, 여럿이면 호출부가 시트를 연다).
 * - `unowned`: 대표 후보를 흐리게(썸네일 grayscale + opacity-40, 이름 muted), 버튼 없음, 눌러도 아무 일 없음.
 * - `pulse`: 온보딩 퀘스트 펄스는 «+»에만 건다. «−»·`unowned`에는 걸리지 않는다.
 */
export type RecipeSlotStatus = 'filled' | 'addable' | 'unowned'

interface RecipeSlotCardProps {
  status: RecipeSlotStatus
  name: string
  imageUrl?: string | null
  onAdd?: () => void
  onRemove?: () => void
  /** 제출 중이면 «+»·«−»를 비활성으로 둔다 */
  loading?: boolean
  pulse?: boolean
  /** 4열일 때 카드 안쪽 여백을 줄인다(360px에서 칸 폭이 약 76px라 p-3은 안쪽이 약 52px로 빠듯하다). Tailwind v4 중요 접미사로 BadgeGridCard의 p-3을 덮는다 */
  dense?: boolean
}

export default function RecipeSlotCard({
  status,
  name,
  imageUrl,
  onAdd,
  onRemove,
  loading = false,
  pulse = false,
  dense = false,
}: RecipeSlotCardProps) {
  const unowned = status === 'unowned'
  // 채운 칸은 등급 올리기의 채운·빈 칸(`MixerSlot`)과 같은 3px 회색 테두리(`--muted`)로 «채움»을 알린다(2026-11-10 사용자 지시).
  // 안쪽 링(box-shadow inset)이라 칸 크기와 이미지 위치를 밀지 않는다.
  const cardClassName = ['w-full', dense && 'p-2!', status === 'filled' && 'ring-3 ring-inset ring-muted'].filter(Boolean).join(' ')
  return (
    <div className="relative flex">
      <BadgeGridCard
        className={cardClassName}
        name={name}
        imageUrl={imageUrl}
        rarity={null}
        earned={!unowned}
        nameMuted={unowned}
      />
      {status === 'addable' && (
        <SlotCircleButton
          icon="plus"
          label={t(d.combine.slotAddAria, { name })}
          disabled={loading}
          className={pulse ? 'jam-quest-pulse' : ''}
          onClick={() => onAdd?.()}
        />
      )}
      {status === 'filled' && (
        <SlotCircleButton
          icon="minus"
          label={t(d.combine.slotRemoveAria, { name })}
          disabled={loading}
          onClick={() => onRemove?.()}
        />
      )}
    </div>
  )
}
