import type { RecraftRequestBody } from './prompt'

/** 티켓 20261113_1131 — Recraft 호출은 이 파일로만 한다. 키는 요청 헤더에만 쓰고 어디에도 기록하지 않는다. */
const RECRAFT_BASE = 'https://external.api.recraft.ai/v1'

function authHeader(): Record<string, string> {
  const key = process.env.RECRAFT_API_KEY
  if (!key) throw new Error('RECRAFT_API_KEY가 설정되지 않았습니다.')
  return { Authorization: `Bearer ${key}` }
}

export async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`이미지 다운로드 실패 (HTTP ${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}

/** 후보 이미지 주소 목록(Recraft 임시 주소)을 돌려준다 */
export async function generateCandidates(body: RecraftRequestBody): Promise<string[]> {
  const res = await fetch(`${RECRAFT_BASE}/images/generations`, {
    method: 'POST',
    headers: { ...authHeader(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Recraft 생성 실패 (HTTP ${res.status})`)
  const json = (await res.json()) as { data?: Array<{ url?: string }> }
  const urls = (json.data ?? []).map((d) => d.url).filter((u): u is string => Boolean(u))
  if (urls.length === 0) throw new Error('Recraft가 이미지를 돌려주지 않았습니다.')
  return urls
}

/** 배경 제거: 투명 배경 PNG를 돌려준다 */
export async function removeBackground(png: Buffer): Promise<Buffer> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'candidate.png')
  form.append('response_format', 'url')
  const res = await fetch(`${RECRAFT_BASE}/images/removeBackground`, {
    method: 'POST',
    headers: authHeader(),
    body: form,
  })
  if (!res.ok) throw new Error(`Recraft 배경 제거 실패 (HTTP ${res.status})`)
  const json = (await res.json()) as { image?: { url?: string } }
  const url = json.image?.url
  if (!url) throw new Error('Recraft가 배경 제거 결과를 돌려주지 않았습니다.')
  return downloadImage(url)
}
