/**
 * 등록 전 DB 검사 공용 부품(티켓 20261002_0827, 상위 20260930_1500 ②-1).
 *
 * 에셋 제너레이터 등록 스크립트(배지·미션·홈피드 카드)가 `scripts/asset-generator/register*Flow.mjs`에 두고 있던
 * «DB를 읽어야 아는 등록 전 검사»와 «--undo 전 참조 확인»을 서버(운영툴 예약 등록)도 같은 함수로 쓰게 옮긴 모듈이다.
 * 이 폴더의 파일은 `node:` 모듈과 `scripts/` 아래 파일을 가져오지 않는다(서버 번들에 들어갈 수 있어야 한다 —
 * `__tests__/registerChecks.test.ts`가 원문으로 확인한다). 검사 문장·라벨·질의 순서는 스크립트에서 옮기기 전과 같다.
 *
 * 클라이언트는 실제 supabase 클라이언트와 테스트 스텁이 모두 구조적으로 들어맞는 최소 인터페이스로 받는다
 * (선례: `list-counts.ts`·`ranking-mode-references.ts`).
 */

export interface RegisterQueryError {
  message: string
}

/** 쿼리 한 건의 결과. 스텁은 `error`·`count`를 생략할 수 있다. */
export interface RegisterQueryResult<T> {
  data?: T | null
  error?: RegisterQueryError | null
  count?: number | null
}

export type RegisterRow = Record<string, unknown>

/** 이 모듈이 쓰는 쿼리 빌더 부분. await하면 행 목록이, `maybeSingle()`을 부르면 행 하나가 나온다. */
export interface RegisterQuery extends PromiseLike<RegisterQueryResult<RegisterRow[]>> {
  eq(column: string, value: unknown): RegisterQuery
  is(column: string, value: null): RegisterQuery
  in(column: string, values: string[]): RegisterQuery
  contains(column: string, value: unknown[]): RegisterQuery
  limit(count: number): RegisterQuery
  maybeSingle(): PromiseLike<RegisterQueryResult<RegisterRow>>
}

export interface RegisterTable {
  select(columns: string, options?: { count?: 'exact'; head?: boolean }): RegisterQuery
}

export interface RegisterChecksClient {
  from(table: string): RegisterTable
}

export type RegisterCheckStatus = '통과' | '실패' | '건너뜀' | '해당 없음'

export interface RegisterCheck {
  label: string
  status: RegisterCheckStatus
  detail: string
}

/** DB 검사 결과: 검사별 기록과, 실패한 검사의 «라벨: 사유» 목록. */
export interface RegisterDbCheckResult {
  checks: RegisterCheck[]
  errors: string[]
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * 검사를 하나씩 기록하는 수집기. 세 등록 흐름이 같은 내용으로 따로 갖고 있던 `add`를 하나로 합쳤다.
 * `supabase`가 null이면 적용 대상 검사는 «건너뜀»으로 표시한다(서버는 늘 클라이언트를 넘기므로 이 문장은 스크립트용이다).
 * `run`은 실패 사유를 문자열로, 통과면 null을 돌려준다. 던지면 «DB 조회에 실패했어요»로 기록한다.
 */
export function createCheckCollector(supabase: RegisterChecksClient | null | undefined) {
  const checks: RegisterCheck[] = []
  const errors: string[] = []

  const add = async (
    label: string,
    applicable: boolean,
    run: (client: RegisterChecksClient) => Promise<string | null>
  ): Promise<void> => {
    if (!applicable) {
      checks.push({ label, status: '해당 없음', detail: '' })
      return
    }
    if (!supabase) {
      checks.push({ label, status: '건너뜀', detail: '서비스 키(.env.local)가 없어 DB를 읽지 않았어요' })
      return
    }
    let failure: string | null
    try {
      failure = await run(supabase)
    } catch (e) {
      failure = `DB 조회에 실패했어요: ${errorMessage(e)}`
    }
    if (failure) {
      checks.push({ label, status: '실패', detail: failure })
      errors.push(`${label}: ${failure}`)
    } else {
      checks.push({ label, status: '통과', detail: '' })
    }
  }

  return { checks, errors, add }
}
