/**
 * 기획안 항목의 이미지 지시 칸 `image_spec` 규칙 (티켓 20261007_1030, 상위 20261007_0946). 규칙의 정본은 `docs/service/prd/ops-tool/PRD.md` §3.1이다.
 *
 * 서버·클라이언트 공용 순수 모듈이다(`server-only`를 두지 않는다). 저장소·DB는 만지지 않는다.
 * `image_spec`은 선택 칸이다. 비어 있거나 모양이 틀려도 제출은 받고 경고만 낸다(오류로 만들지 않는다).
 */
import { asRecord, itemField, type ViewableItem } from './itemView'
import type { RenderPresetToPngArgs } from './imageRender.client'

/** 이미지 칸이 있는 종류 네 개와 항목 `resource`의 이미지 칸 이름. 카드는 `cover_image_url`, 미션·배지·컬렉션은 `image_url`이다. */
export const IMAGE_KEY_BY_KIND = {
  home_feed_card: 'cover_image_url',
  mission: 'image_url',
  jam_badge: 'image_url',
  collection_launch: 'image_url',
} as const

export type ImageKind = keyof typeof IMAGE_KEY_BY_KIND
export type OpsImageKey = (typeof IMAGE_KEY_BY_KIND)[ImageKind]

export function isImageKind(kind: string | null | undefined): kind is ImageKind {
  return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(IMAGE_KEY_BY_KIND, kind)
}

/** 항목 `resource`의 이미지 칸 이름. 이미지가 없는 종류는 null이다. */
export function imageKeyOfKind(kind: string | null | undefined): OpsImageKey | null {
  return isImageKind(kind) ? IMAGE_KEY_BY_KIND[kind] : null
}

export interface ImageSpec {
  preset_id?: string
  bg?: string
  end?: string
  values?: Record<string, string>
}

/** 항목에서 `image_spec`을 읽는다(수정본 우선). 객체가 아니면 null이다. 모양은 믿지 않으니 값은 `imageSpecWarnings`로 따로 확인한다. */
export function readImageSpec(item: ViewableItem): ImageSpec | null {
  return asRecord(itemField(item, 'image_spec')) as ImageSpec | null
}

/** 제작 인자로 바꾼다. `preset_id`가 없거나 문자열이 아니면 null(제작을 건너뛴다). `bg`·`end`가 없으면 빈 문자열로 둔다. */
export function imageSpecToRenderArgs(spec: ImageSpec | null, seed: number): RenderPresetToPngArgs | null {
  if (!spec || typeof spec.preset_id !== 'string' || spec.preset_id.trim() === '') return null
  const values = asRecord(spec.values)
  const strings: Record<string, string> = {}
  if (values) {
    for (const [k, v] of Object.entries(values)) if (typeof v === 'string') strings[k] = v
  }
  return {
    presetId: spec.preset_id.trim(),
    bg: typeof spec.bg === 'string' ? spec.bg : '',
    end: typeof spec.end === 'string' ? spec.end : '',
    values: strings,
    seed,
  }
}

/**
 * 항목 ID에서 만든 고정 시드(FNV-1a 32비트, 양의 정수). 같은 ID는 늘 같은 값이다.
 * 승인 전 미리보기와 첫 이미지 제작이 같은 시드를 써서 무늬가 같다(티켓 20261101_2149). 「다시 만들기」만 새 무작위 시드를 쓴다.
 */
export function stableImageSeed(itemId: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < itemId.length; i += 1) {
    hash ^= itemId.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash & 0x7fffffff
}

/** 색 지시가 없는 카드를 승인 전 미리보기에서만 그릴 때 쓰는 중립색. 실제 제작에는 쓰지 않는다. */
export const PREVIEW_NEUTRAL_BG = '#3f3f46'
export const PREVIEW_NEUTRAL_END = '#71717a'

export interface PreviewRenderArgs {
  args: RenderPresetToPngArgs
  /** `bg`·`end` 가운데 하나라도 비어 임시 색을 채웠는가 */
  tempColor: boolean
}

/**
 * 승인 전 미리보기용 제작 인자. 시드는 항목 ID의 고정 시드다. `preset_id`가 없으면 null이다.
 * 색이 비면 임시 중립색을 채운다(한쪽만 비면 있는 쪽을 따른다). 실제 제작 규칙(`imageSpecToRenderArgs`)은 바꾸지 않는다.
 */
export function previewRenderArgs(spec: ImageSpec | null, itemId: string): PreviewRenderArgs | null {
  const base = imageSpecToRenderArgs(spec, stableImageSeed(itemId))
  if (!base) return null
  const bg = base.bg.trim()
  const end = base.end.trim()
  if (bg !== '' && end !== '') return { args: base, tempColor: false }
  return {
    args: { ...base, bg: bg || end || PREVIEW_NEUTRAL_BG, end: end || bg || PREVIEW_NEUTRAL_END },
    tempColor: true,
  }
}

/**
 * `image_spec` 원값의 경고 문장. 값이 없거나 비어 있으면 「비어 있어요」 한 줄, 있으면 모양이 틀린 칸마다 한 줄이다.
 * 오류가 아니라 경고다 — 호출부가 `errors`에 넣지 않는다.
 */
export function imageSpecWarnings(spec: unknown, path: string): string[] {
  const label = `${path}.image_spec`
  if (spec === undefined || spec === null) return [`${label}: 비어 있어요. 이미지 지시가 없으면 이미지를 자동으로 만들지 않아요.`]
  const record = asRecord(spec)
  if (!record) return [`${label}: 객체여야 해요. 이 칸은 이미지 제작에 쓰이지 않아요.`]
  if (Object.keys(record).length === 0) return [`${label}: 비어 있어요. 이미지 지시가 없으면 이미지를 자동으로 만들지 않아요.`]

  const warnings: string[] = []
  for (const key of ['preset_id', 'bg', 'end'] as const) {
    const value = record[key]
    if (value !== undefined && value !== null && (typeof value !== 'string' || value.trim() === '')) {
      warnings.push(`${label}.${key}: 비어 있지 않은 문자열이어야 해요.`)
    }
  }
  if (record.values !== undefined && record.values !== null) {
    const values = asRecord(record.values)
    if (!values) {
      warnings.push(`${label}.values: 문자열 값을 가진 객체여야 해요.`)
    } else {
      for (const [k, v] of Object.entries(values)) {
        if (typeof v !== 'string') warnings.push(`${label}.values.${k}: 문자열이어야 해요.`)
      }
    }
  }
  if (record.preset_id === undefined || record.preset_id === null) {
    warnings.push(`${label}.preset_id: 없어요. 프리셋을 정하지 않으면 이미지를 자동으로 만들지 않아요.`)
  } else if (typeof record.preset_id === 'string' && record.preset_id.trim() !== '') {
    // 프리셋은 있는데 색이 없으면 렌더가 실패한다(티켓 20261007_1032). 호출부가 기본 색을 정하지 않고 제출 때 알린다.
    const missing = (['bg', 'end'] as const).filter((key) => record[key] === undefined || record[key] === null)
    if (missing.length > 0) {
      warnings.push(`${label}.${missing.join('·')}: 없어요. 색이 없으면 이미지가 만들어지지 않아요. 시작 색(bg)과 끝 색(end)을 함께 적어 주세요.`)
    }
  }
  return warnings
}
