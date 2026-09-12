'use client'

import { useMemo, useRef, useState } from 'react'
import type { ShaderLabLayerConfig } from '@basementstudio/shader-lab'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { buildComposition } from '@/lib/admin/shaderLab/composition'
import { createLayer } from '@/lib/admin/shaderLab/layerFactory'
import type { SupportedShaderLabLayerType } from '@/lib/admin/shaderLab/effectRegistry'
import ShaderLabWebGpuGate from './ShaderLabWebGpuGate'
import ShaderLabLayerSidebar from './ShaderLabLayerSidebar'
import ShaderLabViewport from './ShaderLabViewport'
import ShaderLabPropertiesPanel from './ShaderLabPropertiesPanel'
import ShaderLabExportPanel from './ShaderLabExportPanel'
import ShaderLabSavePanel from './ShaderLabSavePanel'

/**
 * 쉐이더 랩 — 1차: 에디터 골격 + 핵심 이펙트 6종 + 1:1 PNG 내보내기 (티켓 20260912_1951),
 * 2차: 텍스트 레이어 + 재생 루프 버그 수정(2차 1차분) + 나머지 소스 4종·이펙트 18종(2차
 * 2차분, 티켓 20260912_2157) — 총 29종(소스 6종 + 이펙트 23종) 지원.
 *
 * basement.studio의 `shader-lab`(https://github.com/basementstudio/shader-lab, Apache 2.0)
 * 런타임(`@basementstudio/shader-lab`, WebGPU + Three.js + TSL)을 그대로 설치해 쓰고, 에디터
 * 애플리케이션 UI(레이어 사이드바·속성 패널·캔버스 뷰포트)만 JAM! 어드민 스타일로 재작성해
 * 이식했다. 커뮤니티(씬 공유·좋아요·리믹스·신고)·자체 인증·MCP 에이전트 브릿지는 제외했다.
 * 원본 32종 중 비디오·카메라·커스텀 셰이더 3종은 범위 밖(사용자 결정, 티켓 20260912_2157).
 *
 * 라이선스 고지는 `jam-web/THIRD_PARTY_NOTICES.md` 참고.
 */
export default function ShaderLabPage() {
  const [layers, setLayers] = useState<ShaderLabLayerConfig[]>([])
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const config = useMemo(() => buildComposition(layers), [layers])
  const selectedLayer = layers.find((l) => l.id === selectedLayerId) ?? null

  function handleAdd(type: SupportedShaderLabLayerType) {
    const layer = createLayer(type)
    // 새 레이어는 배열 맨 앞(목록 맨 위)에 추가한다 — 실제 런타임 호출부
    // (`node_modules/@basementstudio/shader-lab/dist/src/renderer/create-webgpu-renderer.js`
    // L38 `pipeline.syncLayers([...frame.layers].reverse())`)가 배열을 뒤집은 뒤 순서대로
    // 합성하므로, 배열 인덱스 0(목록 맨 위)이 실제로는 합성 순서상 "가장 나중에(맨 위에)"
    // 그려진다. 게이트 리뷰 재시도(20260912_1951) 당시 `pipeline-manager.js`의 forward
    // 루프만 보고 이 reverse() 호출을 놓쳐 반대로 진단됐다 — 실제 브라우저(WebGPU) 렌더로
    // 재현/반증한 근거는 완료 기록 참고.
    setLayers((prev) => [layer, ...prev])
    setSelectedLayerId(layer.id)
  }

  function handleRemove(id: string) {
    setLayers((prev) => prev.filter((l) => l.id !== id))
    setSelectedLayerId((current) => (current === id ? null : current))
  }

  function handleToggleVisible(id: string) {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)))
  }

  function handleMove(id: string, direction: 'up' | 'down') {
    setLayers((prev) => {
      const index = prev.findIndex((l) => l.id === id)
      if (index === -1) return prev
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
  }

  function handleUpdateLayer(next: ShaderLabLayerConfig) {
    setLayers((prev) => prev.map((l) => (l.id === next.id ? next : l)))
  }

  function handleLoadComposition(loadedLayers: ShaderLabLayerConfig[]) {
    setLayers(loadedLayers)
    setSelectedLayerId(loadedLayers[0]?.id ?? null)
    setPlaying(false)
  }

  return (
    <div className="max-w-[1400px] space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">쉐이더 랩</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          레이어를 쌓아 이미지 위에 이펙트를 합성해요. 소스 6종(이미지·텍스트·플루이드·픽셀
          트레일·매그니파이 렌즈·메시 그라디언트)과 이펙트 23종, 1:1 1280×1280 PNG 내보내기를
          지원해요.
        </p>
      </div>

      <ShaderLabWebGpuGate>
        <div className="grid gap-6 lg:grid-cols-[260px_1fr_320px]">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>레이어</CardTitle>
                <CardDescription>목록 위쪽일수록 나중에(위에) 그려져요.</CardDescription>
              </CardHeader>
              <CardContent>
                <ShaderLabLayerSidebar
                  layers={layers}
                  selectedLayerId={selectedLayerId}
                  onSelect={setSelectedLayerId}
                  onAdd={handleAdd}
                  onRemove={handleRemove}
                  onToggleVisible={handleToggleVisible}
                  onMove={handleMove}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>저장/불러오기</CardTitle>
                <CardDescription>작업 유실 방지용 최소 저장이에요.</CardDescription>
              </CardHeader>
              <CardContent>
                <ShaderLabSavePanel layers={layers} onLoad={handleLoadComposition} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>미리보기</CardTitle>
              <CardDescription>이 캔버스가 그대로 결과물로 내보내져요(WYSIWYG).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ShaderLabViewport ref={canvasRef} config={config} playing={playing} onTogglePlaying={() => setPlaying((p) => !p)} />
              <ShaderLabExportPanel canvasRef={canvasRef} applyDisabled={playing} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>속성</CardTitle>
              <CardDescription>선택한 레이어의 값을 조정해요.</CardDescription>
            </CardHeader>
            <CardContent>
              <ShaderLabPropertiesPanel layer={selectedLayer} onChange={handleUpdateLayer} />
            </CardContent>
          </Card>
        </div>
      </ShaderLabWebGpuGate>
    </div>
  )
}
