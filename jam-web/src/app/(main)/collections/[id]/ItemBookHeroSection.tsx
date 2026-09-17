import { BookIcon } from '@/components/ui/icons'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import BlobAnimationBackground from '@/components/BlobAnimationBackground'
import { getBadgeThemedTextStyle } from '@/lib/badgeBackgroundTheme'
import type { BlobAnimationParams } from '@/lib/blobAnimation'
// [20260917_1303] 배지 상세(BadgeHeroSection)와 동일한 마침표 기준 줄바꿈 로직을 공용 유틸에서
// 가져와 쓴다(코드 중복 방지).
import { splitDescriptionSentences } from '@/lib/splitDescriptionSentences'

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
 * 컬렉션 상세화면의 대표 이미지+이름+설명 카드 — [20260819_014]
 *
 * `/itembooks/[id]/page.tsx`(실제 서비스 화면)에서 분리해 어드민 배경 프리뷰 프레임
 * (`ItemBookDetailPreviewFrame.tsx`)이 동일 컴포넌트를 재사용하도록 한다. 배지 상세화면의
 * `BadgeHeroSection` 패턴과 동일한 이유 — 저작 화면 미리보기가 실제 화면과 마크업이 달라지는
 * 사고를 반복하지 않기 위함(티켓 20260819_011에서 확정한 원칙).
 *
 * [20260917_1303] `BadgeHeroSection`(20260917_1211/1245)과 **완전히 동일한 카드 구조**로
 * 맞춘다 — 카드 전체를 1:1(aspect-square)로 묶고, 이미지는 200×200 고정(flex-shrink-0), 이름
 * +설명은 하나의 `flex-1 justify-end` 그룹으로 묶어 카드 하단에 붙인다. 설명도 마침표 기준
 * 자동 줄바꿈(`splitDescriptionSentences`)을 그대로 적용한다. 진행도 바는 이 카드의 대상이
 * 아니다(사용자 명시 지시) — 카드 밖, 부모(`page.tsx`)의 별도 렌더링으로 유지한다.
 *
 * [20260917_1303-보완] 카드 배경 테두리(`border border-[var(--color-border)]`, 20260915_2006
 * 컨트라스트 보정용)는 사용자 확인 결과 배지 상세와 다르게 도드라져 보여 제거했다 — 두 상세화면의
 * 시각적 일치를 우선한다. 페이지 컨테이너 좌우 padding 차이(컬렉션 px-4=16px vs 배지
 * BadgeHeroSection 자체 px-6=24px)로 카드 폭도 달라 보였던 문제는 이 컴포넌트의 카드에
 * `mx-2`(8px)를 더해 16+8=24px로 맞췄다.
 */
export default function ItemBookHeroSection({ book, slottedCount, totalBadgeCount, backgroundAnimation }: ItemBookHeroSectionProps) {
  const pct = totalBadgeCount > 0 ? Math.round((slottedCount / totalBadgeCount) * 100) : 0

  // [20260901_1944] 애니메이션 모드에서는 전체 배경 레이어가 비므로 페이지가 걸던 텍스트 그림자
  // 보정도 함께 꺼진다. 배지 상세(`BadgeHeroSection`)와 동일하게, 카드 안 텍스트에만 같은
  // 보정을 되살려 이미지·영상 배경 모드와 가독성 조건을 맞춘다.
  const cardTextStyle = backgroundAnimation ? getBadgeThemedTextStyle(true) : undefined

  return (
    <>
      {/* 대표 이미지+이름+설명 카드 — 배지 상세화면(BadgeHeroSection)과 동일 구조 [20260917_1303].
          [20260901_1944] 애니메이션 배경은 이 카드 안에만 그린다(overflow-hidden이 라운드
          클리핑을 담당). 이미지·텍스트는 캔버스 위(z-10)에 남는다.
          인라인 배경색은 캔버스가 첫 프레임을 그리기 전(또는 2D 컨텍스트 실패 시)의 폴백이다 —
          영상 배경의 poster와 같은 역할. */}
      <div
        className={[
          // [20260917_1303-보완] 페이지 컨테이너가 px-4(16px)라 배지 상세(BadgeHeroSection의
          // 자체 px-6=24px)보다 카드가 더 넓어 보였다 — mx-2(8px)를 더해 16+8=24px로 맞춘다.
          // 테두리도 사용자 확인 결과 배지와 다르게 보여 제거했다 — 20260915_2006에서 남겼던
          // 컨트라스트 보정용 테두리보다 두 상세화면의 시각적 일치를 우선한다.
          // `w-full`은 부모 폭의 100%로 고정되므로 여기에 `mx-2`를 더하면 박스가 총
          // 100%+16px가 되어 오른쪽으로 넘쳐 좌우 여백이 달라 보였다(사용자 확인). 너비 자체를
          // `calc(100%-16px)`로 줄여야 마진을 더해도 부모 폭 안에 대칭으로 들어간다.
          'relative overflow-hidden w-[calc(100%-16px)] aspect-square rounded-[var(--radius-cards)] flex flex-col items-center p-6 mx-2',
          backgroundAnimation ? 'bg-transparent' : 'bg-surface-elevated',
        ].join(' ')}
        style={backgroundAnimation ? { backgroundColor: backgroundAnimation.bgColor } : undefined}
      >
        {backgroundAnimation && <BlobAnimationBackground params={backgroundAnimation} />}
        <div className="relative z-10 flex-shrink-0 flex items-center justify-center">
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
        {/* 이름+설명을 하나의 flex-1 그룹으로 묶어 카드 하단 쪽에 함께 붙인다 —
            BadgeHeroSection(20260917_1245-보완)과 동일 구조. */}
        <div
          className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-end gap-1 overflow-hidden"
          style={cardTextStyle}
        >
          <div className="flex-shrink-0 flex flex-col items-center gap-1">
            <h1
              className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] font-bold text-center"
              style={{ color: '#FFFFFF' }}
            >
              {book.name}
            </h1>
          </div>
          {book.description && (
            // 설명을 카드 안으로 통합. 마침표(문장 종결) 기준으로 나눠 각 문장을 별도 줄로
            // 그린다 — BadgeHeroSection과 동일한 로직(splitDescriptionSentences).
            <div className="flex-shrink-0 flex flex-col gap-0.5">
              {splitDescriptionSentences(book.description).map((sentence, index) => (
                <p
                  key={index}
                  className="text-[length:var(--text-body)] text-[var(--color-text-secondary)] text-center leading-[var(--leading-body)]"
                >
                  {sentence}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 진행도 바 + 카운트 인라인 — 카드 밖에 유지(사용자 명시 지시). 카드~진행도 바 세로 간격을
          20px로 맞춘다 — 부모(page.tsx)의 `flex flex-col gap-3`(12px)를 직접 바꾸면 진행도 바
          다음에 오는 다른 형제 섹션과의 간격도 함께 바뀌므로, 이 래퍼에 보정 마진
          `mt-[var(--spacing-8)]`(8px)을 더해 12+8=20px를 만든다. [20260917_1303] */}
      {/* mx-2 — 위 카드에 추가한 mx-2와 좌우 폭을 맞춰, 카드보다 진행도 바가 더 넓어 보이는
          어긋남을 막는다. */}
      <div className="flex items-center gap-3 mt-[var(--spacing-8)] mx-2">
        <ProgressBar percent={pct} />
        <span style={{ color: 'var(--color-primary)', fontSize: '13px', lineHeight: '1', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {slottedCount}/{totalBadgeCount}
        </span>
      </div>
    </>
  )
}
