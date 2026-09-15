import { BookIcon } from '@/components/ui/icons'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import BlobAnimationBackground from '@/components/BlobAnimationBackground'
import { getBadgeThemedTextStyle } from '@/lib/badgeBackgroundTheme'
import type { BlobAnimationParams } from '@/lib/blobAnimation'

const TEXT_SECONDARY = '#B2B2B2'

export interface ItemBookHeroSectionBook {
  name: string
  description: string
  image_url: string | null
}

interface ItemBookHeroSectionProps {
  book: ItemBookHeroSectionBook
  /** 슬롯팅 완료 개수 */
  slottedCount: number
  /** 전체 배지 개수 (0이면 진행도 바가 0%로 표시됨) */
  totalBadgeCount: number
  /**
   * 대표 이미지 카드 **안**에서 실행할 배경 애니메이션 파라미터. — [20260901_1944]
   * 배지 상세(`BadgeHeroSection`)와 동일한 규약 — row에서 값을 뽑는 책임은 호출부에 있다.
   */
  backgroundAnimation?: BlobAnimationParams | null
}

/**
 * 컬렉션 상세화면의 대표 이미지+이름 카드 + 설명 + 진행도 바 — [20260819_014]
 *
 * `/itembooks/[id]/page.tsx`(실제 서비스 화면)에서 분리해 어드민 배경 프리뷰 프레임
 * (`ItemBookDetailPreviewFrame.tsx`)이 동일 컴포넌트를 재사용하도록 한다. 배지 상세화면의
 * `BadgeHeroSection` 패턴과 동일한 이유 — 저작 화면 미리보기가 실제 화면과 마크업이 달라지는
 * 사고를 반복하지 않기 위함(티켓 20260819_011에서 확정한 원칙).
 *
 * [20260915_2006] 이미지+이름을 `BadgeHeroSection`과 동일하게 하나의 카드(bg-surface-elevated,
 * rounded-[var(--radius-cards)], p-6)로 묶고, 설명은 카드 밖(mt-6)으로 분리했다. 대표 이미지도
 * 배지 이미지와 동일한 200x200px 고정 크기로 맞춰 두 상세화면의 구조를 통일한다.
 *
 * 카드+설명을 outer wrapper 하나로 감싼 이유(게이트 리뷰 재작업) — 이 컴포넌트는 부모
 * (`collections/[id]/page.tsx`)의 `flex flex-col gap-3` 컨테이너에 직접 놓인다. 카드 div와
 * 설명 p를 Fragment로 나란히 반환하면 부모의 gap-3(12px)가 둘 사이에도 적용돼, 설명 자체의
 * mt-6(24px)과 합산된 36px로 벌어져 배지 상세(mt-6 단독 24px)보다 넓어진다. outer wrapper로
 * 감싸면 부모 gap은 wrapper 앞뒤에만 적용되고, wrapper 내부 카드~설명 간격은 mt-6만으로
 * 결정된다. 진행도 바는 이 wrapper 밖에 남겨 기존처럼 부모 gap-3의 리듬을 그대로 유지한다.
 */
export default function ItemBookHeroSection({ book, slottedCount, totalBadgeCount, backgroundAnimation }: ItemBookHeroSectionProps) {
  const pct = totalBadgeCount > 0 ? Math.round((slottedCount / totalBadgeCount) * 100) : 0

  // [20260901_1944] 애니메이션 모드에서는 전체 배경 레이어가 비므로 페이지가 걸던 텍스트 그림자
  // 보정도 함께 꺼진다. 배지 상세(`BadgeHeroSection`)와 동일하게, 카드 주변 텍스트에만 같은
  // 보정을 되살려 이미지·영상 배경 모드와 가독성 조건을 맞춘다.
  const heroTextStyle = backgroundAnimation ? getBadgeThemedTextStyle(true) : undefined

  return (
    <>
      {/* 카드+설명 outer wrapper — 부모(flex flex-col gap-3)의 직속 자식은 이 div 하나뿐이라,
          부모 gap은 이 wrapper의 앞뒤에만 적용되고 내부 카드~설명 간격은 mt-6만으로 결정된다.
          진행도 바는 wrapper 밖에 남겨 기존 gap-3 리듬을 유지한다. */}
      <div>
        {/* 대표 이미지 + 이름 카드 — 배지 상세화면(BadgeHeroSection)과 동일 구조 [20260915_2006].
            [20260901_1944] 애니메이션 배경은 이 카드 안에만 그린다(overflow-hidden이 라운드
            클리핑을 담당). 이미지는 캔버스 위(z-10)에 남는다.
            인라인 배경색은 캔버스가 첫 프레임을 그리기 전(또는 2D 컨텍스트 실패 시)의 폴백이다 —
            영상 배경의 poster와 같은 역할. */}
        <div
          className={[
            'relative overflow-hidden w-full aspect-square rounded-[var(--radius-cards)] flex flex-col p-6',
            backgroundAnimation ? 'bg-transparent' : 'bg-surface-elevated',
          ].join(' ')}
          style={backgroundAnimation ? { backgroundColor: backgroundAnimation.bgColor } : undefined}
        >
          {backgroundAnimation && <BlobAnimationBackground params={backgroundAnimation} />}
          <div className="relative z-10 flex-1 flex items-center justify-center">
            {book.image_url ? (
              <div className="w-[200px] h-[200px] flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={book.image_url}
                  alt={book.name}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <BookIcon className="w-28 h-28" style={{ color: '#AAAAAA' }} />
            )}
          </div>
          <div className="relative z-10 flex flex-col items-center gap-2 pt-4" style={heroTextStyle}>
            {/* 자간은 한때 애니메이션 모드에서 0.01em을 더했으나 되돌렸다 — 큰 표제에는 오히려
                negative tracking이 맞다(apple-design §15). 가독성은 그림자만으로 확보한다.
                [20260915_2006] font-size/line-height를 배지 상세와 동일한
                --text-heading-sm/--leading-heading-sm 토큰으로 통일했다(기존 하드코딩 24px).
                색상(#FFFFFF)은 유지 — 컬렉션 상세는 배경 유무와 무관하게 항상 테마 배경 위에
                놓여 배지 상세의 text-text(조건부 흰/검) 분기와 전제가 다르므로 이번 티켓
                범위(구조 통일) 밖으로 판단했다. */}
            <h1
              className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] font-bold text-center"
              style={{ color: '#FFFFFF' }}
            >
              {book.name}
            </h1>
          </div>
        </div>

        {/* 설명 — 카드 바깥(페이지 배경 위). 애니메이션 모드에서는 페이지가 걸던 그림자 보정이
            꺼지므로 이미지·영상 배경 모드와 동일한 보정을 여기서 유지한다. */}
        {book.description && (
          <p
            className="text-center mt-6 whitespace-pre-line"
            style={{ color: TEXT_SECONDARY, fontSize: '13px', lineHeight: '1.4', ...heroTextStyle }}
          >
            {book.description}
          </p>
        )}
      </div>

      {/* 진행도 바 + 카운트 인라인 */}
      <div className="flex items-center gap-3">
        <ProgressBar percent={pct} />
        <span style={{ color: 'var(--color-primary)', fontSize: '13px', lineHeight: '1', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {slottedCount}/{totalBadgeCount}
        </span>
      </div>
    </>
  )
}
