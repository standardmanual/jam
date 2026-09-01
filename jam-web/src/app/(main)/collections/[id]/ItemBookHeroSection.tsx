import { BookIcon } from '@/components/ui/icons'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import BlobAnimationBackground from '@/components/BlobAnimationBackground'
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

  return (
    <>
      {/* 대표 이미지 — 미션 상세와 동일한 카드 형식.
          [20260901_1944] 애니메이션 배경은 이 카드 안에만 그린다(기존 overflow-hidden이 라운드
          클리핑을 그대로 담당한다). 이미지는 캔버스 위(z-10)에 남는다. */}
      <div className="relative w-full aspect-square rounded-[var(--radius-cards)] overflow-hidden flex items-center justify-center">
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
        <h1
          className="font-bold"
          style={{ color: '#FFFFFF', fontSize: '36px', lineHeight: '1.2' }}
        >
          {book.name}
        </h1>
        {book.description && (
          <p style={{ color: TEXT_SECONDARY, fontSize: '13px', lineHeight: '1.4' }}>
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
