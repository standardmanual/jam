/**
 * 서버 컴포넌트 `searchParams` 정규화 — 단일 문자열만 통과시킨다 (티켓 20260906_1312).
 *
 * ## 왜 배열이 오는가
 *
 * Next는 같은 쿼리 키가 두 번 이상 오면(`?q=a&q=b`) 그 값을 **`string[]`으로 넘긴다.**
 * 그런데 대부분의 화면이 `searchParams`를 단수 `string`으로 선언해 **타입체커가 그 사실을
 * 가렸고**, 값에 `.trim()`·`.toLowerCase()` 같은 문자열 메서드를 부르는 순간 런타임
 * `TypeError`로 화면 전체가 500이 됐다(`/search` · `/badges/[id]` · `/collections/[id]`
 * staging 실측). 중복 파라미터는 손으로 고친 URL·링크 합성·리다이렉트 체인에서 흔히 생기는
 * 입력이지 예외 상황이 아니다.
 *
 * ## 왜 첫 값을 쓰지 않는가
 *
 * ⚠️ `raw[0]`으로 「첫 값 채택」하도록 고치지 말 것. 중복 파라미터는 정상 링크에서 나오지
 * 않으므로 **어느 쪽이 사용자 의도인지 알 방법이 없다.** 반대로 「값 없음」은 모든 호출부에서
 * 안전한 기본값을 갖는다 — `?u=` 없으면 내 기준, `?slot=` 없으면 비-슬롯 모드,
 * `?page=` 없으면 1쪽, `?q=` 없으면 빈 검색. 배지 트리의 `normalizeActivity`(티켓
 * 20260906_1158)와 `/badges`의 `normalizeTab`도 같은 입력에서 이미 폴백으로 동작한다 —
 * **세 곳이 서로 다르게 동작하면 그게 더 나쁘다.**
 *
 * ⚠️ 호출부 타입을 `string`으로 좁혀 이 헬퍼를 걷어내지도 말 것. 「`string`으로 하면
 * 깔끔한데」가 정확히 이 결함을 만든 경로다.
 */
export function singleQueryParam(raw: string | string[] | undefined): string | undefined {
  // 빈 문자열(`?q=`)은 그대로 통과시킨다 — 배열·부재만 흡수하는 것이 이 헬퍼의 역할이고,
  // 빈 값의 처리는 화면마다 기존 폴백이 이미 갖고 있다.
  return typeof raw === 'string' ? raw : undefined
}

/**
 * `searchParams`를 통째로 받는 화면(어드민 목록 등)용 — 레코드의 모든 값에
 * {@link singleQueryParam}을 적용한다. 화면마다 필드별 방어를 반복하지 않기 위한 것이다.
 *
 * 반환 타입이 `Record<string, string | undefined>`라, 정규화한 레코드를 그대로 쓰는
 * 하위 컴포넌트(`Pagination`의 `searchParams` prop 등)는 손대지 않아도 된다.
 */
export function pickSingleQueryParams(
  params: Record<string, string | string[] | undefined>
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(params)) {
    result[key] = singleQueryParam(value)
  }
  return result
}
