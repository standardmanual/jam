import type { BadgeImagePresetRow } from '@/types/database'

/**
 * 아이템 배지 이미지 생성기 요청 양식 (티켓 20261113_1131)
 * 최종 프롬프트 = 영어 묘사 + 고정 구도 문장 + 고정 금지 문장.
 */

export type PromptPreset = Pick<
  BadgeImagePresetRow,
  'style_id' | 'model' | 'composition_text' | 'forbid_text' | 'negative_prompt' | 'background_color'
>

export const RECRAFT_V3_MODEL = 'recraftv3'

/**
 * 프롬프트 맨 앞에 고정으로 붙는 구도 문장. Recraft는 앞쪽 단어를 우선하므로(V4 가이드),
 * 그림이 캔버스 밖으로 잘리지 않게 하는 지시를 묘사보다 먼저 둔다(2026-11-13 잘림이 잦다는 사용자 지적).
 * 운영자가 프리셋에서 지우지 못하게 코드에 고정한다.
 */
export const FRAMING_LEAD =
  'Zoomed-out shot: one small object fully inside the frame, centered, wide empty margins on all sides.'

/** Recraft 프롬프트 길이 한도(2026-11-13 실측: 1001자에서 "prompt length should be in [1, 1000]") */
export const RECRAFT_PROMPT_MAX = 1000

export function buildRecraftPrompt(description: string, preset: PromptPreset): string {
  return `${FRAMING_LEAD} ${description} ${preset.composition_text} ${preset.forbid_text}`
}

/** '#rrggbb' · 'rrggbb' · '#rgb' → [r, g, b]. 형식이 틀리면 오류 */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`배경색 형식이 올바르지 않습니다: ${hex}`)
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export interface RecraftRequestBody {
  prompt: string
  style_id: string
  model: string
  size: '1024x1024'
  n: 2
  response_format: 'url'
  negative_prompt?: string
  controls: { no_text?: boolean; background_color: { rgb: [number, number, number] } }
}

/** negative_prompt·controls.no_text는 recraftv3에서만 지원하므로 그 모델일 때만 넣는다 */
export function buildRecraftRequest(description: string, preset: PromptPreset): RecraftRequestBody {
  const prompt = buildRecraftPrompt(description, preset)
  if (prompt.length > RECRAFT_PROMPT_MAX) {
    throw new Error(
      `프롬프트가 ${prompt.length}자라 Recraft 한도(${RECRAFT_PROMPT_MAX}자)를 넘었어요. 프리셋의 고정 문장이나 영어 문장을 줄여 주세요.`
    )
  }
  const body: RecraftRequestBody = {
    prompt,
    style_id: preset.style_id,
    model: preset.model,
    size: '1024x1024',
    n: 2,
    response_format: 'url',
    controls: { background_color: { rgb: hexToRgb(preset.background_color) } },
  }
  if (preset.model === RECRAFT_V3_MODEL) {
    body.negative_prompt = preset.negative_prompt
    body.controls.no_text = true
  }
  return body
}

/** Claude 응답 문장: 앞뒤 공백·따옴표 제거, 줄바꿈은 공백으로 바꿔 한 줄로 */
export function cleanClaudeSentence(raw: string): string {
  return raw
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .trim()
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .trim()
}
