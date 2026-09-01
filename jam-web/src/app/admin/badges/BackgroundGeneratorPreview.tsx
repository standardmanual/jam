'use client'

import { useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { getBadgeBackgroundStyle } from '@/lib/badgeBackgroundTheme'
import BackgroundColorField from '@/components/admin/BackgroundColorField'

/** 라이브 미리보기 상태 — 호출부가 실제 화면 맥락(배지 상세/컬렉션/세계관)에 맞는 프레임을 그릴 때 쓴다.
 *  제너레이터(패턴/애니메이션/Paper 필터) 제거(티켓 20260901_1929) 이후에도 3개 호출부
 *  (BadgeForm/ItemBookForm/FactionForm)가 동일한 프리뷰 프레임 위임 패턴(`renderPreview`)을
 *  공유하므로, 프레임 컴포넌트(`BadgeDetailPreviewFrame`/`ItemBookDetailPreviewFrame`)의 기존
 *  prop shape는 그대로 두고 이 컴포넌트만 얇게 줄였다. `backgroundLayerRef`는 이제 굽기(bake)
 *  대상이 아니라 프레임 컴포넌트가 요구하는 DOM ref 자리표시자일 뿐이고, `liveNode`는 항상
 *  null이다(제너레이터 라이브 합성 결과가 더 이상 없음). */
export interface BackgroundGeneratorLivePreviewState {
  /** 배경 레이어에 실제로 무언가 그려지는 상태인지 — 배경 있는 화면처럼 주변 UI를 투명 처리할지 결정 */
  themed: boolean
  /** 배경 레이어에 적용할 스타일(단색) */
  backgroundLayerStyle: CSSProperties
  /** 프레임 컴포넌트가 요구하는 배경 레이어 DOM 참조 자리표시자 */
  backgroundLayerRef: RefObject<HTMLDivElement | null>
  /** 항상 null — 제너레이터 라이브 합성 노드가 더 이상 없다 */
  liveNode: ReactNode
}

interface BackgroundGeneratorPreviewProps {
  backgroundColor: string
  onBackgroundColorChange: (value: string) => void
  /** 라이브 미리보기를 실제 화면 맥락에 맞게 그리는 렌더 함수. 호출부(BadgeForm 등)가 자신의
   *  상세화면과 동일한 구조로 프레임을 그린다 — 이 컴포넌트는 어떤 화면을 흉내 내는지 모른다. */
  renderPreview: (state: BackgroundGeneratorLivePreviewState) => ReactNode
}

/**
 * 배경색 저작 UI + 라이브 미리보기 공용 컴포넌트.
 *
 * 원래는 패턴/애니메이션/Paper 필터를 합성하는 "배경 제너레이터"였다(티켓 20260819_007,
 * 20260819_008, 20260819_013). 실제로는 쓰이지 않아 티켓 20260901_1929에서 제너레이터
 * 모드·배경 쉐이더 드롭다운을 완전히 제거하고 배경색 단일 모드로 축소했다. 대표 이미지 업로드
 * 시 평균 색상 자동 지정(`ImageUploadField`의 `onAverageColor`)과 "하위에 일괄 적용" 캐스케이드
 * 기능은 이 컴포넌트 밖(호출부·API)에서 그대로 유지된다.
 * - **badge 전용 결합 없음**: 편집 대상이 배지인지 컬렉션인지 세계관인지 이 컴포넌트는 모른다.
 *   실제 상세화면과 같은 구조의 미리보기 프레임은 `renderPreview` 렌더 함수로 호출부에 위임한다.
 * - admin 화면이므로 MODULAR 디자인 시스템 적용 대상이 아니다(기존 정책).
 */
export default function BackgroundGeneratorPreview({
  backgroundColor,
  onBackgroundColorChange,
  renderPreview,
}: BackgroundGeneratorPreviewProps) {
  const previewLayerRef = useRef<HTMLDivElement>(null)

  // 실제 화면의 고정 배경 레이어와 동일한 계산기를 재사용
  const backgroundLayerStyle = getBadgeBackgroundStyle({
    background_color: backgroundColor || null,
    background_shader_id: null,
    background_image_url: null,
  })

  // 배경 레이어에 실제로 무언가 그려지는 상태인지 — 실제 화면에서 배경이 있는 화면과 동일하게
  // 주변 UI를 투명 처리할지 결정한다. 없으면 배경 없는 화면과 똑같이 보인다.
  const themed = Boolean(backgroundColor)

  // 2단 배치에서 설정 영역이 눌리지 않도록, 넓은 화면(xl↑)에서는 이 섹션만 폼 기본 폭
  // (max-w-2xl)을 넘어 어드민 본문 가용 폭까지 넓힌다(사이드바 16rem + 여백 감안).
  return (
    <div className="border border-dashed border-purple-600/40 rounded-2xl p-5 space-y-5 bg-fuchsia-50 xl:w-[calc(100vw-22rem)] xl:max-w-[1040px]">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-purple-600">배경 테마</p>
        <p className="text-xs text-muted-foreground">배경색을 지정할 수 있어요.</p>
      </div>

      {/* PC는 좌측 설정 / 우측 미리보기 2단, 모바일은 위 미리보기 / 아래 설정 —
          DOM 순서는 [설정, 미리보기]로 두고 모바일에서만 flex-col-reverse로 뒤집는다. */}
      <div className="flex flex-col-reverse gap-5 xl:flex-row xl:items-start">
        <div className="flex-1 min-w-0 space-y-5">
          <BackgroundColorField
            value={backgroundColor}
            onChange={onBackgroundColorChange}
            helperText="이미지를 업로드하면 평균 색상이 자동으로 채워져요. 색상 피커나 직접 입력으로 바꿀 수 있고, 비워두면 기본 배경을 사용해요."
          />
        </div>

        {/* 호출부가 실제 화면과 동일한 구조로 그리는 미리보기 프레임 */}
        <div className="xl:shrink-0 overflow-x-auto">
          {renderPreview({ themed, backgroundLayerStyle, backgroundLayerRef: previewLayerRef, liveNode: null })}
        </div>
      </div>
    </div>
  )
}
