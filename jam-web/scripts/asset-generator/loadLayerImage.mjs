/**
 * JAM! 에셋 제너레이터 CLI — 이미지 레이어 원본 불러오기 (티켓 20260927_0100, PRD §8)
 *
 * `--img01 <절대 경로 또는 https URL>`로 지정한 원본을 바이트로 읽고 검증한다. 형식은 PNG·SVG, 크기는
 * 5MB(`MAX_APPLY_IMAGE_BYTES`) 이하다. 없는 파일·큰 파일·지원하지 않는 형식·내려받기 실패는 한국어 메시지의 Error다.
 * 형식은 확장자가 아니라 파일 내용(PNG 시그니처, `<svg` 태그)으로 판별한다 — URL 뒤에 쿼리가 붙어도 안전하다.
 * 반환: `{ data: Buffer, mimeType }` — `serverImageLoader`의 입력과 같은 모양이다.
 * URL은 https만 받고, 15초 시간 제한·5MB 상한(`Content-Length`와 스트리밍 양쪽)을 걸며, 오류 문구에는 주소의 쿼리·해시를 싣지 않는다(티켓 20261007_1601).
 * `deps.fetchImpl`·`deps.timeoutMs`는 시험에서 네트워크를 대신하려는 자리다.
 */
import fs from 'node:fs'

import { MAX_APPLY_IMAGE_BYTES } from '../../src/lib/admin/applyGeneratedImageConstants'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** 바이트 내용으로 형식을 판별한다. PNG·SVG가 아니면 null. */
export function detectImageMimeType(data) {
  if (data.length >= PNG_SIGNATURE.length && data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return 'image/png'
  if (/<svg[\s>]/i.test(data.subarray(0, 4096).toString('utf8'))) return 'image/svg+xml'
  return null
}

function assertSize(byteLength, source) {
  if (byteLength > MAX_APPLY_IMAGE_BYTES) {
    throw new Error(`이미지가 너무 커요(${(byteLength / 1024 / 1024).toFixed(1)}MB). ${MAX_APPLY_IMAGE_BYTES / 1024 / 1024}MB 이하만 쓸 수 있어요: ${source}`)
  }
}

/** URL 내려받기 시간 제한(ms). 브라우저 쪽 `browserImageLoader`의 15초와 같다. */
export const FETCH_TIMEOUT_MS = 15_000

/** 오류 문구에 찍을 주소 — 쿼리·해시(서명 토큰 등)는 뺀다. */
function safeSource(source) {
  try {
    const u = new URL(source)
    u.search = ''
    u.hash = ''
    return u.toString()
  } catch {
    return source.split(/[?#]/)[0]
  }
}

function tooLarge(source) {
  return new Error(`이미지가 너무 커요. ${MAX_APPLY_IMAGE_BYTES / 1024 / 1024}MB 이하만 쓸 수 있어요: ${source}`)
}

/** 본문을 스트리밍으로 읽다가 상한을 넘으면 중단한다. */
async function readBodyLimited(response, source) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buf = Buffer.from(await response.arrayBuffer())
    if (buf.length > MAX_APPLY_IMAGE_BYTES) throw tooLarge(source)
    return buf
  }
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_APPLY_IMAGE_BYTES) {
      await reader.cancel().catch(() => {})
      throw tooLarge(source)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

async function downloadImage(source, deps) {
  const fetchImpl = deps.fetchImpl ?? fetch
  const shown = safeSource(source)
  if (!/^https:\/\//i.test(source)) throw new Error(`이미지 주소는 https만 쓸 수 있어요: ${shown}`)
  const timeoutMs = deps.timeoutMs ?? FETCH_TIMEOUT_MS
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  try {
    let response
    try {
      response = await fetchImpl(source, { signal: controller.signal })
    } catch (e) {
      if (timedOut) throw new Error(`이미지를 내려받는 데 시간이 너무 오래 걸려요(${timeoutMs / 1000}초 초과): ${shown}`)
      throw new Error(`이미지를 내려받지 못했어요(${e instanceof Error ? e.message : String(e)}): ${shown}`)
    }
    if (!response.ok) throw new Error(`이미지를 내려받지 못했어요(HTTP ${response.status}): ${shown}`)
    const declared = Number(response.headers?.get?.('content-length'))
    if (Number.isFinite(declared) && declared > MAX_APPLY_IMAGE_BYTES) throw tooLarge(shown)
    try {
      return await readBodyLimited(response, shown)
    } catch (e) {
      if (timedOut) throw new Error(`이미지를 내려받는 데 시간이 너무 오래 걸려요(${timeoutMs / 1000}초 초과): ${shown}`)
      throw e
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function loadLayerImage(source, deps = {}) {
  let data
  if (/^https?:\/\//i.test(source)) {
    data = await downloadImage(source, deps)
  } else {
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`이미지 파일을 찾을 수 없어요: ${source}`)
    assertSize(fs.statSync(source).size, source)
    data = fs.readFileSync(source)
  }
  assertSize(data.length, source)
  const mimeType = detectImageMimeType(data)
  if (!mimeType) throw new Error(`지원하지 않는 이미지 형식이에요(PNG·SVG만 쓸 수 있어요): ${safeSource(source)}`)
  return { data, mimeType }
}
