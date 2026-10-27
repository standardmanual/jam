/**
 * 소속 트라이브 노출 태그 — `tribe_<트라이브 ID>` (티켓 20261026_2030 2회차).
 *
 * 트라이브 행은 JAM 2.0 오픈 때 새로 생기고 바뀐다(운영자가 트라이브 화면에서 등록 후 켠다). 코드에 트라이브 목록이나
 * 슬러그 대응표를 두면 그때마다 어긋나므로 태그 값을 트라이브 ID(UUID)에서 바로 만든다. 값은 운영 화면이 고르는 것이라
 * 읽기 어려워도 비용이 작고, 화면에는 트라이브 이름이 보인다.
 *
 * 순수 모듈이다. 서버·클라이언트·검증기(`opsInbox/validate.ts`, `registerChecks/homeFeedFields.ts`)가 같은 정규식을 쓴다.
 */

export const TRIBE_TAG_PREFIX = 'tribe_'

const UUID_BODY = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const UUID_PATTERN = new RegExp(`^${UUID_BODY}$`, 'i')
/** 태그 전체 일치 — 접두어 + 소문자 UUID. 대문자가 섞인 값은 정규화 전 값이라 태그로 받지 않는다. */
const TRIBE_TAG_PATTERN = new RegExp(`^${TRIBE_TAG_PREFIX}${UUID_BODY}$`)

/** 트라이브 ID → 태그. null·UUID 형식이 아닌 값이면 null. 대문자 UUID는 소문자로 정규화한다. */
export function tribeTagOf(tribeId: string | null | undefined): string | null {
  if (typeof tribeId !== 'string' || !UUID_PATTERN.test(tribeId)) return null
  return `${TRIBE_TAG_PREFIX}${tribeId.toLowerCase()}`
}

/** `tribe_<소문자 UUID>` 형식이면 true. 허용 목록 검사의 대안으로 쓴다. */
export function isTribeTag(value: unknown): value is string {
  return typeof value === 'string' && TRIBE_TAG_PATTERN.test(value)
}

/** 태그 → 트라이브 ID. 트라이브 태그가 아니면 null. */
export function tribeIdOfTag(tag: unknown): string | null {
  return isTribeTag(tag) ? tag.slice(TRIBE_TAG_PREFIX.length) : null
}
