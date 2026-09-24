/**
 * 어드민 일괄 처리 서버·클라이언트 공용 계약(티켓 20260924_0940, 상위 티켓 §2). 요청 본문
 * 파싱·확인 문구 계산·결과 요약을 전부 순수 함수로 둬서 서버 API 라우트와 클라이언트
 * 컴포넌트(`BulkConfirmDialog`, `toastBulkResult`)가 같은 판정을 공유한다.
 *
 * 요청 본문 규격: `{ ids, action, payload?, dry_run?, confirm_phrase? }`
 * dry_run 응답 규격: `BulkResult & { dryRun: true; requiredPhrase?: string; impact?: Record<string, number> }`
 * 확인 문구 불일치: 409 `{ error, requiredPhrase }`
 */

/** 참조 보호 등으로 건너뛴 항목 하나 */
export interface BulkSkip {
  id: string
  reason: string
  label?: string
}

/** 일괄 처리 결과 — 서버 API 응답과 클라이언트 요약이 공유하는 형태 */
export interface BulkResult {
  processed: string[]
  skipped: BulkSkip[]
}

/** 한 번에 처리할 수 있는 상한(상위 티켓 §2). 동작별로 더 낮은 상한을 둘 수 있다 */
export const BULK_MAX_IDS = 1000

export interface BulkActionConfig {
  /** 이 동작 하나에 적용할 상한. 없으면 BULK_MAX_IDS를 쓴다 */
  maxIds?: number
}

export interface ParseBulkBodyConfig {
  /** 허용하는 동작 이름과 동작별 설정 — 여기 없는 action은 거부한다 */
  actions: Record<string, BulkActionConfig>
  /** ID 형식 검사 방식. 'uuid'가 아니면 형식 검사 없이 문자열만 확인한다 */
  idFormat: 'uuid' | 'string'
}

export interface ParsedBulkBody {
  ids: string[]
  action: string
  payload: unknown
  dryRun: boolean
  confirmPhrase: string | undefined
}

export type ParseBulkBodyResult =
  | { ok: true; body: ParsedBulkBody }
  | { ok: false; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 일괄 처리 요청 본문을 검사·정규화한다: 중복 ID 제거, 형식 검사, 1~`maxIds`건(기본
 * {@link BULK_MAX_IDS}), 허용된 동작만 통과시킨다. 실패하면 그대로 API 응답에 쓸 수 있는
 * 한국어 에러 메시지를 돌려준다.
 */
export function parseBulkBody(body: unknown, config: ParseBulkBodyConfig): ParseBulkBodyResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: '요청 형식이 올바르지 않습니다.' }
  }
  const b = body as Record<string, unknown>

  const action = b.action
  if (typeof action !== 'string' || !(action in config.actions)) {
    return { ok: false, error: '지원하지 않는 동작입니다.' }
  }

  const rawIds = b.ids
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return { ok: false, error: '대상 ID가 없습니다.' }
  }
  if (!rawIds.every((id): id is string => typeof id === 'string' && id.length > 0)) {
    return { ok: false, error: 'ID 형식이 올바르지 않습니다.' }
  }
  if (config.idFormat === 'uuid' && !rawIds.every((id) => UUID_RE.test(id))) {
    return { ok: false, error: 'ID 형식이 올바르지 않습니다.' }
  }

  const ids = Array.from(new Set(rawIds))
  const maxIds = config.actions[action].maxIds ?? BULK_MAX_IDS
  if (ids.length > maxIds) {
    return { ok: false, error: `한 번에 최대 ${maxIds}건까지 처리할 수 있습니다.` }
  }

  return {
    ok: true,
    body: {
      ids,
      action,
      payload: b.payload,
      dryRun: b.dry_run === true,
      confirmPhrase: typeof b.confirm_phrase === 'string' ? b.confirm_phrase : undefined,
    },
  }
}

/** 등급 3 확인 문구 — "무엇을·몇 건"만으로 계산해 화면이 임의로 값을 지어내지 못하게 한다 */
export function confirmPhraseFor(action: string, count: number): string {
  return `${action} ${count}`
}

/** 확인 문구 일치 여부 — 앞뒤 공백은 무시한다 */
export function isPhraseMatch(input: string, required: string): boolean {
  return input.trim() === required.trim()
}

/** "N건 {verb}, M건 건너뜀" 요약 문장(상위 티켓 §1-7d). 건너뜀이 없으면 뒷부분을 뺀다 */
export function formatBulkResult(result: BulkResult, { verb }: { verb: string }): string {
  const { processed, skipped } = result
  return skipped.length > 0
    ? `${processed.length}건 ${verb}, ${skipped.length}건 건너뜀`
    : `${processed.length}건 ${verb}`
}

export type SelectAllBannerState =
  | { type: 'hidden' }
  | { type: 'prompt'; selectableCount: number }
  | { type: 'all-selected'; count: number }
  | { type: 'capped'; count: number; totalCount: number }

/**
 * "이 조건의 N건 모두 선택" 배너가 어떤 상태를 보여야 하는지 판정한다(순수 함수).
 *
 * - `hidden`: 현재 페이지 행이 전부 선택된 게 아니면 아직 보여줄 필요가 없다.
 * - `prompt`: 페이지는 전부 선택됐지만 필터 결과 전체(상한 이내)는 아직 아니다 —
 *   "이 조건의 N건 모두 선택" 링크를 보여준다.
 * - `all-selected`: 필터 결과 전체가 선택됐고 그 수가 상한 이내다.
 * - `capped`: 필터 결과가 상한을 넘어 상한만큼만 선택된 상태다.
 */
export function selectAllBannerState(
  pageIds: string[],
  selectedIds: string[],
  totalCount: number,
  cap: number
): SelectAllBannerState {
  const selected = new Set(selectedIds)
  const pageFullySelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  if (!pageFullySelected) return { type: 'hidden' }

  const selectableCount = Math.min(totalCount, cap)
  if (selected.size < selectableCount) {
    return { type: 'prompt', selectableCount }
  }
  return totalCount > cap
    ? { type: 'capped', count: selectableCount, totalCount }
    : { type: 'all-selected', count: totalCount }
}
