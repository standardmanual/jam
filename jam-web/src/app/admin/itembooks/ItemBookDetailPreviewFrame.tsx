'use client'

import type { CSSProperties, ReactNode, Ref } from 'react'
import TopNav from '@/components/ui/TopNav'
import ItemBookHeroSection, {
  type ItemBookHeroSectionBook,
} from '@/app/(main)/collections/[id]/ItemBookHeroSection'
import { getBadgeThemedTextStyle } from '@/lib/badgeBackgroundTheme'
import { SERVICE_WIDTH } from '@/lib/backgroundGenerator/types'
import { d } from '@/lib/i18n'

/** 미리보기 프레임 높이 — 실제 서비스 기준 단말(430×932)의 뷰포트 높이 */
const PREVIEW_HEIGHT = 932

/** 라이브 합성 노드(430×430 정사각)를 세로로 몇 번 반복해야 프레임을 채우는지 */
const PREVIEW_TILE_COUNT = Math.ceil(PREVIEW_HEIGHT / SERVICE_WIDTH)

interface ItemBookDetailPreviewFrameProps {
  /** ItemBookHeroSection이 요구하는 컬렉션 shape 그대로 — 실제 화면과 동일한 컴포넌트에 넘긴다 */
  book: ItemBookHeroSectionBook
  /** 배경 레이어에 실제로 무언가 그려지는 상태인지 — TopNav·본문 투명 처리 여부를 좌우 */
  themed: boolean
  /** 배경 레이어에 적용할 스타일(단색 모드) — 실제 화면과 동일한 계산기 결과를 그대로 받는다 */
  backgroundLayerStyle: CSSProperties
  /** 저장(bake) 대상이 되는 배경 레이어 DOM 참조 */
  backgroundLayerRef: Ref<HTMLDivElement>
  /** 제너레이터 라이브 합성 노드(필터 캔버스 또는 평면화 img). 없으면 배경 레이어는 비어 있다 */
  liveNode?: ReactNode
}

/**
 * 어드민 배경 제너레이터용 컬렉션(item_book) 상세화면 미리보기 프레임 — [20260819_014]
 *
 * 배지 상세 프리뷰(`BadgeDetailPreviewFrame`, 티켓 20260819_011)와 동일한 이유로 만든다 — 어드민
 * 미리보기가 실제 `/itembooks/[id]` 화면과 다른 마크업이면 저작 도구로 신뢰할 수 없다. 실제
 * 화면과 같은 `TopNav` + `ItemBookHeroSection` 컴포넌트를 그대로 재사용하고, 진행도 바 등
 * 유저별 동적 데이터가 필요한 영역은 프리뷰용 고정값(0/0)으로 채운다.
 *
 * 실제 화면의 스택 구조를 그대로 재현한다:
 *   1) 프레임 바닥 = bg-surface (앱 컬럼 기본 배경)
 *   2) 배경 레이어 = 실제의 position:fixed 고정 레이어 대응(스크롤에 끌려가지 않도록 본문 스크롤
 *      컨테이너 바깥에 형제로 배치)
 *   3) 본문 = z-10 스크롤 컨테이너. TopNav·본문은 배경이 있으면 투명해 레이어가 비쳐 보인다.
 *
 * 프레임 폭은 실제 앱 컬럼 폭(SERVICE_WIDTH=430px), 높이는 기준 단말 뷰포트 높이(932px)로 고정.
 */
export default function ItemBookDetailPreviewFrame({
  book,
  themed,
  backgroundLayerStyle,
  backgroundLayerRef,
  liveNode,
}: ItemBookDetailPreviewFrameProps) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[#e5e7eb] bg-surface text-text"
      style={{ width: SERVICE_WIDTH, height: PREVIEW_HEIGHT }}
    >
      {/* 배경 레이어 — 실제 화면의 고정 배경 레이어와 동일 역할(z-0, 클릭 통과) */}
      <div
        aria-hidden="true"
        ref={backgroundLayerRef}
        className="absolute inset-0 z-0 pointer-events-none"
        style={backgroundLayerStyle}
      >
        {/* 제너레이터 라이브 노드는 430×430 정사각 DOM 노드라 CSS background-repeat를 쓸 수 없다.
            저장 후 실제 화면은 `backgroundSize: 100% auto` + repeat로 세로 반복되므로, 미리보기도
            같은 규칙(가로 100%, 세로 반복)이 되도록 정사각 슬롯을 세로로 쌓는다. */}
        {liveNode &&
          Array.from({ length: PREVIEW_TILE_COUNT }, (_, i) => (
            <div
              key={i}
              className="w-full aspect-square [&_canvas]:!w-full [&_canvas]:!h-full [&_img]:!w-full [&_img]:!h-full [&_img]:!object-fill"
            >
              {liveNode}
            </div>
          ))}
      </div>

      {/* 본문 — 실제 화면과 동일하게 z-10, 세로 스크롤 */}
      <div className="absolute inset-0 z-10 overflow-y-auto" style={getBadgeThemedTextStyle(themed)}>
        {/* 미리보기에서 뒤로가기가 눌려 작성 중인 폼을 벗어나지 않도록 클릭만 막는다(스크롤은 가능) */}
        <div className="pointer-events-none">
          <TopNav
            title={d.common.back}
            headerStyle={{ background: themed ? 'transparent' : 'var(--color-surface)', color: '#FFFFFF' }}
          />
        </div>

        <div className="relative z-10 flex flex-col px-4 pt-4 pb-10 gap-3">
          <ItemBookHeroSection book={book} slottedCount={0} totalBadgeCount={0} />
        </div>
      </div>
    </div>
  )
}
