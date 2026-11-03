/**
 * 3D 로고 입력(폰트·SVG) → 윤곽 변환의 순수 로직 (티켓 20261103_1734, 별도 3D 화면의 코드를 옮김)
 *
 * 훅(`useLogo3DOutline`)이 상태·효과를 맡고, 여기에는 네트워크·변환·결과 합치기만 둔다.
 * 실패하면 윤곽은 이전 값을 그대로 두고 오류만 채우는 규칙이 이 파일의 중심이다.
 */
import { parse, type Font } from 'opentype.js'
import { fontToOutline } from '@/lib/logo-3d/fontOutline'
import { svgToOutline } from '@/lib/logo-3d/svgOutline'
import type { LogoOutline } from '@/lib/logo-3d/types'
import { DEFAULT_LOGO_SVG } from './logo3dDefaultSvg'

export const TEXT_DEBOUNCE_MS = 300
export const MAX_SVG_BYTES = 5 * 1024 * 1024

export const FONT_FETCH_ERROR =
  '폰트를 불러오지 못했어요. 네트워크 응답을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.'
export const FONT_PARSE_ERROR =
  '글자 윤곽을 만들지 못했어요. 폰트 파일을 읽을 수 없어요. 다른 폰트나 굵기를 골라 주세요.'
export const EMPTY_TEXT_ERROR = '글자 윤곽을 만들지 못했어요. 글자열이 비어 있어요. 로고로 만들 글자를 입력해 주세요.'
export const SVG_TOO_LARGE_ERROR = 'SVG를 읽지 못했어요. 파일이 5MB보다 커요. 더 가벼운 SVG로 다시 올려 주세요.'
export const SVG_READ_ERROR = 'SVG를 읽지 못했어요. 파일을 열 수 없어요. 파일을 확인하고 다시 올려 주세요.'

/** 입력(폰트·SVG)마다 따로 둔다. 실패하면 `outline`은 이전 값을 그대로 두고 `error`만 채운다. */
export type InputResult = { outline: LogoOutline | null; warnings: string[]; error: string | null }
export const EMPTY_INPUT_RESULT: InputResult = { outline: null, warnings: [], error: null }

/** 변환 한 번의 결과. 실패하면 `error`가 있고 윤곽은 비어 있다(`null` 또는 빈 배열). */
export type OutlineOutcome = { outline: LogoOutline | null; warnings: string[]; error: string | null }

/** 변환 결과를 이전 값에 합친다. 오류면 이전 윤곽·경고를 두고 오류만 바꾼다. */
export function applyResult(prev: InputResult, next: OutlineOutcome): InputResult {
  if (next.error) return { ...prev, error: next.error }
  return { outline: next.outline, warnings: next.warnings, error: null }
}

export type FontCache = Map<string, Font>

/**
 * 폰트 입력 → 윤곽. 폰트는 서버 중계에서 받아 `family|weight`로 캐시한다.
 * 받기·읽기·변환이 실패하면 `error`만 채운 결과를 돌려준다 — 호출자는 `applyResult`로 이전 형상을 유지한다.
 * 요청이 취소되면(`AbortError`) `null`을 돌려준다.
 */
export async function resolveFontOutline(args: {
  family: string
  weight: number
  text: string
  cache: FontCache
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}): Promise<OutlineOutcome | null> {
  const { family, weight, text, cache, signal } = args
  const fail = (error: string): OutlineOutcome => ({ outline: null, warnings: [], error })
  if (text.trim() === '') return fail(EMPTY_TEXT_ERROR)
  try {
    const key = `${family}|${weight}`
    let font = cache.get(key)
    if (!font) {
      const doFetch = args.fetchImpl ?? fetch
      const res = await doFetch(`/api/admin/logo-3d/font?family=${encodeURIComponent(family)}&weight=${weight}`, { signal })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        return fail(body?.error ?? FONT_FETCH_ERROR)
      }
      const buffer = await res.arrayBuffer()
      try {
        font = parse(buffer)
      } catch {
        return fail(FONT_PARSE_ERROR)
      }
      cache.set(key, font)
    }
    return fontToOutline(font, text)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    return fail(FONT_FETCH_ERROR)
  }
}

/** 올린 SVG 파일을 읽어 윤곽으로 바꾼다. 크기 제한과 읽기 실패는 `error`로 알린다. */
export async function resolveSvgFile(file: File): Promise<(OutlineOutcome & { text: string }) | { error: string }> {
  if (file.size > MAX_SVG_BYTES) return { error: SVG_TOO_LARGE_ERROR }
  try {
    const text = await file.text()
    return { ...svgToOutline(text), text }
  } catch {
    return { error: SVG_READ_ERROR }
  }
}

/**
 * 「SVG 파일」 모드에서 올린 파일이 없으면(`svgText === ''`) 기본 JAM! 로고를 윤곽으로 바꾼다. 올린 파일이 있으면 만들지 않는다.
 * DOMParser는 브라우저에만 있어 서버 렌더링 중에는 만들지 않는다.
 */
export function defaultLogoOutline(source: 'font' | 'svg', svgText: string): OutlineOutcome | null {
  if (source !== 'svg' || svgText !== '' || typeof DOMParser === 'undefined') return null
  return svgToOutline(DEFAULT_LOGO_SVG)
}

/** 지금 입력에 해당하는 결과를 고른다. SVG 모드에서 기본 로고가 있으면 그것 위에 올린 파일의 오류를 겹쳐 알린다. */
export function pickInputResult(args: {
  source: 'font' | 'svg'
  fontResult: InputResult
  svgResult: InputResult
  defaultOutcome: OutlineOutcome | null
}): InputResult {
  const { source, fontResult, svgResult, defaultOutcome } = args
  if (source !== 'svg') return fontResult
  if (!defaultOutcome) return svgResult
  return {
    outline: defaultOutcome.error ? null : defaultOutcome.outline,
    warnings: defaultOutcome.warnings,
    // 올린 파일을 읽다 실패한 오류는 기본 로고 위에도 그대로 알린다.
    error: svgResult.error ?? defaultOutcome.error,
  }
}
