'use client'

import { useEffect, useMemo, useState } from 'react'
import ImageUploader from './ImageUploader'
import PatternPanel from './PatternPanel'
import AnimationPanel from './AnimationPanel'
import FilterPreview from './FilterPreview'
import GifFrameTest from './GifFrameTest'
import { loadImageFromUrl } from './loadImage'
import {
  DEFAULT_ANIMATION_PARAMS,
  DEFAULT_PATTERN_PARAMS,
  FILTER_LABELS,
  type FilterId,
  type Mode,
} from './types'

const PREVIEW_SIZE = 360

/**
 * 배지 상세 배경테마 제너레이터 — 검증용 스파이크 프로토타입 (20260819_001).
 *
 * - 정식 기능이 아니다. 기존 badges 테이블/DB와 무관한 독립 라우트.
 * - 로그인 없이 접근 가능 (src/proxy.ts의 publicPaths에 '/spike' 예외 처리됨).
 * - staging에만 존재. main 머지 대상 아님 — 최종 스펙 확정 후 폐기/재작업 전제.
 */
export default function BackgroundGeneratorSpikePage() {
  const [file, setFile] = useState<File | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [mode, setMode] = useState<Mode>('pattern')
  const [patternParams, setPatternParams] = useState(DEFAULT_PATTERN_PARAMS)
  const [animationParams, setAnimationParams] = useState(DEFAULT_ANIMATION_PARAMS)
  const [filterId, setFilterId] = useState<FilterId>('none')
  const [filterSource, setFilterSource] = useState<string | null>(null)

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

  return (
    <div className="min-h-screen bg-[#fafafa] text-[#111111]">
      <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-8">
        <header className="flex flex-col gap-1">
          <p className="text-xs font-medium text-[#9333ea]">SPIKE · 검증용 프로토타입 · staging 전용</p>
          <h1 className="text-xl font-semibold">배경테마 제너레이터 스파이크</h1>
          <p className="text-sm text-[#6b7280]">
            티켓 20260819_001 — 이미지 업로드 → [패턴 | 애니메이션] 배타 선택 → Paper 필터 1종 적용
            파이프라인이 기술적으로 실현 가능한지 검증한다. 굽기/Storage 저장 없이 브라우저 미리보기만
            제공한다.
          </p>
        </header>

        <section className="bg-white border border-[#e5e7eb] rounded-2xl p-5">
          <ImageUploader onFileSelected={setFile} fileName={file?.name ?? null} isGif={isGif} />
          {loadError && <p className="text-xs text-red-600 mt-2">{loadError}</p>}
        </section>

        {image && (
          <>
            <section className="bg-white border border-[#e5e7eb] rounded-2xl p-5 flex flex-col gap-5">
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
                  previewSize={PREVIEW_SIZE}
                  onFlattenedChange={setFilterSource}
                />
              ) : (
                <AnimationPanel
                  image={image}
                  params={animationParams}
                  onChange={setAnimationParams}
                  previewSize={PREVIEW_SIZE}
                  onSnapshotChange={setFilterSource}
                  filterActive={filterId !== 'none'}
                />
              )}
            </section>

            <section className="bg-white border border-[#e5e7eb] rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-[#374151]">전역 Paper 필터 (1개 선택)</p>
                <p className="text-xs text-[#9ca3af]">
                  패턴/애니메이션 결과 위에 적용된다. @paper-design/shaders-react — paper texture ·
                  liquid metal은 의도적으로 제외.
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

              <FilterPreview filterId={filterId} source={filterSource} size={PREVIEW_SIZE} label="필터 적용 결과" />
            </section>

            {isGif && objectUrl && (
              <section className="bg-white border border-[#e5e7eb] rounded-2xl p-5">
                <GifFrameTest gifUrl={objectUrl} filterId={filterId} size={PREVIEW_SIZE / 2} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
