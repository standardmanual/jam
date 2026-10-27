/**
 * 어드민 투데이 — 소속 트라이브 노출 태그(`tribe_<트라이브 ID>`)를 화면에 보이는 순수 함수 (티켓 20261026_2030 2회차).
 *
 * 태그 값은 트라이브 ID(UUID)라 읽기 어렵다. 폼의 선택지·카드 표·상세는 서버가 읽어 준 트라이브 목록으로 이름을 보인다.
 * 목록에 없는 트라이브(삭제됐거나 모르는 값)는 값을 버리지 않고 「(삭제됐거나 모르는 트라이브)」로 보인다.
 */
import { tribeIdOfTag, tribeTagOf } from '@/lib/today/exposureTribe'

/** 서버가 `tribes` 표에서 읽어 넘기는 행(폼·표·상세 공통) */
export interface TribeTagSource {
  id: string
  name: string
  is_active: boolean
}

export const UNKNOWN_TRIBE_LABEL = '(삭제됐거나 모르는 트라이브)'
export const INACTIVE_TRIBE_SUFFIX = '(비활성)'

/** 목록에서 ID(대소문자 무관)로 트라이브를 찾는다. */
function findTribe(tribes: readonly TribeTagSource[], tribeId: string): TribeTagSource | undefined {
  const lower = tribeId.toLowerCase()
  return tribes.find((t) => t.id.toLowerCase() === lower)
}

/** 트라이브 하나의 표시 이름. 비활성이면 「(비활성)」을 붙인다. */
export function tribeDisplayName(tribe: TribeTagSource): string {
  return tribe.is_active ? tribe.name : `${tribe.name} ${INACTIVE_TRIBE_SUFFIX}`
}

/** 트라이브 태그면 표시 이름(목록에 없으면 「(삭제됐거나 모르는 트라이브)」), 트라이브 태그가 아니면 null. */
export function tribeTagLabel(tag: string, tribes: readonly TribeTagSource[]): string | null {
  const tribeId = tribeIdOfTag(tag)
  if (!tribeId) return null
  const tribe = findTribe(tribes, tribeId)
  return tribe ? tribeDisplayName(tribe) : UNKNOWN_TRIBE_LABEL
}

/** 폼의 「트라이브」 묶음 선택지 — 목록 순서대로 `{ value: tribe_<id>, label: 이름 }`. */
export function tribeTagOptions(tribes: readonly TribeTagSource[]): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  for (const tribe of tribes) {
    const value = tribeTagOf(tribe.id)
    if (value) options.push({ value, label: tribeDisplayName(tribe) })
  }
  return options
}

/**
 * 카드가 이미 갖고 있는데 트라이브 목록에 없는 트라이브 태그 — 폼에서 선택 상태 그대로 보여 저장할 때 조용히 사라지지 않게 한다.
 * 선택지 값과 같은 정규화(소문자)를 쓴다.
 */
export function orphanTribeTags(selected: readonly string[], tribes: readonly TribeTagSource[]): { value: string; label: string }[] {
  const known = new Set(tribeTagOptions(tribes).map((o) => o.value))
  return selected.filter((tag) => tribeIdOfTag(tag) && !known.has(tag)).map((value) => ({ value, label: UNKNOWN_TRIBE_LABEL }))
}

/** 카드 표·상세용 — 트라이브 태그는 「트라이브: 이름」, 그 밖의 태그는 `fallbackLabel`(없으면 값 그대로). */
export function exposureTagDisplay(
  tag: string,
  tribes: readonly TribeTagSource[],
  fallbackLabel: (value: string) => string = (value) => value
): string {
  const tribeLabel = tribeTagLabel(tag, tribes)
  return tribeLabel === null ? fallbackLabel(tag) : `트라이브: ${tribeLabel}`
}
