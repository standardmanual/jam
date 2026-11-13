import { RECRAFT_PROMPT_MAX, RECRAFT_V3_MODEL, type PromptPreset, type RecraftRequestBody } from './prompt'

/** 티켓 20261113_1131 — Recraft 호출은 이 파일로만 한다. 키는 요청 헤더에만 쓰고 어디에도 기록하지 않는다. */
const RECRAFT_BASE = 'https://external.api.recraft.ai/v1'

function authHeader(): Record<string, string> {
  const key = process.env.RECRAFT_API_KEY
  if (!key) throw new Error('RECRAFT_API_KEY가 설정되지 않았습니다.')
  return { Authorization: `Bearer ${key}` }
}

/**
 * Recraft 오류 응답({code, message})을 운영자가 알아볼 문장으로 바꾼다.
 * 2026-11-13 크레딧이 바닥났는데 화면에 「HTTP 400」만 보여 원인을 몰랐던 일이 있었다.
 */
export async function recraftErrorMessage(res: Response, label: string): Promise<string> {
  let code = ''
  let message = ''
  try {
    const body = (await res.json()) as { code?: string; message?: string }
    code = body.code ?? ''
    message = body.message ?? ''
  } catch {
    // 본문이 JSON이 아니면 상태 코드만 쓴다
  }
  if (code === 'not_enough_credits') {
    return `Recraft 크레딧이 부족해서 ${label}에 실패했어요. Recraft에서 크레딧을 충전한 뒤 다시 시도해 주세요.`
  }
  const detail = [code, message].filter(Boolean).join(': ')
  return `Recraft ${label} 실패 (HTTP ${res.status}${detail ? `, ${detail}` : ''})`
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
  if (!res.ok) throw new Error(await recraftErrorMessage(res, '생성'))
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
  if (!res.ok) throw new Error(await recraftErrorMessage(res, '배경 제거'))
  const json = (await res.json()) as { image?: { url?: string } }
  const url = json.image?.url
  if (!url) throw new Error('Recraft가 배경 제거 결과를 돌려주지 않았습니다.')
  return downloadImage(url)
}

/** 티켓 20261113_1332 — 후처리 편집 4종. 결과 PNG를 내려받아 돌려준다 */
type EditPreset = Pick<PromptPreset, 'style_id' | 'model' | 'forbid_text' | 'negative_prompt'>

function withForbid(prompt: string, preset: EditPreset): string {
  const full = `${prompt} ${preset.forbid_text}`.trim()
  if (full.length > RECRAFT_PROMPT_MAX) {
    throw new Error(`편집 프롬프트가 ${full.length}자라 Recraft 한도(${RECRAFT_PROMPT_MAX}자)를 넘었어요.`)
  }
  return full
}

function pngBlob(png: Buffer): Blob {
  return new Blob([new Uint8Array(png)], { type: 'image/png' })
}

/** V3 프리셋이면 style_id·negative_prompt를 넣는다. 아니면 style_id 없이 모델을 V3로 고정한다(문서상 V3 전용) */
function appendModelFields(form: FormData, preset: EditPreset) {
  form.append('model', RECRAFT_V3_MODEL)
  if (preset.model === RECRAFT_V3_MODEL) {
    form.append('style_id', preset.style_id)
    form.append('negative_prompt', preset.negative_prompt)
  }
  form.append('n', '1')
  form.append('response_format', 'url')
}

async function postEdit(path: string, label: string, form: FormData): Promise<Buffer> {
  const res = await fetch(`${RECRAFT_BASE}/images/${path}`, { method: 'POST', headers: authHeader(), body: form })
  if (!res.ok) throw new Error(await recraftErrorMessage(res, label))
  const json = (await res.json()) as { image?: { url?: string }; data?: Array<{ url?: string }> }
  const url = json.image?.url ?? json.data?.[0]?.url
  if (!url) throw new Error(`Recraft가 ${label} 결과를 돌려주지 않았습니다.`)
  return downloadImage(url)
}

export async function eraseRegion(png: Buffer, maskPng: Buffer): Promise<Buffer> {
  const form = new FormData()
  form.append('image', pngBlob(png), 'image.png')
  form.append('mask', pngBlob(maskPng), 'mask.png')
  form.append('response_format', 'url')
  return postEdit('eraseRegion', '영역 지우기', form)
}

export async function inpaint(png: Buffer, maskPng: Buffer, prompt: string, preset: EditPreset): Promise<Buffer> {
  const form = new FormData()
  form.append('image', pngBlob(png), 'image.png')
  form.append('mask', pngBlob(maskPng), 'mask.png')
  form.append('prompt', withForbid(prompt, preset))
  appendModelFields(form, preset)
  return postEdit('inpaint', '영역 다시 그리기', form)
}

export async function outpaint(png: Buffer, prompt: string, zoomOut: number, preset: EditPreset): Promise<Buffer> {
  const form = new FormData()
  form.append('image', pngBlob(png), 'image.png')
  // 넓힌 바깥은 원래 배경과 이어져야 한다. style_id를 함께 보내면 스타일이 배경을 다른 색(실측: 빨강)으로
  // 칠해 원래 그림이 네모로 남는다(2026-11-13 같은 이미지 비교 시험). 그래서 바깥 넓히기에는 style_id를 넣지 않는다.
  form.append('prompt', withForbid(`${prompt}, on a plain solid background that continues the existing background`, preset))
  form.append('zoom_out_percentage', String(Math.round(zoomOut)))
  form.append('model', RECRAFT_V3_MODEL)
  if (preset.model === RECRAFT_V3_MODEL) form.append('negative_prompt', preset.negative_prompt)
  form.append('n', '1')
  form.append('response_format', 'url')
  return postEdit('outpaint', '바깥 넓히기', form)
}

export async function imageToImage(png: Buffer, prompt: string, strength: number, preset: EditPreset): Promise<Buffer> {
  const form = new FormData()
  form.append('image', pngBlob(png), 'image.png')
  form.append('prompt', withForbid(prompt, preset))
  form.append('strength', String(strength))
  appendModelFields(form, preset)
  return postEdit('imageToImage', '이미지 기반 재생성', form)
}
