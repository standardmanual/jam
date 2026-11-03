'use client'

/**
 * 폰트·SVG 입력 → 윤곽 → 3D 형상을 만드는 훅 (티켓 20261103_1734, 별도 3D 화면의 효과를 옮김)
 *
 * - 글자열은 300ms 디바운스, 폰트는 `family|weight`로 캐시한다.
 * - 변환이 실패하면 오류만 알리고 이전 형상을 유지한다.
 * - SVG 모드에서 올린 파일이 없으면 기본 JAM! 로고를 보여 준다.
 * - `enabled`가 거짓이면 폰트를 받지도, 형상을 만들지도 않는다(에셋 화면에서 3D 모드가 아닐 때).
 *   형상이 `null`로 돌아가면 뷰포트가 이전 형상의 geometry·material을 해제한다.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { buildLogoGeometry, type LogoGeometry } from '@/lib/logo-3d/buildGeometry'
import type { Logo3DParams } from '@/lib/logo-3d/types'
import type { Logo3DSource } from './logo3dConfig'
import {
  applyResult,
  defaultLogoOutline,
  EMPTY_INPUT_RESULT,
  pickInputResult,
  resolveFontOutline,
  resolveSvgFile,
  TEXT_DEBOUNCE_MS,
  type FontCache,
  type InputResult,
} from './outlineSource'

export type Logo3DOutlineInput = {
  enabled: boolean
  source: Logo3DSource
  fontFamily: string
  fontWeight: number
  text: string
  svgText: string
  params: Logo3DParams
}

export type Logo3DOutlineOutput = {
  geometry: LogoGeometry | null
  warnings: string[]
  error: string | null
  loading: boolean
  /** 올린 SVG 파일을 읽는다. 성공하면 상태에 저장할 원문·파일 이름을, 실패하면 `null`을 돌려준다(오류는 `error`로 나온다). */
  loadSvgFile: (file: File) => Promise<{ text: string; name: string } | null>
}

export function useLogo3DOutline(input: Logo3DOutlineInput): Logo3DOutlineOutput {
  const { enabled, source, fontFamily, fontWeight, text, svgText, params } = input
  const fontCache = useRef<FontCache>(new Map())
  const [debouncedText, setDebouncedText] = useState(text)
  const [fontResult, setFontResult] = useState<InputResult>(EMPTY_INPUT_RESULT)
  const [svgResult, setSvgResult] = useState<InputResult>(EMPTY_INPUT_RESULT)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedText(text), TEXT_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text])

  // 폰트 입력 → 윤곽. 실패하면 오류만 알리고 이전 형상을 유지한다.
  useEffect(() => {
    if (!enabled || source !== 'font') return
    let cancelled = false
    const controller = new AbortController()

    const run = async () => {
      setLoading(true)
      try {
        const outcome = await resolveFontOutline({
          family: fontFamily,
          weight: fontWeight,
          text: debouncedText,
          cache: fontCache.current,
          signal: controller.signal,
        })
        if (!cancelled && outcome) setFontResult((prev) => applyResult(prev, outcome))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()

    return () => {
      cancelled = true
      controller.abort()
      // 취소된 요청은 자기 몫의 로딩 해제를 하지 않는다 — 모드를 떠나거나 입력을 바꿔 새 요청이 없을 때 로딩이 남지 않게 여기서 내린다.
      setLoading(false)
    }
  }, [enabled, source, fontFamily, fontWeight, debouncedText])

  // 효과 안에서 setState로 채우면 react-hooks/set-state-in-effect 규칙에 걸려 렌더 중 파생값으로 둔다.
  const defaultOutcome = useMemo(() => (enabled ? defaultLogoOutline(source, svgText) : null), [enabled, source, svgText])
  const current = pickInputResult({ source, fontResult, svgResult, defaultOutcome })
  const { outline, error } = current

  // 슬라이더를 끄는 동안은 이전 값으로 두었다가 한가해질 때 형상을 다시 만든다.
  const deferredParams = useDeferredValue(params)
  const geometry = useMemo(
    () => (enabled && outline ? buildLogoGeometry(outline, deferredParams) : null),
    [enabled, outline, deferredParams]
  )

  const warnings = useMemo(() => {
    const all = [...current.warnings, ...(geometry?.warnings ?? [])]
    return all.filter((w, i) => all.indexOf(w) === i)
  }, [current.warnings, geometry])

  const loadSvgFile = useCallback(async (file: File) => {
    const result = await resolveSvgFile(file)
    if (!('text' in result)) {
      setSvgResult((prev) => ({ ...prev, error: result.error }))
      return null
    }
    setSvgResult((prev) => applyResult(prev, result))
    return result.error ? null : { text: result.text, name: file.name }
  }, [])

  return { geometry, warnings, error, loading: enabled && loading, loadSvgFile }
}
