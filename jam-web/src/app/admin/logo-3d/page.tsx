'use client'

/**
 * 어드민 3D 로고 제너레이터 (티켓 20261103_1352)
 *
 * 폰트(또는 SVG)와 글자열 → 윤곽(fontToOutline·svgToOutline) → 형상(buildLogoGeometry) → 뷰포트 순으로 흐른다.
 * 회전·줌·시점·색·배경은 형상을 다시 만들지 않고 뷰포트가 다시 그리기만 한다.
 * 로그인·권한은 어드민 레이아웃(`admin/layout.tsx`)이 확인한다.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { parse, type Font } from 'opentype.js'
import { toast } from 'sonner'
import { buildLogoGeometry } from '@/lib/logo-3d/buildGeometry'
import { fontToOutline } from '@/lib/logo-3d/fontOutline'
import { svgToOutline } from '@/lib/logo-3d/svgOutline'
import type { LogoOutline, Logo3DParams } from '@/lib/logo-3d/types'
import Logo3DPanel from './Logo3DPanel'
import Logo3DViewport, { type Logo3DViewportHandle } from './Logo3DViewport'
import { DEFAULT_LOGO3D_STATE, logo3dFileName, type Logo3DState } from './logo3dConfig'
import { DEFAULT_LOGO_SVG, DEFAULT_LOGO_SVG_LABEL } from './logo3dDefaultSvg'

const TEXT_DEBOUNCE_MS = 300
const MAX_SVG_BYTES = 5 * 1024 * 1024

const FONT_FETCH_ERROR =
  '폰트를 불러오지 못했어요. 네트워크 응답을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.'
const FONT_PARSE_ERROR =
  '글자 윤곽을 만들지 못했어요. 폰트 파일을 읽을 수 없어요. 다른 폰트나 굵기를 골라 주세요.'
const EMPTY_TEXT_ERROR = '글자 윤곽을 만들지 못했어요. 글자열이 비어 있어요. 로고로 만들 글자를 입력해 주세요.'
const SVG_TOO_LARGE_ERROR = 'SVG를 읽지 못했어요. 파일이 5MB보다 커요. 더 가벼운 SVG로 다시 올려 주세요.'
const SVG_READ_ERROR = 'SVG를 읽지 못했어요. 파일을 열 수 없어요. 파일을 확인하고 다시 올려 주세요.'

/** 입력(폰트·SVG)마다 따로 둔다. 실패하면 `outline`은 이전 값을 그대로 두고 `error`만 채운다. */
type InputResult = { outline: LogoOutline | null; warnings: string[]; error: string | null }
const EMPTY_RESULT: InputResult = { outline: null, warnings: [], error: null }

function applyResult(prev: InputResult, next: { outline: LogoOutline; warnings: string[]; error: string | null }): InputResult {
  if (next.error) return { ...prev, error: next.error }
  return { outline: next.outline, warnings: next.warnings, error: null }
}

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
  const fontCache = useRef(new Map<string, Font>())
  const [state, setState] = useState<Logo3DState>(DEFAULT_LOGO3D_STATE)
  const [debouncedText, setDebouncedText] = useState(DEFAULT_LOGO3D_STATE.text)
  const [fontResult, setFontResult] = useState<InputResult>(EMPTY_RESULT)
  const [svgResult, setSvgResult] = useState<InputResult>(EMPTY_RESULT)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const { source, fontFamily, fontWeight } = state

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedText(state.text), TEXT_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [state.text])

  // 폰트 입력 → 윤곽. 실패하면 오류만 알리고 이전 형상을 유지한다.
  useEffect(() => {
    if (source !== 'font') return
    let cancelled = false
    const controller = new AbortController()

    const fail = (message: string) => {
      if (!cancelled) setFontResult((prev) => ({ ...prev, error: message }))
    }

    const run = async () => {
      if (debouncedText.trim() === '') {
        fail(EMPTY_TEXT_ERROR)
        return
      }
      setLoading(true)
      try {
        const key = `${fontFamily}|${fontWeight}`
        let font = fontCache.current.get(key)
        if (!font) {
          const res = await fetch(
            `/api/admin/logo-3d/font?family=${encodeURIComponent(fontFamily)}&weight=${fontWeight}`,
            { signal: controller.signal }
          )
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null
            fail(body?.error ?? FONT_FETCH_ERROR)
            return
          }
          const buffer = await res.arrayBuffer()
          try {
            font = parse(buffer)
          } catch {
            fail(FONT_PARSE_ERROR)
            return
          }
          fontCache.current.set(key, font)
        }
        const result = fontToOutline(font, debouncedText)
        if (!cancelled) setFontResult((prev) => applyResult(prev, result))
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) fail(FONT_FETCH_ERROR)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [source, fontFamily, fontWeight, debouncedText])

  // SVG 모드에서 올린 파일이 없으면(svgText === '') 기본 JAM! 로고를 윤곽으로 바꿔 쓴다.
  // 올린 파일이 있으면 만들지 않는다 — 기본 로고로 덮어쓰지 않는다. 처음 화면은 폰트 모드라 서버 렌더링 중에는
  // 이 변환이 돌지 않고(DOMParser는 브라우저에만 있다), 가드로 한 번 더 막는다.
  // 효과 안에서 setState로 채우면 react-hooks/set-state-in-effect 규칙에 걸려 렌더 중 파생값으로 둔다.
  const { svgText } = state
  const defaultSvgResult = useMemo(
    () => (source === 'svg' && svgText === '' && typeof DOMParser !== 'undefined' ? svgToOutline(DEFAULT_LOGO_SVG) : null),
    [source, svgText]
  )

  const current: InputResult =
    source !== 'svg'
      ? fontResult
      : defaultSvgResult
        ? {
            outline: defaultSvgResult.error ? null : defaultSvgResult.outline,
            warnings: defaultSvgResult.warnings,
            // 올린 파일을 읽다 실패한 오류는 기본 로고 위에도 그대로 알린다.
            error: svgResult.error ?? defaultSvgResult.error,
          }
        : svgResult
  const { outline, error } = current

  // 슬라이더를 끄는 동안은 이전 값으로 두었다가 한가해질 때 형상을 다시 만든다.
  const deferredParams = useDeferredValue(state.params)
  const geometry = useMemo(() => (outline ? buildLogoGeometry(outline, deferredParams) : null), [outline, deferredParams])

  const warnings = useMemo(() => {
    const all = [...current.warnings, ...(geometry?.warnings ?? [])]
    return all.filter((w, i) => all.indexOf(w) === i)
  }, [current.warnings, geometry])

  const handleChange = useCallback((patch: Partial<Logo3DState>) => {
    setState((prev) => {
      const touchesFont = 'fontFamily' in patch || 'fontWeight' in patch || 'text' in patch
      return { ...prev, ...(touchesFont && !('source' in patch) ? { source: 'font' as const } : {}), ...patch }
    })
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

  const handleSvgFile = useCallback(async (file: File) => {
    setState((prev) => ({ ...prev, source: 'svg' }))
    if (file.size > MAX_SVG_BYTES) {
      setSvgResult((prev) => ({ ...prev, error: SVG_TOO_LARGE_ERROR }))
      return
    }
    try {
      const text = await file.text()
      const result = svgToOutline(text)
      setSvgResult((prev) => applyResult(prev, result))
      if (!result.error) setState((prev) => ({ ...prev, svgText: text, svgName: file.name }))
    } catch {
      setSvgResult((prev) => ({ ...prev, error: SVG_READ_ERROR }))
    }
  }, [])

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
