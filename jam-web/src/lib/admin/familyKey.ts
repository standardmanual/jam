/**
 * 계열 키 형식 판정 (순수 파일, 티켓 20261004_1756 ⑨-a).
 *
 * `badge-families.ts`에 있던 `isValidFamilyKey`를 옮겼다. 그 파일은 배지 트리 표시 모듈(`@/lib/badgeTree` 등)을 끌어와, 형식 판정만 필요한
 * 순수 모듈(운영툴 예약 등록 핸들러 `opsInbox/execute/jamBadge.ts`)이 쓰기에 무겁다. `badge-families.ts`가 이 함수를 다시 내보내므로
 * 기존 호출부는 그대로 `@/lib/admin/badge-families`에서 가져온다.
 */

/**
 * 키로 쓸 수 있는 형태인가. **관대하게 본다** — 기존 207종의 키는 마이그레이션 130이
 * `"{activity_type}:{name}"`으로 구워 공백이 든 한글이 그대로 들어 있고(`walking:밤의 보행자`),
 * 그 키를 교차 게이트가 이미 가리키고 있을 수 있다. 여기서 막아야 하는 것은 «게이트에
 * 적을 수 없게 되는 형태»뿐이다.
 */
export function isValidFamilyKey(key: string): boolean {
  if (!key || key !== key.trim()) return false
  if (key.includes(',')) return false // 교차 게이트 입력이 쉼표 구분 목록이다
  if (key.startsWith('#')) return false // `#name:`은 `familyKeyOf`의 폴백 접두어 전용
  return key.includes(':')
}
