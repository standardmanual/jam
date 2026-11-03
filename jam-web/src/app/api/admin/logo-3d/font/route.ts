import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRead } from '@/lib/admin/auth'
import { GOOGLE_FONT_CATALOG } from '@/lib/admin/googleFonts'

/**
 * 3D 로고 제너레이터 — 구글 폰트 TTF 중계 API (티켓 20261103_1351)
 *
 * 구글 폰트 공개 스타일시트(`fonts.googleapis.com/css2`)는 브라우저 요청에 woff2만 돌려주는데,
 * 글자 윤곽을 읽는 `opentype.js`는 woff2를 읽지 못한다. TTF는 구형 사용자 에이전트로 요청해야
 * 받을 수 있고 브라우저는 이 헤더를 바꿀 수 없으므로 서버가 대신 받아 중계한다.
 *
 * 요청 주소를 서버가 만든다는 점이 위험 지점이다 — `family`는 카탈로그에 있는 이름만, `weight`는
 * 100~900의 100 단위만 받고, 본문을 받아 오는 주소는 `https://fonts.gstatic.com/`인 경우만 허용한다.
 * 한글 폰트는 6MB를 넘기도 한다(Noto Sans KR 700이 약 6.0MB). 서버리스 응답 본문 한도를 피하려고 받은
 * 본문을 읽어 담지 않고 스트림 그대로 흘려보낸다.
 */

// 스타일시트 응답이 TTF(`format('truetype')`)로 오게 하는 구형 사용자 에이전트(2026-11-03 실측: Safari 4).
// 최신 에이전트는 woff2, 크롬 11 에이전트는 woff를 돌려준다.
const LEGACY_USER_AGENT =
  'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_5_8; en-us) AppleWebKit/531.9 (KHTML, like Gecko) Version/4.0.3 Safari/531.9'

const FONT_FILE_HOST = 'fonts.gstatic.com'
const UPSTREAM_TIMEOUT_MS = 15_000
const MAX_FONT_BYTES = 40 * 1024 * 1024
// 폰트 파일은 버전이 주소에 들어 있어 바뀌지 않는다. 하루는 브라우저가 들고 있어도 된다.
const CACHE_CONTROL = 'private, max-age=86400'

const FAMILY_SET = new Set(GOOGLE_FONT_CATALOG.map((entry) => entry.family))

// 오류 문장은 현상 → 원인 → 해결책 순서다. 외부 응답 원문은 싣지 않는다.
const FAMILY_ERROR_MESSAGE =
  '폰트를 불러오지 못했어요. 목록에 없는 폰트 이름이에요. 폰트 검색 결과에서 고른 이름으로 다시 시도해 주세요.'
const WEIGHT_ERROR_MESSAGE =
  '폰트를 불러오지 못했어요. 굵기 값이 100부터 900까지 100 단위가 아니에요. 굵기를 다시 골라 주세요.'
const WEIGHT_MISSING_MESSAGE =
  '폰트를 불러오지 못했어요. 이 폰트에는 고른 굵기의 파일이 없어요. 다른 굵기를 골라 주세요.'
const UPSTREAM_ERROR_MESSAGE =
  '폰트를 불러오지 못했어요. 구글 폰트 서버에서 응답을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.'
const FILE_ERROR_MESSAGE =
  '폰트를 불러오지 못했어요. 구글 폰트가 TTF 파일 주소를 돌려주지 않았어요. 다른 폰트를 골라 주세요.'
const TOO_LARGE_MESSAGE = '폰트를 불러오지 못했어요. 폰트 파일이 너무 커요. 다른 폰트를 골라 주세요.'

function fail(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

function parseWeight(raw: string | null): number | null {
  if (raw === null) return 400
  if (!/^[1-9]00$/.test(raw)) return null
  return Number(raw)
}

/** 스타일시트 본문에서 `fonts.gstatic.com`의 https 주소 하나를 고른다. 없으면 null. */
function findFontFileUrl(css: string): string | null {
  const pattern = /url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g
  for (const match of css.matchAll(pattern)) {
    try {
      const url = new URL(match[1])
      if (url.protocol === 'https:' && url.hostname === FONT_FILE_HOST) return url.toString()
    } catch {
      // 주소가 아닌 값은 건너뛴다.
    }
  }
  return null
}

export async function GET(req: NextRequest) {
  const denied = await requireAdminRead(req)
  if (denied) return denied

  const family = req.nextUrl.searchParams.get('family')
  if (!family || !FAMILY_SET.has(family)) return fail(FAMILY_ERROR_MESSAGE, 400)

  const weight = parseWeight(req.nextUrl.searchParams.get('weight'))
  if (weight === null) return fail(WEIGHT_ERROR_MESSAGE, 400)

  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weight}`

  let css: string
  try {
    const cssRes = await fetch(cssUrl, {
      headers: { 'user-agent': LEGACY_USER_AGENT },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    if (cssRes.status === 400 || cssRes.status === 404) return fail(WEIGHT_MISSING_MESSAGE, 404)
    if (!cssRes.ok) return fail(UPSTREAM_ERROR_MESSAGE, 502)
    css = await cssRes.text()
  } catch (error) {
    console.error('[logo-3d/font] 스타일시트 요청 실패', error)
    return fail(UPSTREAM_ERROR_MESSAGE, 502)
  }

  const fileUrl = findFontFileUrl(css)
  if (!fileUrl) return fail(FILE_ERROR_MESSAGE, 502)

  try {
    const fileRes = await fetch(fileUrl, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
    if (!fileRes.ok || !fileRes.body) return fail(UPSTREAM_ERROR_MESSAGE, 502)
    const length = Number(fileRes.headers.get('content-length') ?? '')
    if (Number.isFinite(length) && length > MAX_FONT_BYTES) return fail(TOO_LARGE_MESSAGE, 502)

    return new NextResponse(fileRes.body, {
      status: 200,
      headers: { 'content-type': 'font/ttf', 'cache-control': CACHE_CONTROL },
    })
  } catch (error) {
    console.error('[logo-3d/font] 폰트 파일 요청 실패', error)
    return fail(UPSTREAM_ERROR_MESSAGE, 502)
  }
}
