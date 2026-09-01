import Image from 'next/image'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { MedalIcon } from '@/components/ui/icons'
import type { BadgeRow } from '@/types/database'
import { getBadgeThemedTextStyle, hasBadgeBackgroundTheme } from '@/lib/badgeBackgroundTheme'
import BlobAnimationBackground from '@/components/BlobAnimationBackground'
import type { BlobAnimationParams } from '@/lib/blobAnimation'

/**
 * 배지 상세화면 hero-section (item/poi/activity 3변형 공통) — [20260818_002]
 * 3중 복사돼 있던 마크업을 추출한 순수 리팩터링. 렌더링 결과는 기존과 동일해야 한다.
 * MODULAR 신규 컴포넌트 아님 — [20260816_006] 선례에 따라 서비스 전용 div+Tailwind 유지.
 */
interface BadgeHeroSectionProps {
  /**
   * [20260901_1944] `background_animation`을 **필수**로 포함한다 — 이 필드가 빠져 있으면 아래
   * `hasBadgeBackgroundTheme(badge)`가 애니메이션 분기를 타지 못해, "무엇을 배경으로 그릴지의
   * 판단은 `badgeBackgroundTheme.ts` 한 곳"이라는 원칙이 이 컴포넌트에서만 깨진다.
   *
   * `BadgeRow`에서 Pick하지 않고 `unknown`으로 따로 선언하는 이유는, 이 값이 jsonb 원본이고
   * 파싱·검증 책임이 전적으로 `badgeBackgroundTheme.ts`(→ `parseBlobAnimation`)에 있기 때문이다.
   * `BackgroundThemeSource`와 동일한 규약이라 어드민 미리보기처럼 아직 저장 전인 편집 중
   * 파라미터도 그대로 넘길 수 있다.
   */
  badge: Pick<BadgeRow, 'image_url' | 'name' | 'rarity' | 'description' | 'background_color' | 'background_shader_id' | 'background_image_url'> & {
    background_animation: unknown
  }
  hasEarned: boolean
  /**
   * 배경 테마가 깔린 화면인지 강제로 지정한다(미지정 시 badge의 배경 필드로 판정).
   * 어드민 배경 제너레이터 미리보기처럼 배지 레코드에는 아직 배경값이 없지만 화면상으로는
   * 배경 레이어가 이미 깔려 있는 경우에만 사용한다. — [20260819_011]
   */
  themedBackground?: boolean
  /**
   * 이미지 카드 **안**에서 실행할 배경 애니메이션 파라미터. — [20260901_1944]
   * 상세화면 전체를 덮는 고정 배경 레이어와는 별개의 렌더링 지점이라, 배지 row에서 값을 뽑는
   * 책임은 호출부(`getBadgeBackgroundAnimation`)에 두고 여기서는 그리기만 한다. 어드민 저작
   * 미리보기는 아직 저장되지 않은 편집 중 파라미터를 그대로 넘긴다.
   */
  backgroundAnimation?: BlobAnimationParams | null
}

export default function BadgeHeroSection({ badge, hasEarned, themedBackground, backgroundAnimation }: BadgeHeroSectionProps) {
  // [20260819_011] 배경은 상세화면의 고정 배경 레이어 "한 곳에서만" 그린다. hero 카드가 배경을
  // 한 번 더 그리면(기존 동작) 카드 박스와 레이어 박스의 비율이 달라 같은 이미지가 서로 다른
  // 배율로 두 번 잘려 이음매가 보였다. 그래서 여기서는 배경을 그리지 않고, 배경이 있을 때는
  // 카드를 투명하게 비워 아래 레이어가 그대로 비쳐 보이게 한다.
  // 배경이 없는 배지는 기존과 동일하게 bg-surface-elevated 카드로 남는다(회귀 방지).
  const themed = themedBackground ?? hasBadgeBackgroundTheme(badge)

  // [20260901_1944] 애니메이션 모드에서는 `themed`가 false다(전체 배경 레이어를 비우므로) —
  // 그래서 페이지가 걸어주는 텍스트 그림자 보정도 함께 꺼진다. 그런데 카드 안 텍스트는 오히려
  // 밝은 색이 섞인 블롭 위에 놓이므로, `hasBadgeBackgroundTheme`의 의미("전체 배경 레이어에
  // 무언가 그려지는가")는 그대로 두고 이 카드의 텍스트 블록에만 같은 보정을 되살린다.
  //
  // 자간(`letter-spacing: 0.01em`)은 한때 여기에 함께 걸었으나 되돌렸다 — 상속 속성이라 볼드
  // 제목뿐 아니라 `RarityBadge` 라벨까지 벌어졌고, 큰 표제에는 오히려 negative tracking이 맞다
  // (apple-design §15). 가독성은 그림자만으로 확보한다.
  const cardTextStyle = backgroundAnimation ? getBadgeThemedTextStyle(true) : undefined

  return (
    // relative z-10 — 배지 상세화면의 고정 배경 레이어(z-index:0, 20260818_002/003)보다 항상
    // 위에서 그려지도록 승격. 승격하지 않으면 non-positioned 콘텐츠가 positioned 배경 레이어보다
    // 페인트 순서상 아래로 가려진다([20260818_002] 잔여 이슈, [20260818_003]에서 실색상 적용과
    // 함께 수정).
    <div className="relative z-10 px-6 pt-0 pb-[32px]">
      {/* [20260901_1944] 애니메이션 배경은 이 카드 안에만 그린다 — overflow-hidden으로 라운드 안에
          가두고, 캔버스는 절대배치 최하단(z-0)에 두어 이미지·이름은 그 위(z-10)에 그대로 남는다.
          애니메이션이 카드 배경 자체가 되므로 bg-surface-elevated는 깔지 않는다. */}
      <div
        className={[
          'relative overflow-hidden w-full aspect-square rounded-[var(--radius-cards)] flex flex-col p-6',
          backgroundAnimation || themed ? 'bg-transparent' : 'bg-surface-elevated',
        ].join(' ')}
        // 애니메이션 모드의 첫 페인트 폴백 — 캔버스는 클라이언트에서 컨텍스트를 얻은 뒤에야
        // 그려지고, `getContext('2d')`가 null이면 영영 비어 있다. 파라미터가 이미 서버 컴포넌트에
        // 있으므로 같은 배경색을 인라인으로 미리 깔아둔다(영상 배경의 poster와 같은 역할, 추가
        // 비용 0). 캔버스는 그 위로 페이드 인한다.
        style={backgroundAnimation ? { backgroundColor: backgroundAnimation.bgColor } : undefined}
      >
        {backgroundAnimation && <BlobAnimationBackground params={backgroundAnimation} />}
        <div className="relative z-10 flex-1 flex items-center justify-center">
          {badge.image_url ? (
            <div className="w-[200px] h-[200px] flex items-center justify-center">
              <Image
                src={badge.image_url}
                alt={badge.name}
                width={200}
                height={200}
                className={['object-contain w-full h-full', !hasEarned ? 'grayscale opacity-50' : ''].join(' ')}
              />
            </div>
          ) : (
            <MedalIcon className={['w-28 h-28', !hasEarned ? 'grayscale opacity-50' : ''].join(' ')} />
          )}
        </div>
        <div className="relative z-10 flex flex-col items-center gap-2 pt-4" style={cardTextStyle}>
          <RarityBadge rarity={badge.rarity} />
          <h1 className="text-[length:var(--text-heading-sm)] font-bold text-text text-center leading-[var(--leading-heading-sm)]">{badge.name}</h1>
        </div>
      </div>
      {badge.description && (
        // 설명은 카드 바깥(페이지 배경 위)이지만, 애니메이션 모드에서는 페이지가 걸던 그림자
        // 보정이 꺼지므로 이미지·영상 배경 모드와 동일한 보정을 여기서 유지한다.
        <p
          className="text-[length:var(--text-body)] text-[var(--color-text-secondary)] text-center leading-[var(--leading-body)] mt-6"
          style={backgroundAnimation ? getBadgeThemedTextStyle(true) : undefined}
        >
          {badge.description}
        </p>
      )}
    </div>
  )
}
