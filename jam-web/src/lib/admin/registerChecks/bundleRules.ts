/**
 * 등록 묶음 검사 공용 규칙(티켓 20261002_1027, 상위 20260930_1500 ②-2a).
 *
 * 에셋 제너레이터 등록 묶음(`bundle.json`) 검사가 `scripts/asset-generator/register*Bundle.mjs` 세 파일에 세 벌씩 두던
 * 정규식·상수·보조 함수를 한 곳으로 옮긴 모듈이다. 서버(운영툴 예약 등록)가 같은 검사를 쓰려고 `src/`로 옮겼다.
 * 정규식 원문과 오류 문장은 옮기기 전과 같다. 스크립트(`registerBundle.mjs`·`registerMissionBundle.mjs`·
 * `registerHomeFeedBundle.mjs`)는 이 모듈을 가져다 쓰고, 지금까지 내보내던 이름은 그대로 다시 내보낸다.
 * 이 폴더의 파일은 `node:` 모듈과 `scripts/` 아래 파일을 가져오지 않는다(`__tests__/registerChecks.test.ts`가 원문으로 확인한다).
 *
 * 상수에 `as const`를 쓰지 않는다 — 스크립트 테스트가 상수에 타입 단언을 해서 읽기 전용 튜플이면 컴파일이 깨진다.
 */

/** 이 스크립트가 등록하는 행의 `image_source` 값(마이그레이션 186 CHECK 허용값). */
export const AGENT_IMAGE_SOURCE = 'agent-generator'

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

// 한 줄 텍스트(작성자·제목 등) 검사. 이 값들은 등록 기록 SQL(registration.sql)의 `--` 주석에도 들어가고
// 그 파일은 마이그레이션 폴더에 커밋되어 다시 실행될 수 있다. 줄바꿈이 섞이면 뒷부분이 주석 밖의 실행 가능한
// 문장이 되므로(20260924_2202 게이트 재현), 개행·제어 문자를 검증에서 거절한다.
// 이 정규식의 원본은 여기 한 곳이다 — 등록 기록 SQL 주석 정리(`registerRecord.mjs`)도 `registerBundle.mjs`를 거쳐
// 이것을 가져다 쓴다(티켓 20260925_0549).
export const CONTROL_OR_LINE_BREAK = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/

export type PlainObject = Record<string, unknown>

// 타입 술어(`value is ...`)로 만들지 않는다 — 스크립트(.mjs) 쪽에서 `raw`가 이 검사로 좁혀지면 묶음 반환 타입이 좁아져
// 테스트의 `bundle.card` 접근이 막힌다. TS 검사 함수는 이 검사 뒤에 `as PlainObject`로 좁힌다.
export function isPlainObject(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function hasControlOrLineBreak(value: unknown): boolean {
  return typeof value === 'string' && CONTROL_OR_LINE_BREAK.test(value)
}

export function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE_TIME_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
}

export function isPresent<T>(value: T): value is NonNullable<T> {
  return value !== undefined && value !== null
}

/** 사용자에게 보이는 글자(코드 포인트) 수. 문자열 length가 아니라 `[...s].length`로 센다(이모지·서로게이트 쌍 보정). */
export function visibleLength(value: string): number {
  return [...value].length
}

export function describeValue(value: unknown): string {
  if (value === undefined) return '없음'
  return typeof value === 'string' ? `"${value}"` : JSON.stringify(value)
}

export function unknownKeys(obj: PlainObject, allowed: readonly string[]): string[] {
  return Object.keys(obj).filter((key) => !allowed.includes(key))
}

export function checkRequired(errors: string[], prefix: string, obj: PlainObject, keys: readonly string[]): void {
  for (const key of keys) {
    if (!isPresent(obj[key])) errors.push(`${prefix}${key}: 필수 항목이 없어요.`)
  }
}
