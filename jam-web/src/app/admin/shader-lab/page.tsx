'use client'

import { useMemo, useRef, useState } from 'react'
import type { ShaderLabLayerConfig } from '@basementstudio/shader-lab'
import { IconInfoCircle } from '@tabler/icons-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
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
 * UI 개선(티켓 20260913_1613): 저장/불러오기를 제목 우측 컴팩트 폼으로 옮기고, 정보성이
 * 낮은 카드 설명 문구를 정리했다. "레이어" 카드의 순서 설명만은 정보 아이콘 호버로 남겨뒀다
 * (합성 순서가 직관과 반대라 유일한 안내 수단 — `handleAdd` 주석 참고).
 *
 * 재생 기능 제거(티켓 20260913_1819): 이 도구의 산출물은 1:1 정적 PNG라 재생/정지 개념이
 * 불필요해 완전히 없앴다. `playing` state·`applyDisabled` prop이 여기 있었는데, 시간이
 * 지나면 스스로 움직이던 6개 레이어의 파라미터 자체를 `effectRegistry.ts`에서 제거했으므로
 * 재생 여부와 무관하게 화면은 항상 정지 상태로 보인다(플루이드·픽셀 트레일·매그니파이
 * 렌즈의 마우스 반응은 시간과 무관하게 그대로 동작 — `useShaderLabPlayback.ts` 참고).
 *
 * 라이선스 고지는 `jam-web/THIRD_PARTY_NOTICES.md` 참고.
 */
export default function ShaderLabPage() {
  const [layers, setLayers] = useState<ShaderLabLayerConfig[]>([])
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
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
  }

  return (
    <div className="max-w-[1400px] space-y-6 p-4 md:p-8">
      <div className="flex flex-nowrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold md:text-3xl">쉐이더 랩</h1>
        <ShaderLabSavePanel layers={layers} onLoad={handleLoadComposition} />
      </div>

      <ShaderLabWebGpuGate>
        <div className="grid gap-6 lg:grid-cols-[260px_1fr_320px]">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-1.5">
                <CardTitle>레이어</CardTitle>
                <span
                  title="목록 위쪽일수록 나중에(위에) 그려져요."
                  className="inline-flex cursor-help text-muted-foreground"
                >
                  <IconInfoCircle className="h-4 w-4" />
                </span>
              </div>
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
              <CardTitle>미리보기</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ShaderLabViewport ref={canvasRef} config={config} />
              <ShaderLabExportPanel canvasRef={canvasRef} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>속성</CardTitle>
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
