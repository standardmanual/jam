'use client'

import { useRef, type ComponentProps } from 'react'
import BadgeDetailPreviewFrame from './BadgeDetailPreviewFrame'
import {
  getBadgeBackgroundStyle,
  hasBadgeBackgroundTheme,
  type BackgroundThemeSource,
} from '@/lib/badgeBackgroundTheme'
import { parseBlobAnimation } from '@/lib/blobAnimation'
import { SERVICE_WIDTH } from '@/lib/backgroundGenerator/types'

/**
 * 레일 폭(320px)의 카드 안쪽에 실제 앱 컬럼(430px)이 들어가도록 줄이는 비율.
 * 미리보기·섹션 목차·액션 카드가 1440×900 첫 화면의 레일 높이 안에 함께 들도록 맞춘 값이다.
 */
const RAIL_PREVIEW_SCALE = 0.55

/**
 * 원래 크기(430×932) 중 레일에 보여 줄 높이 — TopNav·Hero·획득 조건 카드까지 들어간다.
 * 그 아래(Footer)는 미리보기 안에서 스크롤하면 보인다.
 */
const RAIL_PREVIEW_VISIBLE_HEIGHT = 700

type HeroBadge = ComponentProps<typeof BadgeDetailPreviewFrame>['badge']

/**
 * 레일용 상세 화면 미리보기 — 티켓 20260911_0901
 *
 * 예전에는 배지 폼의 디자인 카드 안(`BackgroundGeneratorPreview`의 `renderPreview`)에서만
 * 430px 원래 크기로 그렸다. 이제 생성·수정·조회 3화면의 오른쪽 레일에서 같은 프레임
 * (`BadgeDetailPreviewFrame` — 실제 배지 상세와 같은 컴포넌트)을 줄여 그린다.
 *
 * 배경 판정은 실제 화면과 같은 계산기(`badgeBackgroundTheme.ts`)를 그대로 쓴다 — 폼은 편집 중인
 * 값을, 조회 화면은 저장된 행의 값을 `background`로 넘긴다.
 */
export default function BadgeRailPreview({
  badge,
  background,
  conditionText,
}: {
  badge: Omit<HeroBadge, 'background_color' | 'background_shader_id' | 'background_image_url' | 'background_animation'>
  background: BackgroundThemeSource
  conditionText: string
}) {
  const layerRef = useRef<HTMLDivElement>(null)
  const animation = parseBlobAnimation(background.background_animation)
  const themed = hasBadgeBackgroundTheme(background)
  const layerStyle = getBadgeBackgroundStyle(background)

  return (
    <div
      className="mx-auto overflow-hidden rounded-2xl"
      style={{ width: SERVICE_WIDTH * RAIL_PREVIEW_SCALE, height: RAIL_PREVIEW_VISIBLE_HEIGHT * RAIL_PREVIEW_SCALE }}
    >
      <div style={{ width: SERVICE_WIDTH, transform: `scale(${RAIL_PREVIEW_SCALE})`, transformOrigin: 'top left' }}>
        <BadgeDetailPreviewFrame
          badge={{
            ...badge,
            background_color: background.background_color,
            background_shader_id: background.background_shader_id,
            background_image_url: background.background_image_url,
            background_animation: animation,
          }}
          themed={themed}
          backgroundLayerStyle={layerStyle}
          backgroundLayerRef={layerRef}
          liveNode={null}
          backgroundAnimation={animation}
          conditionText={conditionText}
        />
      </div>
    </div>
  )
}
