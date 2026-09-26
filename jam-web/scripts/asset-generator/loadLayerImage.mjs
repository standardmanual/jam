/**
 * JAM! 에셋 제너레이터 CLI — 이미지 레이어 원본 불러오기 (티켓 20260927_0100, PRD §8)
 *
 * `--img01 <절대 경로 또는 http(s) URL>`로 지정한 원본을 바이트로 읽고 검증한다. 형식은 PNG·SVG, 크기는
 * 5MB(`MAX_APPLY_IMAGE_BYTES`) 이하다. 없는 파일·큰 파일·지원하지 않는 형식·내려받기 실패는 한국어 메시지의 Error다.
 * 형식은 확장자가 아니라 파일 내용(PNG 시그니처, `<svg` 태그)으로 판별한다 — URL 뒤에 쿼리가 붙어도 안전하다.
 * 반환: `{ data: Buffer, mimeType }` — `serverImageLoader`의 입력과 같은 모양이다.
 * `deps.fetchImpl`은 시험에서 네트워크를 대신하려는 자리다.
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

export async function loadLayerImage(source, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch
  let data
  if (/^https?:\/\//i.test(source)) {
    let response
    try {
      response = await fetchImpl(source)
    } catch (e) {
      throw new Error(`이미지를 내려받지 못했어요(${e instanceof Error ? e.message : String(e)}): ${source}`)
    }
    if (!response.ok) throw new Error(`이미지를 내려받지 못했어요(HTTP ${response.status}): ${source}`)
    data = Buffer.from(await response.arrayBuffer())
  } else {
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`이미지 파일을 찾을 수 없어요: ${source}`)
    assertSize(fs.statSync(source).size, source)
    data = fs.readFileSync(source)
  }
  assertSize(data.length, source)
  const mimeType = detectImageMimeType(data)
  if (!mimeType) throw new Error(`지원하지 않는 이미지 형식이에요(PNG·SVG만 쓸 수 있어요): ${source}`)
  return { data, mimeType }
}
