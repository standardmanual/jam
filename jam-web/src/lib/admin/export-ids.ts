/**
 * 어드민 export 라우트 공용 — 요청 본문의 `ids`를 읽어 중복을 없애고 형식·개수를 검사한다
 * (티켓 20260926_1412). 일괄 처리 라우트의 `parseBulkBody`(`./bulk/shared.ts`)와 같은
 * 기준(UUID 형식, 1,000건 상한)을 export 라우트에도 적용한다. 형식이 틀린 값이 `.in('id', …)`까지
 * 가면 DB 오류 원문이 응답에 실릴 수 있어 DB 조회 전에 걸러낸다.
 */
import { isUuid } from './uuid'

export const MAX_EXPORT_IDS = 1000

export type ParseExportIdsResult =
  | { ok: true; ids: string[] }
  | { ok: false; status: 400; error: string }

/**
 * `body.ids`에서 문자열만 골라(그 외 값은 무시) 중복을 제거한다. 0건이면 `emptyMessage`,
 * UUID가 아닌 값이 하나라도 있거나 {@link MAX_EXPORT_IDS}건을 넘으면 안내 문구와 함께 400을 돌려준다.
 */
export function parseExportIds(body: unknown, emptyMessage: string): ParseExportIdsResult {
  const rawIds = (body as { ids?: unknown } | null)?.ids
  const strings = Array.isArray(rawIds) ? rawIds.filter((id): id is string => typeof id === 'string') : []
  const ids = [...new Set(strings)]

  if (ids.length === 0) return { ok: false, status: 400, error: emptyMessage }
  if (!ids.every(isUuid)) {
    return {
      ok: false,
      status: 400,
      error: '선택한 항목의 식별자 형식이 올바르지 않습니다. 목록을 새로 고친 뒤 다시 시도해 주세요.',
    }
  }
  if (ids.length > MAX_EXPORT_IDS) {
    return {
      ok: false,
      status: 400,
      error: `한 번에 최대 ${MAX_EXPORT_IDS.toLocaleString('ko-KR')}건까지 내보낼 수 있습니다. 선택을 줄여 다시 시도해 주세요.`,
    }
  }
  return { ok: true, ids }
}
