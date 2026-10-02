/**
 * 예약 등록 사전 점검 테스트 공용 재료 (티켓 20261002_1122).
 */
import type { Json } from '@/types/database.generated'
import { RESOURCE_KEY_BY_KIND, type ExecutableKind, type ExecuteHandler, type ExecuteHandlerRegistry, type ExecuteItem } from '../handlers'

/** 10/5(일) 12:00 KST. */
export const NOW = new Date('2026-10-05T03:00:00.000Z')

/** 지금보다 충분히 뒤인 공개 시각(10/10 09:00 KST). */
export const LATER = '2026-10-10T00:00:00.000Z'

export interface ItemSpec {
  /** 행 ID. 생략하면 `key`, 그것도 없으면 `item-N`. */
  id?: string
  /** `item_key`. 생략하면 `id`와 같다. 키 없는 항목은 `null`. */
  key?: string | null
  kind?: string | null
  status?: string
  position?: number
  /** `links`(제출 원본). */
  links?: unknown
  /** `resource`(제출 원본). */
  resource?: unknown
  /** 행의 `starts_at`. 생략하면 `LATER`. */
  startsAt?: string | null
  /** 행의 `ends_at`. 생략하면 `null`. */
  endsAt?: string | null
  /** 행의 `updated_at`. 생략하면 10/4 09:00 KST(`NOW`보다 한참 앞). */
  updatedAt?: string
  /** 제출 원본에 더할 값(`starts_at` 같은 공통 칸). */
  original?: Record<string, unknown>
  /** 직접 수정본. */
  edited?: Json | null
  createdResource?: Json | null
  formatErrors?: Json
}

let counter = 0

export function makeItem(spec: ItemSpec = {}): ExecuteItem {
  counter += 1
  const id = spec.id ?? spec.key ?? `item-${counter}`
  const key = spec.key === undefined ? id : spec.key
  const kind = spec.kind === undefined ? 'mission' : spec.kind
  const original: Record<string, unknown> = { item_key: key, kind, ...spec.original }
  if (spec.links !== undefined) original.links = spec.links
  if (spec.resource !== undefined) original.resource = spec.resource
  return {
    id,
    bundle_id: 'bundle-1',
    position: spec.position ?? counter,
    item_key: key,
    kind,
    status: spec.status ?? 'approved',
    starts_at: spec.startsAt === undefined ? LATER : spec.startsAt,
    ends_at: spec.endsAt === undefined ? null : spec.endsAt,
    pattern_no: null,
    original: original as Json,
    edited: spec.edited ?? null,
    created_resource: spec.createdResource ?? null,
    format_errors: spec.formatErrors ?? [],
    updated_at: spec.updatedAt ?? '2026-10-04T00:00:00.000Z',
  }
}

/** 종류 하나의 가짜 핸들러. 아무것도 만들지 않고, 취소는 늘 성공하며, 자원은 있지만 아직 공개 전으로 읽힌다(`observe`, 티켓 20261002_1813). */
export function fakeHandler(kind: ExecutableKind): ExecuteHandler {
  return {
    kind,
    resourceKey: RESOURCE_KEY_BY_KIND[kind],
    idFirst: kind !== 'recipe' && kind !== 'drop_schedule',
    prepare: (item, { id, linkedIds }) => ({ ok: true, value: { item, id, payload: {}, linkFields: [], linkedIds, warnings: [] } }),
    check: async () => null,
    create: async () => ({ ok: true, value: { id: 'created' } }),
    undo: async () => null,
    cancel: async () => ({ ok: true, missing: false }),
    observe: async () => ({ status: 'present', published: false, ended: false, startsAt: null, endsAt: null, inactive: false }),
  }
}

/** 고른 종류의 가짜 핸들러만 담은 레지스트리. */
export function fakeRegistry(kinds: readonly ExecutableKind[]): ExecuteHandlerRegistry {
  return Object.fromEntries(kinds.map((kind) => [kind, fakeHandler(kind)]))
}

/** 여섯 종류 모두 연결된 레지스트리. */
export const ALL_KINDS: readonly ExecutableKind[] = ['home_feed_card', 'mission', 'jam_badge', 'collection_launch', 'recipe', 'drop_schedule']
export const FULL_REGISTRY = fakeRegistry(ALL_KINDS)
