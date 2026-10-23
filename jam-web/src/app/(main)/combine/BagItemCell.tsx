import SafeImage from '@/components/SafeImage'
import { PackageIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'

/**
 * 내 배지 시트의 셀 하나 — 레시피 믹서 가방과 등급 올리기 재료 시트가 같이 쓴다(티켓 20261022_2119 3회).
 * `CombineClient.tsx`의 가방 셀을 그대로 옮긴 것이라 레시피 믹서의 렌더 결과는 한 글자도 달라지지 않는다(`BagItemCell.test.tsx`가 고정한다).
 *
 * - `active`: 탭해서 담을 수 있음
 * - `used`: 다른 칸에 이미 담음 — 비활성 + «사용 중»
 * - `needed`: 아예 보유하지 않음 — 비활성 + 그레이스케일(미보유 전용)
 * - `inactive`: 지금은 담을 수 없음 — 비활성만. 이유는 셀 밖의 줄이 말한다(등급 올리기의 5개 미만 묶음)
 */
export type BagItemState = 'active' | 'used' | 'needed' | 'inactive'

export default function BagItemCell({
  name,
  imageUrl,
  state,
  pulse = false,
  onClick,
}: {
  name: string
  imageUrl: string | null
  state: BagItemState
  /** 온보딩 퀘스트 「지금 눌러야 할 요소」 펄스 */
  pulse?: boolean
  onClick: () => void
}) {
  const active = state === 'active'
  // 미보유 후보(needed)는 그레이스케일로만 표현한다(인벤토리·컬렉션 화면의 미획득 처리와 동일한
  // grayscale+opacity 조합, 티켓 20260917_1828 — "필요" 텍스트는 제거).
  const needed = state === 'needed'
  return (
    <button
      type="button"
      disabled={!active}
      onClick={onClick}
      className={[
        'flex flex-col items-center gap-1 p-2 rounded-2xl bg-background',
        active ? 'active:scale-95' : 'opacity-40',
        pulse ? 'jam-quest-pulse' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className={[
          'w-16 h-16 rounded-2xl bg-surface flex items-center justify-center overflow-hidden',
          needed ? 'grayscale opacity-40' : '',
        ].join(' ')}
      >
        <SafeImage
          src={imageUrl}
          alt={name}
          width={64}
          height={64}
          className="object-contain w-full h-full"
          fallback={<PackageIcon className="w-6 h-6 text-muted" />}
        />
      </div>
      <p className="text-xs text-foreground text-center line-clamp-2">
        {name}
      </p>
      {state === 'used' && (
        <span className="text-xs text-muted">{d.combine.bagUsedLabel}</span>
      )}
    </button>
  )
}
