/**
 * 배지 이미지 대표색 추출 코어 (티켓 20261119_1651, 상위 20261119_1650)
 *
 * `src/lib/badgeColorExtract.ts`(서버 전용 재수출)와 `scripts/backfill-badge-bg-colors.mjs`(일괄 계산)가
 * 같은 알고리즘을 쓰도록 한 파일에 둔다. `.mjs`라서 Node 스크립트가 그대로 가져온다. 복사본을 만들지 않는다.
 *
 * 규칙(티켓 20261119_1651 「상세 요구사항」이 단일 원천):
 * - 64×64 안에 맞게 줄여 알파 200 미만 · 채도 .18 미만 · 명도 .14 미만 또는 .92 초과 픽셀을 뺀다(HSL 기준).
 * - 남은 픽셀을 색상 24구간(15°)으로 나눠 구간 점수(2×자기 + 양 이웃) 순으로, 이미 고른 색과 색상 간격이
 *   40° 이상인 구간을 최대 3개 고른다. 구간 안의 원형 평균 색상, 평균 채도·명도로 색을 만든다.
 * - 3개 미만이면 있는 색만 돌려준다. 하나도 없으면 `[]`. 결과는 밝기(HSL 명도) 높은 순 hex 배열이다.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

export const SAMPLE_SIZE = 64
export const MAX_COLORS = 3
const ALPHA_MIN = 200
const SAT_MIN = 0.18
const LIGHT_MIN = 0.14
const LIGHT_MAX = 0.92
const HUE_BINS = 24
const BIN_DEG = 360 / HUE_BINS
const MIN_HUE_GAP_DEG = 40
const FETCH_TIMEOUT_MS = 10000

/** RGB(0~255) → [h(0~360), s(0~1), l(0~1)] */
function rgbToHsl(r, g, b) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  let h
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  h *= 60
  if (h < 0) h += 360
  return [h, s, l]
}

/** [h(0~360), s, l] → '#rrggbb' */
function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  const to = (v) => Math.max(0, Math.min(255, Math.round((v + m) * 255))).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * RGBA 바이트(픽셀당 4바이트)에서 대표색을 고른다. 순수 함수다.
 * @param {Uint8Array | Uint8ClampedArray} rgba
 * @returns {string[]} 밝기 높은 순 hex 배열(0~3개)
 */
export function pickBadgeColors(rgba) {
  const bins = Array.from({ length: HUE_BINS }, () => ({ n: 0, sin: 0, cos: 0, s: 0, l: 0 }))
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < ALPHA_MIN) continue
    const [h, s, l] = rgbToHsl(rgba[i], rgba[i + 1], rgba[i + 2])
    if (s < SAT_MIN || l < LIGHT_MIN || l > LIGHT_MAX) continue
    const bin = bins[Math.min(HUE_BINS - 1, Math.floor(h / BIN_DEG))]
    const rad = (h * Math.PI) / 180
    bin.n += 1
    bin.sin += Math.sin(rad)
    bin.cos += Math.cos(rad)
    bin.s += s
    bin.l += l
  }

  const ranked = bins
    .map((bin, index) => ({
      index,
      bin,
      score: 2 * bin.n + bins[(index + HUE_BINS - 1) % HUE_BINS].n + bins[(index + 1) % HUE_BINS].n,
    }))
    .filter((e) => e.bin.n > 0)
    // 점수 같으면 구간 번호가 앞선 쪽 — 같은 입력은 항상 같은 결과다
    .sort((a, b) => b.score - a.score || a.index - b.index)

  const picked = []
  for (const { bin } of ranked) {
    if (picked.length >= MAX_COLORS) break
    let h = (Math.atan2(bin.sin, bin.cos) * 180) / Math.PI
    if (h < 0) h += 360
    if (picked.some((p) => hueDistance(p.h, h) < MIN_HUE_GAP_DEG)) continue
    picked.push({ h, s: bin.s / bin.n, l: bin.l / bin.n })
  }

  return picked
    .map((p, order) => ({ ...p, order }))
    .sort((a, b) => b.l - a.l || a.order - b.order)
    .map((p) => hslToHex(p.h, p.s, p.l))
}

/**
 * 이미지 바이트를 디코드해 대표색을 뽑는다. 디코드 실패는 예외로 올라간다.
 * @param {Buffer | Uint8Array} bytes
 * @returns {Promise<string[]>}
 */
export async function extractColorsFromBytes(bytes) {
  const { data } = await sharp(bytes)
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return pickBadgeColors(data)
}

/**
 * 이미지 주소에서 대표색을 뽑는다. 절대 주소는 fetch로, `/`로 시작하는 정적 주소는 `publicDir`에서 읽는다.
 * 어떤 실패에도 예외를 던지지 않고 `null`을 돌려준다(색은 장식이다).
 * @param {string} imageUrl
 * @param {{ publicDir?: string, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<string[] | null>}
 */
export async function extractBadgeColorsFromUrl(imageUrl, options = {}) {
  try {
    if (typeof imageUrl !== 'string' || !imageUrl.trim()) return null
    const url = imageUrl.trim()
    let bytes
    if (url.startsWith('//')) {
      return null
    } else if (url.startsWith('/')) {
      const publicDir = path.resolve(options.publicDir ?? path.join(process.cwd(), 'public'))
      const rel = decodeURIComponent(url.split(/[?#]/)[0])
      const abs = path.resolve(publicDir, `.${rel}`)
      if (!abs.startsWith(publicDir + path.sep)) return null
      bytes = await fs.readFile(abs)
    } else {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
      const res = await (options.fetchImpl ?? fetch)(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      if (!res.ok) return null
      bytes = Buffer.from(await res.arrayBuffer())
    }
    return await extractColorsFromBytes(bytes)
  } catch {
    return null
  }
}
