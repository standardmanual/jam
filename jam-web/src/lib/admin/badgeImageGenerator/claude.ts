import sharp from 'sharp'
import { cleanClaudeSentence } from './prompt'

/** 티켓 20261113_1131 — Claude 호출은 이 파일의 세 함수로만 한다. 모델 상수는 이 한 곳에만 둔다. */
export const CLAUDE_MODEL = 'claude-haiku-5-5'
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

export const DESCRIBE_SYSTEM = `Translate the Korean object description into ONE English sentence (15-45 words) for an image prompt.
Rules:
1. Keep only the physical appearance: shape, size cue, material, color, one state, one small imperfect detail.
2. One object, or one compact group of the same object. No people, hands, places, names.
3. No faces, eyes, expressions or human-like behavior.
4. Never mention text, letters, numbers, labels, logos or writing. Surfaces are plain.
5. No style, lighting, angle, background or evaluative words.
Output the sentence only.`

export const REVISE_SYSTEM =
  'Revise this object description to address the feedback. Keep all rules of the original sentence (one object or one compact group, no faces or eyes, no text on surfaces, no style or lighting words). Output the revised sentence only.'

export const TEXT_CHECK_SYSTEM =
  'Look at the image. Reply with exactly YES if any text, letters, numbers, symbols, signatures, logos or letter-like marks are visible anywhere, otherwise reply with exactly NO.'

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/png'; data: string } }

async function callClaude(system: string, content: string | ContentBlock[], maxTokens: number): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다.')
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
    }),
  })
  if (!res.ok) throw new Error(`Claude 호출 실패 (HTTP ${res.status})`)
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
  return (json.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
}

/** 한국어 형태 묘사 → 영어 한 문장 */
export async function describeItem(itemName: string, formDescription: string): Promise<string> {
  const text = await callClaude(DESCRIBE_SYSTEM, `Item: ${itemName}\nDescription: ${formDescription}`, 120)
  const sentence = cleanClaudeSentence(text)
  if (!sentence) throw new Error('Claude가 빈 묘사를 돌려줬습니다.')
  return sentence
}

/** 불만족 사항을 반영한 수정 문장 */
export async function reviseDescription(current: string, feedback: string): Promise<string> {
  const text = await callClaude(REVISE_SYSTEM, `Description: ${current}\nFeedback: ${feedback}`, 120)
  const sentence = cleanClaudeSentence(text)
  if (!sentence) throw new Error('Claude가 빈 묘사를 돌려줬습니다.')
  return sentence
}

/**
 * 글자 검사. 256px로 줄인 PNG 1장을 보낸다.
 * 응답이 NO로 시작할 때만 true(통과). YES·해석 불가·호출 실패는 모두 false.
 */
export async function checkImageHasNoText(png: Buffer): Promise<boolean> {
  try {
    const small = await sharp(png)
      .resize(256, 256, { fit: 'inside' })
      .flatten({ background: '#ffffff' })
      .png()
      .toBuffer()
    const text = await callClaude(
      TEXT_CHECK_SYSTEM,
      [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: small.toString('base64') } }],
      5
    )
    return text.trim().toUpperCase().startsWith('NO')
  } catch {
    return false
  }
}
