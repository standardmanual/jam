/**
 * 컬렉션 표지 생성기의 순수 상태·저장 로직 (티켓 20261124_1744, 상위 20261124_1741).
 * 화면(`CollectionCoverGenerator.tsx`)은 이 함수들로 상태를 만들고, 적용 때 두 요청을 보낸다.
 */
import { defaultTextColors, hexToRgb, type CollectionCoverResult, type TextColors } from '@/lib/collection-cover'

export interface CoverParams {
  version: 1
  seed: string
  rerolls: number
  badgeId: string
  bgHex: string
  bgSource: 'auto' | 'manual'
  textColors: TextColors
  appliedAt?: string
}

export interface CoverBadge {
  id: string
  name: string
  image_url: string | null
  deleted_at?: string | null
  sort_order?: number | null
}

/** 화면이 들고 있는 편집 상태. 글자색은 키가 없으면 «자동»이다. */
export interface CoverState {
  rerolls: number
  badgeId: string | null
  /** 직접 지정한 배경색(#rrggbb). null이면 자동 생성 */
  bgManual: string | null
  /** 저장된 자동 배경색(#rrggbb). 다시 열 때 시드로 다시 계산하지 않고 이 색으로 그린다. null이면 새로 계산 */
  bgSaved: string | null
  textOverrides: Partial<TextColors>
}

const HEX = /^#[0-9a-f]{6}$/

/** `#rrggbb`로 맞춘다. `#`이 없어도 받고, 형식이 틀리면 null */
export function normalizeHex(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  const withHash = v.startsWith('#') ? v : `#${v}`
  return HEX.test(withHash) ? withHash : null
}

/** 저장된 cover_params가 생성기 모양이 아니면 null */
export function parseCoverParams(raw: unknown): CoverParams | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const tc = o.textColors as Record<string, unknown> | null | undefined
  if (o.version !== 1) return null
  if (typeof o.rerolls !== 'number' || !Number.isInteger(o.rerolls) || o.rerolls < 0) return null
  if (typeof o.bgHex !== 'string' || !HEX.test(o.bgHex)) return null
  if (o.bgSource !== 'auto' && o.bgSource !== 'manual') return null
  if (!tc || typeof tc !== 'object') return null
  for (const k of ['title', 'tribe', 'join']) {
    if (typeof tc[k] !== 'string' || !HEX.test(tc[k] as string)) return null
  }
  if (typeof o.badgeId !== 'string' || !o.badgeId) return null
  return {
    version: 1,
    seed: typeof o.seed === 'string' ? o.seed : '',
    rerolls: o.rerolls,
    badgeId: o.badgeId,
    bgHex: o.bgHex,
    bgSource: o.bgSource,
    textColors: { title: tc.title as string, tribe: tc.tribe as string, join: tc.join as string },
    appliedAt: typeof o.appliedAt === 'string' ? o.appliedAt : undefined,
  }
}

/** 이미지가 있고 삭제되지 않은 배지 중 sort_order → 이름 → id 순 첫 배지. 없으면 null */
export function pickDefaultBadge<T extends CoverBadge>(badges: readonly T[]): T | null {
  const usable = badges.filter((b) => !b.deleted_at && !!b.image_url)
  if (usable.length === 0) return null
  return [...usable].sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id)
  )[0]
}

export function initialCoverState(params: CoverParams | null, badges: readonly CoverBadge[]): CoverState {
  const fallback = pickDefaultBadge(badges)
  if (!params) {
    return { rerolls: 0, badgeId: fallback?.id ?? null, bgManual: null, bgSaved: null, textOverrides: {} }
  }
  const saved = badges.find((b) => b.id === params.badgeId && !b.deleted_at && !!b.image_url)
  const defaults = defaultTextColors(hexToRgb(params.bgHex))
  const textOverrides: Partial<TextColors> = {}
  for (const k of ['title', 'tribe', 'join'] as const) {
    if (params.textColors[k] !== defaults[k]) textOverrides[k] = params.textColors[k]
  }
  return {
    rerolls: params.rerolls,
    badgeId: (saved ?? fallback)?.id ?? null,
    bgManual: params.bgSource === 'manual' ? params.bgHex : null,
    bgSaved: params.bgSource === 'manual' ? null : params.bgHex,
    textOverrides,
  }
}

export function buildCoverParams(
  state: CoverState,
  seed: string,
  result: Pick<CollectionCoverResult, 'bgHex' | 'bgSource' | 'textColors'>,
  appliedAt: string,
  savedSource: 'auto' | 'manual' = 'auto'
): CoverParams {
  // 저장된 색(bgSaved)으로 그렸으면 원래 저장된 출처를 유지한다
  const bgSource =
    state.bgManual == null && state.bgSaved != null
      ? savedSource
      : result.bgSource === 'override'
        ? 'manual'
        : 'auto'
  return {
    version: 1,
    seed,
    rerolls: state.rerolls,
    badgeId: state.badgeId ?? '',
    bgHex: result.bgHex,
    bgSource,
    textColors: result.textColors,
    appliedAt,
  }
}

export type CoverApplyResult =
  | { ok: true; imageUrl: string | null }
  | { ok: false; stage: 'upload' | 'save'; message: string }

const fail = (what: string, cause: string, fix: string) => `[현상] ${what}\n[원인] ${cause}\n[해결책] ${fix}`

/**
 * 적용: 이미지 업로드·교체 → 성공하면 영문 이름·설정 저장. 두 요청의 본문 규칙은 시험이 고정한다.
 * 이미지만 바뀌고 설정 저장이 실패하면 stage 'save'로 따로 알린다.
 */
export async function applyCollectionCover(args: {
  fetchFn: typeof fetch
  collectionId: string
  nameEn: string
  png: Blob
  params: CoverParams
}): Promise<CoverApplyResult> {
  const { fetchFn, collectionId, nameEn, png, params } = args
  const form = new FormData()
  form.append('targetType', 'collection')
  form.append('targetId', collectionId)
  form.append('image', png, 'cover.png')

  let imageUrl: string | null = null
  try {
    const res = await fetchFn('/api/admin/asset-generator/apply', { method: 'POST', body: form })
    const data = (await res.json().catch(() => ({}))) as { error?: string; mediaUrl?: string; webpUrl?: string }
    if (!res.ok) {
      return {
        ok: false,
        stage: 'upload',
        message: fail(
          '표지 이미지를 올리지 못했어요.',
          data.error ?? `서버가 ${res.status} 응답을 돌려줬어요.`,
          '잠시 뒤 다시 적용해 보세요. 같은 문제가 반복되면 개발자에게 전달해 주세요.'
        ),
      }
    }
    imageUrl = data.mediaUrl ?? data.webpUrl ?? null
  } catch {
    return {
      ok: false,
      stage: 'upload',
      message: fail('표지 이미지를 올리지 못했어요.', '네트워크 연결이 끊겼을 수 있어요.', '연결을 확인하고 다시 적용해 보세요.'),
    }
  }

  try {
    const res = await fetchFn(`/api/admin/itembooks/${collectionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name_en: nameEn, cover_params: params }),
    })
    if (!res.ok) throw new Error(String(res.status))
  } catch {
    return {
      ok: false,
      stage: 'save',
      message: fail(
        '표지 이미지는 바뀌었지만 영문 이름과 생성 설정은 저장하지 못했어요.',
        '설정 저장 요청이 실패했어요.',
        '화면을 새로고침하지 말고 다시 적용을 눌러 설정을 저장해 주세요.'
      ),
    }
  }
  return { ok: true, imageUrl }
}
