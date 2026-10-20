/**
 * 챕터 점수의 결정적 원천 id (티켓 20261019_1315)
 *
 * `chapter_add_score`는 (활동 종류, 원천 id)를 전역 유일 키로 써서 같은 일을 두 번 보내도 한 번만 센다. 그런데 컬렉션 완성 기록과
 * 배지 받기는 기록 표에 id가 없거나 지웠다 다시 만들어질 수 있어, 입력(유저·컬렉션·등급, 유저·배지 등)에서 항상 같은 UUID를
 * 만들어 쓴다. 순수 함수이고 Node `crypto`만 쓴다(새 의존성 없음).
 *
 * 만드는 방식: `JSON.stringify([namespace, ...parts])`를 SHA-256으로 해시한 앞 16바이트에 UUID 버전 8(사용자 정의)·변종 비트를 맞춘다.
 *  - 배열로 직렬화해서 («a», «bc»)와 («ab», «c»)처럼 경계만 다른 입력이 같은 값이 되지 않고, 입력 순서가 다르면 값이 달라진다.
 *  - 네임스페이스가 키의 일부라서 다른 용도의 id와 우연히 겹치지 않는다.
 *
 * 서버 전용이다(`node:crypto`). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 */
import { createHash } from 'node:crypto'

/**
 * 같은 입력이면 항상 같은 UUID를 돌려준다.
 * 네임스페이스나 조각이 빈 문자열이면 서로 다른 입력이 같은 값으로 모이므로 던진다(호출부 버그다).
 */
export function deterministicSourceId(namespace: string, ...parts: string[]): string {
  if (namespace === '') throw new Error('deterministicSourceId: namespace가 비었다')
  if (parts.length === 0) throw new Error('deterministicSourceId: 조각이 하나도 없다')
  if (parts.some((part) => part === '')) throw new Error('deterministicSourceId: 빈 조각이 있다')

  const digest = createHash('sha256')
    .update(JSON.stringify([namespace, ...parts]))
    .digest()
  const bytes = Buffer.from(digest.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x80 // 버전 8
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // 변종 10xx
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
