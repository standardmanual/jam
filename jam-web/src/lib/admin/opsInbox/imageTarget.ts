/**
 * 항목의 이미지 지시(`image_spec`)와 이미지 칸 규칙 (티켓 20261007_0947 ③-b1, 운영툴 PRD §3.1·§8.8). **순수 파일**이라 클라이언트도 쓴다
 * (서버 전용 `image.ts`는 `@supabase` 계열을 가져와 클라이언트가 쓸 수 없다).
 *
 * - `readImageSpec`: `edited ?? original`의 `image_spec` 세 칸(프리셋·색·값)을 읽는다. 틀린 칸은 거절이 아니라 `invalid` 사유로 돌려준다.
 * - `seedFromBundleId`: 서버 스크립트(`scripts/asset-generator/makeHomeFeedCardArgs.mjs`)와 같은 값이다(대조 테스트가 지킨다).
 */
import { asRecord, itemField, type ViewableItem } from './itemView'

const IMAGE_KEY_BY_KIND = {
  home_feed_card: 'cover_image_url',
  mission: 'image_url',
  jam_badge: 'image_url',
  collection_launch: 'image_url',
} as const

export type OpsImageKey = (typeof IMAGE_KEY_BY_KIND)[keyof typeof IMAGE_KEY_BY_KIND]

/** 항목 `resource`의 이미지 칸 이름. 카드는 `cover_image_url`, 미션·배지·컬렉션은 `image_url`, 그 밖의 종류는 이미지가 없어 null이다. */
export function imageKeyOfKind(kind: string | null | undefined): OpsImageKey | null {
  return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(IMAGE_KEY_BY_KIND, kind)
    ? IMAGE_KEY_BY_KIND[kind as keyof typeof IMAGE_KEY_BY_KIND]
    : null
}

/** 묶음 ID에서 정한 시드(FNV-1a 32비트, 0 이상 정수). `makeHomeFeedCardArgs.mjs`의 `seedFromBundleId`와 같은 값이다. */
export function seedFromBundleId(bundleId: string): number {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(bundleId)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

export interface ImageSpec {
  presetId: string
  bg: string
  end: string
  values: Record<string, string>
}

export type ImageSpecReadResult = { ok: true; spec: ImageSpec } | { ok: false; reason: 'no_image_kind' | 'missing' | 'invalid' }

const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/
const VALUE_KEY_PATTERN = /^(text|img)\d{2}$/

/**
 * 항목에서 이미지 지시를 읽는다. 이미지 칸이 없는 종류는 `no_image_kind`, `image_spec`이 없거나 `preset_id`가 비면 `missing`,
 * 색이 `#RRGGBB`가 아니거나 `values`의 키·값 형식이 틀리면 `invalid`다. 던지지 않는다.
 */
export function readImageSpec(item: ViewableItem & { kind: string | null }): ImageSpecReadResult {
  if (imageKeyOfKind(item.kind) === null) return { ok: false, reason: 'no_image_kind' }
  const raw = itemField(item, 'image_spec')
  if (raw === undefined || raw === null) return { ok: false, reason: 'missing' }
  const spec = asRecord(raw)
  if (!spec) return { ok: false, reason: 'invalid' }

  const presetId = typeof spec.preset_id === 'string' ? spec.preset_id.trim() : ''
  if (presetId === '') return { ok: false, reason: 'missing' }

  const { bg, end } = spec
  if (typeof bg !== 'string' || typeof end !== 'string' || !COLOR_PATTERN.test(bg) || !COLOR_PATTERN.test(end)) {
    return { ok: false, reason: 'invalid' }
  }

  const values: Record<string, string> = {}
  if (spec.values !== undefined && spec.values !== null) {
    const rawValues = asRecord(spec.values)
    if (!rawValues) return { ok: false, reason: 'invalid' }
    for (const [key, value] of Object.entries(rawValues)) {
      if (!VALUE_KEY_PATTERN.test(key) || typeof value !== 'string') return { ok: false, reason: 'invalid' }
      values[key] = value
    }
  }
  return { ok: true, spec: { presetId, bg, end, values } }
}
