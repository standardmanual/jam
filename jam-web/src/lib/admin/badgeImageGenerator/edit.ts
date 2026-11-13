import sharp from 'sharp'
import { RECRAFT_PROMPT_MAX } from './prompt'

/** 티켓 20261113_1332 — 후처리 편집의 마스크 생성과 Claude 계획 검증 */

export type EditOperation = 'erase' | 'inpaint' | 'outpaint' | 'restyle'
export type EditBox = [number, number, number, number]

export interface EditPlan {
  operation: EditOperation
  boxes: EditBox[]
  prompt: string
  zoom_out: number
  strength: number
  reason_ko: string
}

const OPERATIONS: EditOperation[] = ['erase', 'inpaint', 'outpaint', 'restyle']

export class EditPlanError extends Error {}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** 원본과 같은 크기의 회색조 PNG. 상자 안 255, 밖 0(중간값 없음) */
export async function buildMaskPng(width: number, height: number, boxes: EditBox[]): Promise<Buffer> {
  const data = Buffer.alloc(width * height, 0)
  for (const [x0, y0, x1, y1] of boxes) {
    const px0 = clamp(Math.floor(x0 * width), 0, width)
    const px1 = clamp(Math.ceil(x1 * width), 0, width)
    const py0 = clamp(Math.floor(y0 * height), 0, height)
    const py1 = clamp(Math.ceil(y1 * height), 0, height)
    for (let y = py0; y < py1; y++) data.fill(255, y * width + px0, y * width + px1)
  }
  return sharp(data, { raw: { width, height, channels: 1 } }).toColourspace('b-w').png().toBuffer()
}

/** Claude 응답에서 첫 `{`부터 마지막 `}`까지를 JSON으로 읽는다 */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new EditPlanError('계획이 JSON이 아닙니다.')
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new EditPlanError('계획 JSON을 읽지 못했습니다.')
  }
}

export function validateEditPlan(raw: unknown): EditPlan {
  if (!raw || typeof raw !== 'object') throw new EditPlanError('계획이 객체가 아닙니다.')
  const r = raw as Record<string, unknown>
  const operation = r.operation as EditOperation
  if (!OPERATIONS.includes(operation)) throw new EditPlanError('operation이 올바르지 않습니다.')

  let boxes: EditBox[] = []
  if (operation === 'erase' || operation === 'inpaint') {
    if (!Array.isArray(r.boxes) || r.boxes.length < 1 || r.boxes.length > 4) {
      throw new EditPlanError('boxes는 1~4개여야 합니다.')
    }
    boxes = r.boxes.map((b) => {
      if (
        !Array.isArray(b) ||
        b.length !== 4 ||
        b.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1)
      ) {
        throw new EditPlanError('상자 값은 0~1 사이 숫자 4개여야 합니다.')
      }
      const [x0, y0, x1, y1] = b as number[]
      if (!(x0 < x1 && y0 < y1)) throw new EditPlanError('상자는 x0<x1, y0<y1이어야 합니다.')
      return [x0, y0, x1, y1] as EditBox
    })
  }

  let prompt = ''
  if (operation !== 'erase') {
    prompt = typeof r.prompt === 'string' ? r.prompt.trim() : ''
    if (!prompt) throw new EditPlanError('prompt가 비어 있습니다.')
    if (prompt.length > RECRAFT_PROMPT_MAX) throw new EditPlanError('prompt가 너무 깁니다.')
  }

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)
  let zoom_out = 0
  if (operation === 'outpaint') {
    const z = num(r.zoom_out)
    if (Number.isNaN(z)) throw new EditPlanError('zoom_out이 필요합니다.')
    zoom_out = clamp(z, 10, 60)
  }
  let strength = 0
  if (operation === 'restyle') {
    const s = num(r.strength)
    if (Number.isNaN(s)) throw new EditPlanError('strength가 필요합니다.')
    strength = clamp(s, 0.1, 0.6)
  }

  const reason_ko = typeof r.reason_ko === 'string' ? r.reason_ko.trim() : ''
  return { operation, boxes, prompt, zoom_out, strength, reason_ko }
}
