'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import ImageUploader from '@/app/spike/background-generator/ImageUploader'
import PatternPanel from '@/app/spike/background-generator/PatternPanel'
import AnimationPanel from '@/app/spike/background-generator/AnimationPanel'
import FilterPreview from '@/app/spike/background-generator/FilterPreview'
import { loadImageFromUrl } from '@/app/spike/background-generator/loadImage'
import {
  DEFAULT_ANIMATION_PARAMS,
  DEFAULT_PATTERN_PARAMS,
  FILTER_LABELS,
  SERVICE_WIDTH,
  type FilterId,
  type Mode,
} from '@/app/spike/background-generator/types'
import BadgeHeroSection from '@/app/(main)/badges/[id]/BadgeHeroSection'
import { getBadgeBackgroundStyle } from '@/lib/badgeBackgroundTheme'
import type { BadgeRarity } from '@/types/database'

interface BackgroundGeneratorPreviewProps {
  name: string
  description: string
  rarity: BadgeRarity
  imageUrl: string
  backgroundColor: string
}

/**
 * 배경 제너레이터 — BadgeForm 통합 저작 UI + 라이브 미리보기 (티켓 20260819_007).
 *
 * - 스파이크(`/spike/background-generator`, 티켓 20260819_001~006)에서 검증된 패턴/애니메이션/
 *   Paper 필터 파이프라인을 그대로 재사용한다(알고리즘 재작성 없음: `patternTile.ts`,
 *   `kaleidoscope/engine.ts`, `FilterPreview.tsx`의 필터별 파라미터/렌더링 분기 전부 동일).
 *   PatternPanel/AnimationPanel/FilterPreview는 원래 각자 자기 프리뷰 박스를 갖고 있었는데, 이
 *   화면에서는 `hidePreviewBox`로 그 박스들을 숨기고(컨트롤만 노출) 실제 배지 배경화면과 동일한
 *   레이아웃(BadgeHeroSection + 430px 배경 레이어) 위에 최종 합성 결과 하나만 렌더링한다.
 * - 애니메이션 모드는 스파이크에서 필터가 선택된 동안만 스냅샷을 캡처했지만(성능 검증용,
 *   20260819_002), 이 화면은 필터 미선택 상태에서도 "패턴/애니메이션 결과"를 하나로 통합해
 *   보여줘야 하므로 `alwaysSnapshot`으로 항상 400ms 간격 캡처한다.
 * - 저장 버튼 없음 — 미리보기 전용. 이 컴포넌트의 상태는 BadgeForm의 저장(submit) payload와
 *   전혀 연결되지 않는다. 최종 결과를 굽거나(bake) Storage에 저장하는 것은 이번 범위 밖(후속
 *   티켓)이다.
 * - admin 화면이므로 MODULAR 디자인 시스템 적용 대상이 아니다(기존 정책).
 */
export default function BackgroundGeneratorPreview({
  name,
  description,
  rarity,
  imageUrl,
  backgroundColor,
}: BackgroundGeneratorPreviewProps) {
  const [file, setFile] = useState<File | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [mode, setMode] = useState<Mode>('pattern')
  const [patternParams, setPatternParams] = useState(DEFAULT_PATTERN_PARAMS)
  const [animationParams, setAnimationParams] = useState(DEFAULT_ANIMATION_PARAMS)
  const [filterId, setFilterId] = useState<FilterId>('none')
  const [filterSource, setFilterSource] = useState<string | null>(null)
  const [previewNode, setPreviewNode] = useState<ReactNode>(null)

  const isGif = file?.type === 'image/gif'

  // 순수 계산으로 objectURL을 도출한다 (상태/이펙트 불필요) — 해제만 별도 이펙트에서 처리
  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  useEffect(() => {
    if (!objectUrl) return
    let cancelled = false
    loadImageFromUrl(objectUrl)
      .then((img) => {
        if (cancelled) return
        setImage(img)
        setLoadError(null)
      })
      .catch(() => {
        if (!cancelled) setLoadError('이미지를 불러오지 못했습니다. 다른 파일로 시도해주세요.')
      })
    return () => {
      cancelled = true
    }
  }, [objectUrl])

  // 이미지를 새로 고르면 이전 합성 결과가 남아 보이지 않도록 초기화(이벤트 핸들러에서 직접 처리
  // — 이펙트 내 setState 캐스케이드를 피하기 위함)
  const handleFileSelected = (f: File) => {
    setFile(f)
    setFilterSource(null)
    setPreviewNode(null)
  }

  const previewBadge = {
    image_url: imageUrl || null,
    name: name || '(배지 이름 미입력)',
    rarity,
    description,
    background_color: backgroundColor || null,
    background_shader_id: null,
  }

  // 실제 배지 상세화면의 고정 배경 레이어(badges/[id]/page.tsx의 badgeBackgroundLayer)와 동일한
  // 계산기를 재사용 — 배경색만 반영하는 현재 로직 그대로, 새 합성 결과는 그 위에 얹는다.
  const backgroundLayerStyle = getBadgeBackgroundStyle({
    background_color: backgroundColor || null,
    background_shader_id: null,
  })

  return (
    <div className="border border-dashed border-[#9333ea]/40 rounded-2xl p-5 space-y-5 bg-[#fdf4ff]">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-[#9333ea]">배경 제너레이터 — 저작 미리보기 전용 (저장되지 않음)</p>
        <p className="text-xs text-[#6b7280]">
          이미지를 업로드해 패턴 또는 애니메이션 배경을 만들고 Paper 필터를 적용해볼 수 있어요. 여기서
          조정한 값은 저장되지 않고 배지 등록/수정에도 반영되지 않아요. (티켓 20260819_007 — 저작 UI +
          라이브 미리보기까지만 구현, 굽기·저장은 후속 티켓에서 다룹니다.)
        </p>
      </div>

      <ImageUploader onFileSelected={handleFileSelected} fileName={file?.name ?? null} isGif={isGif} />
      {loadError && <p className="text-xs text-red-600">{loadError}</p>}

      {/* 실제 배지 배경 레이어 + hero 구조를 재사용한 라이브 미리보기 — 패턴/애니메이션/필터가
          분리되지 않은 단일 미리보기 화면 */}
      <div className="relative mx-auto w-full max-w-[430px] rounded-2xl overflow-hidden border border-[#e5e7eb]">
        <div aria-hidden="true" className="absolute inset-0" style={backgroundLayerStyle}>
          {previewNode}
        </div>
        <div className="relative z-10">
          <BadgeHeroSection badge={previewBadge} hasEarned />
        </div>
      </div>

      {image && (
        <>
          <div className="flex flex-col gap-4 border-t border-[#e5e7eb] pt-4">
            <div className="flex items-center gap-2">
              {(['pattern', 'animation'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={[
                    'rounded-lg px-4 py-2 text-sm transition-colors',
                    mode === m ? 'bg-[#111111] text-white' : 'bg-white border border-[#e5e7eb] text-[#374151] hover:bg-[#f3f4f6]',
                  ].join(' ')}
                >
                  {m === 'pattern' ? '패턴 모드' : '애니메이션 모드'}
                </button>
              ))}
              <span className="text-xs text-[#9ca3af]">패턴/애니메이션은 배타적으로 선택됩니다.</span>
            </div>

            {mode === 'pattern' ? (
              <PatternPanel
                image={image}
                params={patternParams}
                onChange={setPatternParams}
                onFlattenedChange={setFilterSource}
                hidePreviewBox
              />
            ) : (
              <AnimationPanel
                image={image}
                params={animationParams}
                onChange={setAnimationParams}
                previewSize={SERVICE_WIDTH}
                onSnapshotChange={setFilterSource}
                filterActive={filterId !== 'none'}
                alwaysSnapshot
                hidePreviewBox
              />
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-[#e5e7eb] pt-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-[#374151]">Paper 필터 (1개 선택)</p>
              <p className="text-xs text-[#9ca3af]">
                패턴/애니메이션 결과 위에 적용됩니다. 위 미리보기에 곧바로 반영돼요.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {(Object.keys(FILTER_LABELS) as FilterId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilterId(id)}
                  className={[
                    'rounded-lg px-3 py-1.5 text-xs transition-colors',
                    filterId === id ? 'bg-[#111111] text-white' : 'bg-white border border-[#e5e7eb] text-[#374151] hover:bg-[#f3f4f6]',
                  ].join(' ')}
                >
                  {FILTER_LABELS[id]}
                </button>
              ))}
            </div>

            <FilterPreview
              filterId={filterId}
              source={filterSource}
              size={SERVICE_WIDTH}
              hidePreviewBox
              onPreviewNodeChange={setPreviewNode}
            />
          </div>
        </>
      )}
    </div>
  )
}
