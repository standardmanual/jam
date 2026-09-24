/**
 * JAM! 에셋 제너레이터 — 서버 글꼴 로더 (티켓 20260924_2201)
 *
 * 프리셋 텍스트 레이어의 글꼴 식별자(`{ family, weight }`, types.ts TextLayerFont)에 해당하는
 * 구글 폰트 파일을 내려받아 `os.tmpdir()` 아래 캐시하고 `@napi-rs/canvas`(GlobalFonts)에
 * 등록한다 — render.ts의 FontLoader 계약(83줄) 구현체다.
 *
 * 브라우저 로더(`assetGeneratorHelpers.ts`의 `loadFontInBrowser`)는 항상 굵기 400
 * 스타일시트만 요청하는 한계가 있다(티켓 20260925_0148) — 서버는 지정 굵기 파일을 그대로
 * 내려받으므로 이 한계가 없다.
 *
 * 내려받기 실패 시 기본 글꼴로 대체하지 않고 오류를 던진다(호출부가 프로세스를 종료 코드
 * 1로 끝내게 한다) — 컨펌 자료가 어드민 화면과 달라지는 것을 막기 위함(PRD §8·완료 조건).
 *
 * TTF 확보 방식(2026-09-25 실측): 구글 폰트 css2 공개 엔드포인트(`fonts.googleapis.com/css2`,
 * API 키 불필요 — `assetGeneratorHelpers.ts`의 `buildGoogleFontCssUrl`과 같은 엔드포인트)는
 * 요청 User-Agent로 응답 포맷을 바꾼다. 브라우저를 사칭하는 최신 UA로 요청하면 woff/woff2가
 * 오지만, 브라우저를 사칭하지 않는 UA(또는 UA 없음)로 요청하면 `format('truetype')` 링크가
 * 온다 — curl·Node 기본 fetch로 직접 확인했다. `@napi-rs/canvas`의 `GlobalFonts.registerFromPath`가
 * TTF를 그대로 읽으므로 별도 변환이 필요 없다.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { GlobalFonts } from '@napi-rs/canvas'

/** assetGeneratorHelpers.ts의 SYSTEM_DEFAULT_FONT.family와 값 계약(중복 정의) — 이 값이면
 *  구글 폰트 다운로드 대상이 아니라 시스템 기본 글꼴이다(등록 없이 통과, PRD §8). */
export const SYSTEM_DEFAULT_FONT_FAMILY = 'system-ui'

const CACHE_DIR_NAME = 'jam-asset-generator-fonts'
/** 브라우저를 사칭하지 않는 UA — 구글 폰트 css2가 TTF를 돌려주는 조건(파일 상단 주석 실측). */
const REQUEST_USER_AGENT = 'JAM-asset-generator-cli/1.0 (+https://j-a-m.app)'

/** 파일 시스템에 안전한 캐시 파일 이름으로 바꾼다(공백·슬래시 등을 밑줄로 치환). */
function sanitizeForFileName(value) {
  return value.replace(/[^a-zA-Z0-9-]+/g, '_')
}

/** family·weight로 캐시 파일 절대 경로를 계산한다(순수 함수). */
export function getFontCachePath(family, weight) {
  const fileName = `${sanitizeForFileName(family)}-${weight}.ttf`
  return path.join(os.tmpdir(), CACHE_DIR_NAME, fileName)
}

/** 구글 폰트 css2 URL(굵기 하나 고정). `assetGeneratorHelpers.ts`의 `buildGoogleFontCssUrl`과
 *  같은 엔드포인트를 굵기 파라미터만 다르게 쓴다(그 함수는 굵기 400 고정, 이 함수는 인자로 받는다). */
export function buildGoogleFontCssUrl(family, weight) {
  const familyParam = family.trim().replace(/\s+/g, '+')
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(familyParam).replace(/%2B/g, '+')}:wght@${weight}&display=swap`
}

/** css2 응답 본문에서 TTF 파일 URL을 뽑는다. 없으면 오류(존재하지 않는 폰트·굵기 조합 등). */
export function extractTtfUrl(cssText) {
  const match = cssText.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/)
  if (!match) {
    throw new Error('구글 폰트 응답에서 TTF 파일 주소를 찾지 못했어요.')
  }
  return match[1]
}

/** 구글 폰트 TTF 파일을 내려받는다(네트워크). 실패하면 한국어 메시지의 오류를 던진다. */
async function downloadGoogleFontTtf(family, weight) {
  const cssRes = await fetch(buildGoogleFontCssUrl(family, weight), {
    headers: { 'User-Agent': REQUEST_USER_AGENT },
  })
  if (!cssRes.ok) {
    throw new Error(`"${family}" ${weight} 글꼴 스타일시트를 불러오지 못했어요 (HTTP ${cssRes.status}).`)
  }
  const cssText = await cssRes.text()
  const ttfUrl = extractTtfUrl(cssText)
  const fontRes = await fetch(ttfUrl)
  if (!fontRes.ok) {
    throw new Error(`"${family}" ${weight} 글꼴 파일을 내려받지 못했어요 (HTTP ${fontRes.status}).`)
  }
  return Buffer.from(await fontRes.arrayBuffer())
}

/** 캐시에 없으면 내려받아 저장하고, 있으면 그대로 쓴다. 캐시 파일 절대 경로를 돌려준다. */
export async function ensureFontCached(family, weight) {
  const cachePath = getFontCachePath(family, weight)
  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
    return cachePath
  }
  const buffer = await downloadGoogleFontTtf(family, weight)
  fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  fs.writeFileSync(cachePath, buffer)
  return cachePath
}

// 이번 프로세스 안에서 이미 등록한 family|weight 조합(중복 등록 방지, 굳이 다시 registerFromPath를
// 부르지 않는다 — 같은 family의 다른 굵기는 각자 다른 키라 따로 등록된다).
const registeredKeys = new Set()

/** render.ts의 FontLoader 계약을 구현한다(서버, @napi-rs/canvas). */
export function createServerFontLoader() {
  return async function serverFontLoader(font) {
    if (font.family === SYSTEM_DEFAULT_FONT_FAMILY) return
    const key = `${font.family}|${font.weight}`
    if (registeredKeys.has(key)) return
    const cachePath = await ensureFontCached(font.family, font.weight)
    const fontKey = GlobalFonts.registerFromPath(cachePath, font.family)
    if (!fontKey) {
      throw new Error(`"${font.family}" ${font.weight} 글꼴을 등록하지 못했어요.`)
    }
    registeredKeys.add(key)
  }
}
