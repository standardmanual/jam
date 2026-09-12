'use client'

import { useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/admin/ui/card'
import {
  DEFAULT_SHADER_TEXT_PARAMS,
  applyShaderTextStyle,
  type ShaderTextParams,
  type ShaderTextStyleParams,
} from '@/lib/admin/shaderTextDissolve'
import { loadShaderTextImage } from '@/lib/admin/composeShaderTextDissolve'
import ShaderTextCanvas from './ShaderTextCanvas'
import ShaderTextControls from './ShaderTextControls'
import ShaderTextPresetPanel from './ShaderTextPresetPanel'
import ShaderTextBadgeApply from './ShaderTextBadgeApply'
import ShaderTextExportPanel from './ShaderTextExportPanel'

/**
 * 쉐이더 텍스트 생성 — 디졸브 에코 (티켓 20260912_1532)
 *
 * Brik "Dissolve" 참고 툴의 컨트롤 패널 구성을 1:1로 옮긴 어드민 저작 도구다. 캔버스 2D
 * 합성만으로 에코 복제·헤일로/글로우·노이즈·필름 그레인·그라디언트맵 색상 매핑을 구현했다
 * (신규 npm 의존성 없음, 티켓 명시).
 *
 * 흐름: 컨트롤 패널에서 텍스트·이펙트 설정 → 미리보기(=굽는 캔버스, WYSIWYG) → 배지 검색·적용
 * 또는 PNG/WebM으로 내보내기. 스타일 프리셋은 `shader_text_presets` 테이블에 저장해 관리자·PC
 * 간 공유한다.
 */
export default function ShaderTextPage() {
  const [params, setParams] = useState<ShaderTextParams>(DEFAULT_SHADER_TEXT_PARAMS)
  const [playing, setPlaying] = useState(false)
  const [silhouetteFile, setSilhouetteFile] = useState<File | null>(null)
  const [silhouetteImage, setSilhouetteImage] = useState<HTMLImageElement | null>(null)
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null)
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null)

  /**
   * 배지 선택·프리셋 불러오기처럼 "새 선택"이 발생할 때마다 올리는 토큰
   * (`20260902_1613`의 `selectionKey` 패턴과 동일). 재생 중에 새 선택이 들어오면 React가 rAF
   * 정리 함수를 새 effect보다 먼저 돌려, 이전 선택의 누적 위상이 이미 교체된 draft를 덮어쓰는
   * 사고를 막는다.
   */
  const [selectionKey, setSelectionKey] = useState(0)
  const selectionKeyRef = useRef(0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  function bumpSelection() {
    selectionKeyRef.current += 1
    setSelectionKey(selectionKeyRef.current)
    setPlaying(false)
  }

  function handleRestoreParams(next: ShaderTextParams) {
    bumpSelection()
    setParams(next)
  }

  function handleApplyPresetStyle(style: ShaderTextStyleParams) {
    bumpSelection()
    setParams((prev) => applyShaderTextStyle(prev, style))
  }

  async function handleSilhouetteFileSelected(file: File | null) {
    setSilhouetteFile(file)
    if (!file) {
      setSilhouetteImage(null)
      return
    }
    try {
      const img = await loadShaderTextImage(file)
      setSilhouetteImage(img)
    } catch {
      setSilhouetteImage(null)
    }
  }

  async function handleBackgroundFileSelected(file: File | null) {
    setBackgroundFile(file)
    if (!file) {
      setBackgroundImage(null)
      return
    }
    try {
      const img = await loadShaderTextImage(file)
      setBackgroundImage(img)
    } catch {
      setBackgroundImage(null)
    }
  }

  function handlePause(phase: number, forSelection: number) {
    // 이미 다른 선택으로 넘어간 뒤 도착한 갱신은 버린다(위상 오염 방지 — 위 주석 참조).
    if (forSelection !== selectionKeyRef.current) return
    setParams((prev) => ({ ...prev, animation: { ...prev.animation, bakedPhase: phase } }))
  }

  const hasAnimation = params.animation.mainWave.enabled || params.animation.echoFloat.enabled || params.animation.noiseAnimated

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">쉐이더 텍스트 생성</h1>
        <p className="text-muted-foreground text-sm mt-1">
          디졸브 에코 텍스트 이펙트를 만들어 배지 이미지에 적용하거나 PNG·WebM으로 내보냅니다.
          1:1 비율 1280×1280 고정입니다.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>이펙트 설정</CardTitle>
              <CardDescription>그룹을 펼쳐 값을 조정하면 오른쪽 미리보기가 바로 갱신돼요.</CardDescription>
            </CardHeader>
            <CardContent>
              <ShaderTextControls
                params={params}
                onChange={setParams}
                playing={playing}
                onTogglePlaying={() => setPlaying((p) => !p)}
                silhouetteFileName={silhouetteFile?.name ?? null}
                onSilhouetteFileSelected={handleSilhouetteFileSelected}
                backgroundFileName={backgroundFile?.name ?? null}
                onBackgroundFileSelected={handleBackgroundFileSelected}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>스타일 프리셋</CardTitle>
              <CardDescription>문구는 프리셋에 담기지 않아요 — 스타일만 저장·공유됩니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <ShaderTextPresetPanel params={params} onApplyStyle={handleApplyPresetStyle} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>미리보기</CardTitle>
              <CardDescription>이 캔버스가 그대로 결과물로 구워져요(WYSIWYG).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ShaderTextCanvas
                params={params}
                silhouetteImage={silhouetteImage}
                backgroundImage={backgroundImage}
                playing={playing}
                selectionKey={selectionKey}
                onPause={handlePause}
                canvasRef={canvasRef}
              />
              <p className="text-xs text-muted-foreground">
                정지 위상 {params.animation.bakedPhase.toFixed(2)} · 1280×1280 ·{' '}
                {params.background.mode === 'transparent'
                  ? '투명 배경'
                  : params.background.mode === 'image'
                    ? '배경 이미지'
                    : '단색 배경'}
              </p>
              <ShaderTextExportPanel
                canvasRef={canvasRef}
                hasAnimation={hasAnimation}
                playing={playing}
                onSetPlaying={setPlaying}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>배지에 적용</CardTitle>
              <CardDescription>이름으로 배지를 찾아 지금 만든 이미지를 반영해요.</CardDescription>
            </CardHeader>
            <CardContent>
              <ShaderTextBadgeApply
                canvasRef={canvasRef}
                params={params}
                onRestore={handleRestoreParams}
                applyDisabled={playing}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
