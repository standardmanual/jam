'use client'

import type { ComponentProps, CSSProperties, ReactNode, Ref } from 'react'
import TopNav from '@/components/ui/TopNav'
import Footer from '@/components/ui/Footer'
import BadgeHeroSection from '@/app/(main)/badges/[id]/BadgeHeroSection'
import BadgeConditionCard from '@/app/(main)/badges/[id]/BadgeConditionCard'
import { getBadgeThemedTextStyle } from '@/lib/badgeBackgroundTheme'
import type { BlobAnimationParams } from '@/lib/blobAnimation'
import { SERVICE_WIDTH } from '@/lib/backgroundGenerator/types'
import { d } from '@/lib/i18n'

/** 미리보기 프레임 높이 — 실제 서비스 기준 단말(430×932)의 뷰포트 높이 */
const PREVIEW_HEIGHT = 932

/** 라이브 합성 노드(430×430 정사각)를 세로로 몇 번 반복해야 프레임을 채우는지 */
const PREVIEW_TILE_COUNT = Math.ceil(PREVIEW_HEIGHT / SERVICE_WIDTH)

interface BadgeDetailPreviewFrameProps {
  /** hero-section이 요구하는 배지 shape 그대로 — 실제 화면과 동일한 컴포넌트에 그대로 넘긴다 */
  badge: ComponentProps<typeof BadgeHeroSection>['badge']
  /** 배경 레이어에 실제로 무언가 그려지는 상태인지 — TopNav·Hero 카드 투명 처리 여부를 좌우 */
  themed: boolean
  /** 배경 레이어에 적용할 스타일(단색 모드) — 실제 화면과 동일한 계산기 결과를 그대로 받는다 */
  backgroundLayerStyle: CSSProperties
  /** 저장(bake) 대상이 되는 배경 레이어 DOM 참조 */
  backgroundLayerRef: Ref<HTMLDivElement>
  /** 제너레이터 라이브 합성 노드(필터 캔버스 또는 평면화 img). 없으면 배경 레이어는 비어 있다 */
  liveNode?: ReactNode
  /** 이미지 카드 안에서 실행할 애니메이션 파라미터 — 실제 화면과 동일하게 Hero 카드로 그대로 넘긴다. [20260901_1944] */
  backgroundAnimation?: BlobAnimationParams | null
  /** 본문 "획득 조건" 카드에 표시할 문구 */
  conditionText: string
}

/**
 * 어드민 배경 제너레이터용 배지 상세화면 미리보기 프레임 — [20260819_011]
 *
 * 미리보기가 실제 화면과 달라 저작 도구로 신뢰할 수 없었던 문제(hero 카드가 미리보기에서만
 * 검게 보임)를 없애기 위해, 실제 배지 상세화면과 **같은 컴포넌트·같은 구조**로 TopNav → Hero →
 * 본문 → Footer를 그린다. 흉내 낸 전용 마크업을 새로 만들지 않는다.
 *
 * 실제 화면의 스택 구조를 그대로 재현한다:
 *   1) 프레임 바닥 = bg-surface (앱 컬럼 기본 배경)
 *   2) 배경 레이어 = 실제의 position:fixed 고정 레이어 대응(스크롤에 끌려가지 않도록 본문 스크롤
 *      컨테이너 바깥에 형제로 배치)
 *   3) 본문 = z-10 스크롤 컨테이너. TopNav·Hero는 배경이 있으면 투명해 레이어가 비쳐 보인다.
 *
 * 프레임 폭은 실제 앱 컬럼 폭(SERVICE_WIDTH=430px), 높이는 기준 단말 뷰포트 높이(932px)로 고정해
 * 배경이 실제와 같은 비율로 보이게 한다.
 */
export default function BadgeDetailPreviewFrame({
  badge,
  themed,
  backgroundLayerStyle,
  backgroundLayerRef,
  liveNode,
  backgroundAnimation,
  conditionText,
}: BadgeDetailPreviewFrameProps) {
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
            headerStyle={{ background: themed ? 'transparent' : 'var(--color-surface)' }}
          />
        </div>

        <BadgeHeroSection badge={badge} hasEarned themedBackground={themed} backgroundAnimation={backgroundAnimation} />

        <div className="relative z-10 flex flex-col gap-4 pt-[32px] px-6 pb-[32px]">
          <BadgeConditionCard text={conditionText} />
        </div>

        <Footer />
      </div>
    </div>
  )
}
