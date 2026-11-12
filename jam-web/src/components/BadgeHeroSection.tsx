import type { ReactNode } from 'react'
import SafeImage from '@/components/SafeImage'
import { RarityBadge } from '@ds/components/cards/RarityBadge'
import { BadgeLevelChip } from '@ds/components/cards/BadgeLevelChip'
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
 * MODULAR 신규 컴포넌트 아님 — [20260816_006] 선례에 따라 서비스 전용 div+Tailwind 유지.
 *
 * 티켓 20261112_1629: 배지 상세 페이지 밖(체크인 아이템 상세 시트)에서도 같은 카드를 쓰게 되어 `src/components/`로 옮겼다.
 * `size`로 바뀌는 것은 바깥 여백·카드 안쪽 여백·이미지 크기뿐이고 카드 마크업은 한 벌이다.
 */
/** `page`: 배지 상세 페이지(기본). `sheet`: 시트 안 — 바깥 여백은 호출부가 정하고, 카드 안쪽 여백 24 16, 이미지 176 */
export type BadgeHeroSize = 'page' | 'sheet'

const SIZE_STYLE = {
  page: { wrapper: 'relative z-10 px-4 pt-0 pb-5', card: 'p-6', imageBox: 'w-[200px] h-[200px]', imagePx: 200 },
  sheet: { wrapper: 'relative z-10', card: 'py-6 px-4', imageBox: 'w-44 h-44', imagePx: 176 },
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
  // 배경이 없는 배지는 기존과 동일하게 bg-surface 카드로 남는다(회귀 방지).
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
  // (티켓 20261015_2134).
  const onMedia = Boolean(backgroundAnimation || themed)

  return (
    // relative z-10 — 배지 상세화면의 고정 배경 레이어(z-index:0, 20260818_002/003)보다 항상
    // 위에서 그려지도록 승격. 승격하지 않으면 non-positioned 콘텐츠가 positioned 배경 레이어보다
    // 페인트 순서상 아래로 가려진다([20260818_002] 잔여 이슈, [20260818_003]에서 실색상 적용과
    // 함께 수정).
    // 아래 여백 pb-5(20px)는 다른 화면의 카드 사이 간격(`gap-5`)과 같다(2026-11-09 사용자 지시). 이전에는 이 아래 여백 32px에
    // 다음 영역의 위 여백 32px가 겹쳐 카드와 «획득 조건» 카드 사이가 64px였다.
    <div className={sizeStyle.wrapper}>
      {/* [20260901_1944] 애니메이션 배경은 이 카드 안에만 그린다 — overflow-hidden으로 라운드 안에
          가두고, 캔버스는 절대배치 최하단(z-0)에 두어 이미지·이름은 그 위(z-10)에 그대로 남는다.
          애니메이션이 카드 배경 자체가 되므로 bg-surface는 깔지 않는다.
          [20260917_1211] 카드 전체(이미지+등급칩+이름+설명)를 한 카드로 묶는다 — 이전에는
          이미지 서브블록만 aspect-square였고 설명은 카드 밖에 별도 문단으로 있었다.
          2026-11-09 사용자 지시로 카드의 1:1 비율(aspect-square) 고정을 풀었다 — 카드 높이는 내용(이미지 200 +
          칩·이름 + 설명 줄 수)이 정하고, 이미지와 글자 블록 사이는 gap-4가 띄운다. */}
      <div
        className={[
          `relative overflow-hidden w-full rounded-2xl flex flex-col items-center gap-4 ${sizeStyle.card}`,
          // 테마·애니메이션 배경이 없을 때만 카드 면(--card-bg)이고 외곽선은 없다(티켓 20261107_2203)
          backgroundAnimation || themed ? 'bg-transparent' : 'bg-card-bg',
        ].join(' ')}
        // 애니메이션 모드의 첫 페인트 폴백 — 캔버스는 클라이언트에서 컨텍스트를 얻은 뒤에야
        // 그려지고, `getContext('2d')`가 null이면 영영 비어 있다. 파라미터가 이미 서버 컴포넌트에
        // 있으므로 같은 배경색을 인라인으로 미리 깔아둔다(영상 배경의 poster와 같은 역할, 추가
        // 비용 0). 캔버스는 그 위로 페이드 인한다.
        style={backgroundAnimation ? { backgroundColor: backgroundAnimation.bgColor } : undefined}
      >
        {backgroundAnimation && <BlobAnimationBackground params={backgroundAnimation} />}
        <div className="relative z-10 flex-shrink-0 flex items-center justify-center">
          {imageSlot !== undefined ? (
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
          )}
        </div>
        {/* [20260917_1245-보완] 등급칩+이름과 설명을 하나의 flex-1 그룹으로 묶어 카드 하단
            쪽에 함께 붙인다. 이전에는 이름 블록이 이미지 바로 아래(flex-shrink-0)에 고정되고
            설명만 남은 공간을 차지해, 설명 쪽 정렬을 아무리 바꿔도 "이름이 이미지에 붙어
            있고 설명만 멀리 떨어진" 모양이 안 바뀌었다 — 사용자 피드백대로 이름 쪽을
            아래로 옮겨야 두 텍스트가 실제로 가까워진다. */}
        <div
          className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-end gap-1 overflow-hidden"
          style={cardTextStyle}
        >
          <div className="flex-shrink-0 flex flex-col items-center gap-1">
            {/* v5는 배지 종류가 셋이고 레벨형은 `rarity`가 NULL이다(193종). `RarityBadge`는
                미지 값을 그리지 않으므로(티켓 20260905_0036) 그대로 넘기면 **칩이 조용히
                사라진다** — 상세 화면에서 등급/레벨을 알 수 없게 된다.
                배지 카드(`BadgeGridCard`)가 같은 분기를 쓴다(티켓 20260905_0037). */}
            {chipExtra ? (
              <div className="flex items-center gap-2">
                {badge.level != null ? <BadgeLevelChip level={badge.level} size="md" /> : <RarityBadge rarity={badge.rarity ?? undefined} size="md" />}
                {chipExtra}
              </div>
            ) : badge.level != null ? (
              <BadgeLevelChip level={badge.level} size="md" />
            ) : (
              <RarityBadge rarity={badge.rarity ?? undefined} size="md" />
            )}
            <h1 className={`text-3xl font-bold text-center ${onMedia ? 'text-snow' : 'text-foreground'}`}>{titleNode ?? badge.name}</h1>
          </div>
          {descriptionNode ? (
            // 설명 내용을 호출부가 정한다(잠긴 상세의 SwapText). 문단 모양은 아래 문장 나열과 같다.
            <div className="flex-shrink-0 flex flex-col gap-0.5">
              <p className={`text-base text-center text-wrap! ${onMedia ? 'text-snow' : 'text-muted'}`}>{descriptionNode}</p>
            </div>
          ) : badge.description && (
            // [20260917_1211] 설명을 카드 안으로 통합. 마침표(문장 종결) 기준으로 나눠 각 문장을
            // 별도 줄로 그린다 — 원본 `\n`에만 반응하던 `whitespace-pre-line`으로는 실제 배지
            // 설명(마침표로 끝나는 문장 나열)에서 줄바꿈이 거의 일어나지 않았다.
            // 설명 문단은 전역 `p { text-wrap: balance }`를 끄고 일반 줄바꿈으로 둔다(2026-11-09 사용자 지시). 전역 규칙이 레이어 밖(globals.css)이라
            // 레이어 안의 유틸리티(`text-wrap`)는 지므로 중요도 접미사(`!`)를 붙인다.
            <div className="flex-shrink-0 flex flex-col gap-0.5">
              {splitDescriptionSentences(badge.description).map((sentence, index) => (
                <p
                  key={index}
                  className={`text-base text-center text-wrap! ${onMedia ? 'text-snow' : 'text-muted'}`}
                >
                  {sentence}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
