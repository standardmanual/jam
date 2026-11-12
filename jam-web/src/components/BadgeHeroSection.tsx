import type { ReactNode } from 'react'
import SafeImage from '@/components/SafeImage'
import { BadgeHeroSection as BadgeHeroCard } from '@ds/components/cards/BadgeHeroSection'
import { MedalIcon } from '@/components/ui/icons'
import type { BadgeRow } from '@/types/database'
import { getBadgeThemedTextStyle, hasBadgeBackgroundTheme } from '@/lib/badgeBackgroundTheme'
import BlobAnimationBackground from '@/components/BlobAnimationBackground'
import type { BlobAnimationParams } from '@/lib/blobAnimation'
// [20260917_1303] 마침표 기준 줄바꿈 로직을 공용 유틸로 추출 — 컬렉션 상세
// (`ItemBookHeroSection`)도 동일 로직을 쓴다(코드 중복 방지).
import { splitDescriptionSentences } from '@/lib/splitDescriptionSentences'

/**
 * 배지 상세화면 hero-section (item/poi/activity 3변형 공통) — [20260818_002]
 * 3중 복사돼 있던 마크업을 추출한 순수 리팩터링. 렌더링 결과는 기존과 동일해야 한다.
 *
 * 티켓 20261112_1818: 카드 마크업을 DS `cards/BadgeHeroSection`으로 승격했다. 이 파일은 그 DS 컴포넌트를 렌더하는 **어댑터**다 —
 * 서비스 전용 의존(SafeImage·BlobAnimationBackground·배경 테마 판정·텍스트 그림자 보정·설명 문장 나누기·BadgeRow 타입)을
 * 여기서 계산해 슬롯과 값으로 넘기고, 파일 이름과 props는 그대로라 호출부 5곳은 바뀌지 않는다. 마크업은 DS 한 곳에만 있다.
 *
 * 티켓 20261112_1629: 배지 상세 페이지 밖(체크인 아이템 상세 시트)에서도 같은 카드를 쓰게 되어 `src/components/`로 옮겼다.
 * `size`로 바뀌는 것은 바깥 여백·카드 안쪽 여백·이미지 크기뿐이고 카드 마크업은 한 벌이다.
 */
/** `page`: 배지 상세 페이지(기본). `sheet`: 시트 안 — 바깥 여백은 호출부가 정하고, 카드 안쪽 여백 24 16, 이미지 176 */
export type BadgeHeroSize = 'page' | 'sheet'

/** 기본 대표 이미지 상자 크기. 바깥·안쪽 여백은 DS가 `size`로 정한다 */
const SIZE_STYLE = {
  page: { imageBox: 'w-[200px] h-[200px]', imagePx: 200 },
  sheet: { imageBox: 'w-44 h-44', imagePx: 176 },
} as const

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
    /**
     * v5 레벨형 배지의 레벨(`rarity`가 NULL이고 `level`이 있다). 넘기면 등급 칩 대신
     * `BadgeLevelChip`을 그린다. **선택**이다 — 어드민 배경 미리보기·dev 샘플처럼
     * 실제 배지 레코드가 아닌 호출부가 있어 필수로 만들면 그쪽이 막힌다.
     */
    level?: number | null
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
  /**
   * 대표 이미지 자리를 통째로 바꾼다. 잠긴 아이템 배지 상세(`/inventory/[itemId]`)가 잠금 타일과 열린 뒤 그림의 크로스페이드를 여기에
   * 넣는다(2026-11-09 사용자 지시: 잠긴 상세가 일반 상세와 같은 카드를 쓴다). 없으면 `badge.image_url`을 그린다 — 기존 그대로다.
   */
  imageSlot?: ReactNode
  /** 등급·레벨 칩 옆에 더하는 칩(잠긴 상세의 «잠김» 칩). 없으면 칩 하나만 그린다 */
  chipExtra?: ReactNode
  /** 제목(h1) 안의 내용을 바꾼다(잠긴 상세의 `SwapText`). 없으면 `badge.name`이다 */
  titleNode?: ReactNode
  /** 설명 문단의 내용을 바꾼다(잠긴 상세의 `SwapText`). 없으면 `badge.description`을 마침표 기준으로 나눠 그린다 */
  descriptionNode?: ReactNode
  /** 놓이는 자리. 기본 `page`는 이전 출력과 같다. `sheet`는 바텀시트 안(체크인 아이템 상세)용이다 */
  size?: BadgeHeroSize
}

export default function BadgeHeroSection({ badge, hasEarned, themedBackground, backgroundAnimation, imageSlot, chipExtra, titleNode, descriptionNode, size = 'page' }: BadgeHeroSectionProps) {
  const sizeStyle = SIZE_STYLE[size]
  // [20260819_011] 배경은 상세화면의 고정 배경 레이어 "한 곳에서만" 그린다. hero 카드가 배경을
  // 한 번 더 그리면(기존 동작) 카드 박스와 레이어 박스의 비율이 달라 같은 이미지가 서로 다른
  // 배율로 두 번 잘려 이음매가 보였다. 그래서 여기서는 배경을 그리지 않고, 배경이 있을 때는
  // 카드를 투명하게 비워 아래 레이어가 그대로 비쳐 보이게 한다.
  // 배경이 없는 배지는 기존과 동일하게 흰 카드(--card-bg)로 남는다(회귀 방지).
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

  // 배경(블롭·테마)이 깔린 카드는 글자가 어두운 면 위에 놓이므로 --snow, 배경이 없는 흰 카드는
  // 새 글자색(--foreground·--muted)이다. 설명에는 muted 단계가 없어 배경 위에서는 둘 다 --snow다
  // (티켓 20261015_2134). 테마 판정 두 가지(전체 배경 `themed`, 카드 안 블롭 `backgroundAnimation`)가 모두 DS의 `onMedia`다.
  const onMedia = Boolean(backgroundAnimation || themed)

  // 대표 이미지: 호출부가 슬롯을 주면 그대로, 없으면 badge.image_url(SafeImage) → 없으면 MedalIcon.
  // 이미지 크기 규칙(200/176)이 DS가 아니라 여기 있는 이유는 슬롯을 통째로 바꿔도 크기 규칙이 숨지 않게 하기 위해서다.
  const resolvedImage =
    imageSlot !== undefined ? (
      imageSlot
    ) : badge.image_url ? (
      <div className={`${sizeStyle.imageBox} flex items-center justify-center`}>
        {/* 어드민 배지 상세 미리보기도 이 컴포넌트를 쓴다. 미등록 호스트 URL 하나로 화면 전체가
            오류 화면이 되지 않도록 SafeImage로 렌더한다(티켓 20260925_2319). */}
        <SafeImage
          src={badge.image_url}
          alt={badge.name}
          width={sizeStyle.imagePx}
          height={sizeStyle.imagePx}
          className={['object-contain w-full h-full', !hasEarned ? 'grayscale opacity-50' : ''].join(' ')}
        />
      </div>
    ) : (
      <MedalIcon className={['w-28 h-28', !hasEarned ? 'grayscale opacity-50' : ''].join(' ')} />
    )

  return (
    <BadgeHeroCard
      size={size}
      name={badge.name}
      rarity={badge.rarity}
      level={badge.level}
      // [20260917_1211] 설명을 마침표(문장 종결) 기준으로 나눠 각 문장을 별도 줄로 그린다. 나누기는 서비스 유틸 몫이라 여기서 한다.
      descriptionLines={badge.description ? splitDescriptionSentences(badge.description) : undefined}
      descriptionNode={descriptionNode}
      titleNode={titleNode}
      chipExtra={chipExtra}
      imageSlot={resolvedImage}
      // [20260901_1944] 애니메이션 배경은 이 카드 안에만 그린다(DS가 z-0 자리를 내준다). 첫 페인트 폴백 색은 파라미터에서 미리 깐다.
      backgroundSlot={backgroundAnimation ? <BlobAnimationBackground params={backgroundAnimation} /> : undefined}
      backgroundColor={backgroundAnimation?.bgColor}
      onMedia={onMedia}
      textStyle={cardTextStyle}
    />
  )
}
