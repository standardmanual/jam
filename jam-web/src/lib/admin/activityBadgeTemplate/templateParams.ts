/**
 * 템플릿 배지의 색·글자 조정값의 꼴, 정리, 자리 정보에 얹기 (티켓 20261116_0632).
 * 순수 모듈. 서버 전용 모듈을 들여오지 않는다.
 */
import { parseSvgColor } from './templateColors'
import type { TemplateArcSlot } from './templateDef'
import { TEMPLATE_SLOT_NAMES, type TemplateSlot, type TemplateSlotName } from './templateSvg'

export interface TemplateColorParams {
  hueShift: number
  saturation: number
  lightness: number
  overrides: Record<string, string>
}

/** 글자 칸의 null은 «템플릿을 따른다»는 뜻 */
export interface SlotTextParams {
  color: string | null
  fontFamily: string | null
  fontWeight: number | null
  sizeScalePct: number
}

export interface TemplateBadgeParams {
  kind: 'activity-template'
  v: 1
  color: TemplateColorParams
  text: Record<TemplateSlotName, SlotTextParams>
}

export const TEMPLATE_PARAM_RANGES = {
  hueShift: { min: -180, max: 180, step: 1 },
  saturation: { min: -100, max: 100, step: 1 },
  lightness: { min: -100, max: 100, step: 1 },
  sizeScalePct: { min: 50, max: 200, step: 1 },
} as const

const defaultSlotText = (): SlotTextParams => ({ color: null, fontFamily: null, fontWeight: null, sizeScalePct: 100 })

export const DEFAULT_TEMPLATE_BADGE_PARAMS: TemplateBadgeParams = {
  kind: 'activity-template',
  v: 1,
  color: { hueShift: 0, saturation: 0, lightness: 0, overrides: {} },
  text: { name: defaultSlotText(), value: defaultSlotText() },
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function clampInt(v: unknown, range: { min: number; max: number }, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.min(range.max, Math.max(range.min, Math.round(v)))
}

function parseSlotText(raw: unknown): SlotTextParams {
  const d = defaultSlotText()
  if (!isRecord(raw)) return d
  const family = typeof raw.fontFamily === 'string' ? raw.fontFamily.trim() : ''
  const w = raw.fontWeight
  const weight = typeof w === 'number' && Number.isInteger(w) && w >= 100 && w <= 900 && w % 100 === 0 ? w : null
  return {
    color: typeof raw.color === 'string' ? parseSvgColor(raw.color) : null,
    fontFamily: family === '' ? null : family,
    fontWeight: weight,
    sizeScalePct: clampInt(raw.sizeScalePct, TEMPLATE_PARAM_RANGES.sizeScalePct, d.sizeScalePct),
  }
}

/** kind·v가 맞는 객체만 받아 정리한 값을 돌려준다. 아니면 null(옛 생성기 값과 가리기 위해서다). */
export function parseTemplateBadgeParams(raw: unknown): TemplateBadgeParams | null {
  if (!isRecord(raw) || raw.kind !== 'activity-template' || raw.v !== 1) return null
  const c = isRecord(raw.color) ? raw.color : {}
  const overrides: Record<string, string> = {}
  if (isRecord(c.overrides)) {
    for (const [k, v] of Object.entries(c.overrides)) {
      const key = parseSvgColor(k)
      const val = typeof v === 'string' ? parseSvgColor(v) : null
      if (key && val) overrides[key] = val
    }
  }
  const t = isRecord(raw.text) ? raw.text : {}
  const text = {} as Record<TemplateSlotName, SlotTextParams>
  for (const name of TEMPLATE_SLOT_NAMES) text[name] = parseSlotText(t[name])
  return {
    kind: 'activity-template',
    v: 1,
    color: {
      hueShift: clampInt(c.hueShift, TEMPLATE_PARAM_RANGES.hueShift, 0),
      saturation: clampInt(c.saturation, TEMPLATE_PARAM_RANGES.saturation, 0),
      lightness: clampInt(c.lightness, TEMPLATE_PARAM_RANGES.lightness, 0),
      overrides,
    },
    text,
  }
}

/** 색 조정이 기본값(세 값이 0이고 덮어쓴 색이 없음)인가 */
export function isDefaultTemplateColorParams(color: TemplateColorParams): boolean {
  return color.hueShift === 0 && color.saturation === 0 && color.lightness === 0 && Object.keys(color.overrides).length === 0
}

export function isDefaultTemplateBadgeParams(p: TemplateBadgeParams): boolean {
  const d = DEFAULT_TEMPLATE_BADGE_PARAMS
  if (!isDefaultTemplateColorParams(p.color)) return false
  return TEMPLATE_SLOT_NAMES.every((n) => {
    const a = p.text[n]
    const b = d.text[n]
    return a.color === b.color && a.fontFamily === b.fontFamily && a.fontWeight === b.fontWeight && a.sizeScalePct === b.sizeScalePct
  })
}

/** 자리 정보에 글자 조정을 얹은 사본 */
export function styleSlot(slot: TemplateSlot, p: SlotTextParams): TemplateSlot {
  return {
    ...slot,
    fill: p.color ?? slot.fill,
    fontFamily: p.fontFamily ?? slot.fontFamily,
    fontWeight: p.fontWeight !== null ? String(p.fontWeight) : slot.fontWeight,
    fontSize: slot.fontSize !== null ? (slot.fontSize * p.sizeScalePct) / 100 : null,
  }
}

/** 원호 자리에 글자 조정을 얹은 사본 */
export function styleArcSlot(slot: TemplateArcSlot, p: SlotTextParams): TemplateArcSlot {
  return {
    ...slot,
    fill: p.color ?? slot.fill,
    fontFamily: p.fontFamily ?? slot.fontFamily,
    fontWeight: p.fontWeight !== null ? String(p.fontWeight) : slot.fontWeight,
    fontSize: (slot.fontSize * p.sizeScalePct) / 100,
  }
}
