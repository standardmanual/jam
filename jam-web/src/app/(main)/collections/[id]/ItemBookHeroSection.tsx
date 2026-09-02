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
 * 컬렉션 상세화면의 대표 이미지 + 이름/설명 + 진행도 바 — [20260819_014]
 *
 * `/itembooks/[id]/page.tsx`(실제 서비스 화면)에서 분리해 어드민 배경 프리뷰 프레임
 * (`ItemBookDetailPreviewFrame.tsx`)이 동일 컴포넌트를 재사용하도록 한다. 배지 상세화면의
 * `BadgeHeroSection` 패턴과 동일한 이유 — 저작 화면 미리보기가 실제 화면과 마크업이 달라지는
 * 사고를 반복하지 않기 위함(티켓 20260819_011에서 확정한 원칙).
 */
export default function ItemBookHeroSection({ book, slottedCount, totalBadgeCount, backgroundAnimation }: ItemBookHeroSectionProps) {
  const pct = totalBadgeCount > 0 ? Math.round((slottedCount / totalBadgeCount) * 100) : 0

  // [20260901_1944] 애니메이션 모드에서는 전체 배경 레이어가 비므로 페이지가 걸던 텍스트 그림자
  // 보정도 함께 꺼진다. 배지 상세(`BadgeHeroSection`)와 동일하게, 카드 주변 텍스트에만 같은
  // 보정을 되살려 이미지·영상 배경 모드와 가독성 조건을 맞춘다.
  const heroTextStyle = backgroundAnimation ? getBadgeThemedTextStyle(true) : undefined

  return (
    <>
      {/* 대표 이미지 — 미션 상세와 동일한 카드 형식.
          [20260901_1944] 애니메이션 배경은 이 카드 안에만 그린다(기존 overflow-hidden이 라운드
          클리핑을 그대로 담당한다). 이미지는 캔버스 위(z-10)에 남는다.
          인라인 배경색은 캔버스가 첫 프레임을 그리기 전(또는 2D 컨텍스트 실패 시)의 폴백이다 —
          영상 배경의 poster와 같은 역할. */}
      <div
        className="relative w-full aspect-square rounded-[var(--radius-cards)] overflow-hidden flex items-center justify-center"
        style={backgroundAnimation ? { backgroundColor: backgroundAnimation.bgColor } : undefined}
      >
        {backgroundAnimation && <BlobAnimationBackground params={backgroundAnimation} />}
        {book.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.image_url}
            alt={book.name}
            className="relative z-10 w-full h-full object-contain"
          />
        ) : (
          <BookIcon className="relative z-10 w-16 h-16" style={{ color: '#AAAAAA' }} />
        )}
      </div>

      {/* 히어로 섹션 */}
      <div className="flex flex-col items-center gap-3 text-center">
        {/* 자간은 한때 애니메이션 모드에서 0.01em을 더했으나 되돌렸다 — 36px 표제에는 오히려
            negative tracking이 맞다(apple-design §15). 가독성은 그림자만으로 확보한다. */}
        <h1
          className="font-bold"
          style={{ color: '#FFFFFF', fontSize: '36px', lineHeight: '1.2', ...heroTextStyle }}
        >
          {book.name}
        </h1>
        {book.description && (
          <p style={{ color: TEXT_SECONDARY, fontSize: '13px', lineHeight: '1.4', whiteSpace: 'pre-line', ...heroTextStyle }}>
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
