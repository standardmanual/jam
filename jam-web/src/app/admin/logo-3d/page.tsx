'use client'

/**
 * 어드민 3D 로고 제너레이터 (티켓 20261103_1352)
 *
 * 폰트(또는 SVG)와 글자열 → 윤곽 → 형상 → 뷰포트 순으로 흐른다(변환은 `useLogo3DOutline` 훅, 에셋 3D 모드와 공용).
 * 회전·줌·시점·색·배경은 형상을 다시 만들지 않고 뷰포트가 다시 그리기만 한다.
 * 로그인·권한은 어드민 레이아웃(`admin/layout.tsx`)이 확인한다.
 */
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Logo3DParams } from '@/lib/logo-3d/types'
import Logo3DViewport, { type Logo3DViewportHandle } from '../assets/logo3d/Logo3DViewport'
import {
  applyLogo3DPatch,
  DEFAULT_LOGO3D_STATE,
  logo3dFileName,
  type Logo3DState,
} from '../assets/logo3d/logo3dConfig'
import { DEFAULT_LOGO_SVG_LABEL } from '../assets/logo3d/logo3dDefaultSvg'
import { useLogo3DOutline } from '../assets/logo3d/useLogo3DOutline'
import Logo3DPanel from './Logo3DPanel'

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function Logo3DPage() {
  const viewportRef = useRef<Logo3DViewportHandle>(null)
  const [state, setState] = useState<Logo3DState>(DEFAULT_LOGO3D_STATE)
  const [saving, setSaving] = useState(false)

  // 폰트·SVG → 윤곽 → 형상은 에셋 3D 모드와 같은 훅을 쓴다.
  const { geometry, warnings, error, loading, loadSvgFile } = useLogo3DOutline({
    enabled: true,
    source: state.source,
    fontFamily: state.fontFamily,
    fontWeight: state.fontWeight,
    text: state.text,
    svgText: state.svgText,
    params: state.params,
  })

  const handleChange = useCallback((patch: Partial<Logo3DState>) => {
    setState((prev) => applyLogo3DPatch(prev, patch))
  }, [])

  const handleParamChange = useCallback((key: keyof Logo3DParams, value: number) => {
    setState((prev) => ({ ...prev, params: { ...prev.params, [key]: value } }))
  }, [])

  const handleRotate = useCallback((rotX: number, rotY: number) => {
    setState((prev) => ({ ...prev, rotX, rotY }))
  }, [])

  const handleZoom = useCallback((zoom: number) => {
    setState((prev) => ({ ...prev, zoom }))
  }, [])

  const handleSvgFile = useCallback(
    async (file: File) => {
      setState((prev) => ({ ...prev, source: 'svg' }))
      const loaded = await loadSvgFile(file)
      if (loaded) setState((prev) => ({ ...prev, svgText: loaded.text, svgName: loaded.name }))
    },
    [loadSvgFile]
  )

  const handleSave = async () => {
    const handle = viewportRef.current
    if (!handle) return
    setSaving(true)
    try {
      const blob = await handle.exportPng(state.ratio)
      const label =
        state.source === 'svg' ? (state.svgName ? state.svgName.replace(/\.svg$/i, '') : DEFAULT_LOGO_SVG_LABEL) : state.text
      downloadBlob(blob, logo3dFileName(label, state.ratio))
      toast('PNG를 저장했어요.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PNG를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-[calc(100dvh-64px)] w-full flex-col overflow-hidden bg-[#eceeea] text-[#1e2322]">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[#e0e4df] bg-[#f8f9f6] px-6">
        <div>
          <b className="text-base tracking-[-0.5px] whitespace-nowrap">3D 로고</b>
          <small className="hidden text-[10px] tracking-[0.4px] text-[#7f8582] sm:block whitespace-nowrap">
            폰트·SVG를 3D 로고 PNG로
          </small>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <Logo3DViewport
          ref={viewportRef}
          geometry={geometry}
          frameColor={state.frameColor}
          tileColor={state.tileColor}
          rotX={state.rotX}
          rotY={state.rotY}
          rotZ={state.rotZ}
          zoom={state.zoom}
          view={state.view}
          bgMode={state.bgMode}
          bgA={state.bgA}
          bgB={state.bgB}
          bgAngle={state.bgAngle}
          grain={0}
          ratio={state.ratio}
          loading={loading}
          onRotate={handleRotate}
          onZoom={handleZoom}
        />
        <Logo3DPanel
          state={state}
          onChange={handleChange}
          onParamChange={handleParamChange}
          onSvgFile={handleSvgFile}
          onResetZoom={() => handleZoom(DEFAULT_LOGO3D_STATE.zoom)}
          onSave={handleSave}
          warnings={warnings}
          error={error}
          loading={loading}
          saving={saving}
        />
      </main>
    </div>
  )
}
