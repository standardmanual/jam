/**
 * 어드민 목록 페이지의 Supabase 조회 오류 처리(티켓 20260925_1941).
 *
 * 조회 결과에서 `error`를 확인하지 않으면 DB 오류가 「데이터 없음」으로 보여 고장을 늦게 알게 된다.
 * - 필수(주) 조회: `throwOnQueryError` — 던져서 `admin/error.tsx`(다시 시도 버튼)가 받게 한다.
 * - 부가 조회(선택지용 집계·이름 목록 등): `logQueryError` — 로그만 남기고 기존 동작을 유지한다.
 */

export interface QueryErrorLike {
  message: string
}

/** 오류를 서버 로그에 남긴다. 던지지 않는다. */
export function logQueryError(error: QueryErrorLike | null | undefined, label: string): void {
  if (!error) return
  console.error(`[admin/${label}] 조회 오류:`, error)
}

/** 오류가 있으면 로그를 남기고 던진다. 오류가 없으면 아무 일도 하지 않는다. */
export function throwOnQueryError(error: QueryErrorLike | null | undefined, label: string): void {
  if (!error) return
  console.error(`[admin/${label}] 조회 오류:`, error)
  throw new Error(`[admin/${label}] 조회 실패: ${error.message}`)
}
