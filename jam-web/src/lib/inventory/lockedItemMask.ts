/**
 * 잠긴 아이템 배지 상세의 가린 이름 (티켓 20261110_0948, 사용자 지시 2026-11-10)
 *
 * 열기 전에는 이름을 알 수 없으니, 이름 자리에 특수문자 6글자를 보인다(예: «@&₩-)/»). 배지마다 다르게 보이고, 같은 조합이 나와도 된다.
 *
 * 렌더마다 새로 뽑으면 서버 렌더와 클라이언트 하이드레이션이 어긋나고(React #418), 새로고침할 때마다 이름이 바뀐다. 그래서 개체 id를 시드로 쓰는
 * 결정적 선택이다 — 같은 개체는 언제나 같은 6글자다. 이 값은 개체 id에서만 나오므로 어떤 아이템 배지인지 알려 주는 값이 아니다(운영 로직 7.3절 가림 원칙).
 */

/** 가린 이름에 쓰는 특수문자 */
export const LOCKED_MASK_CHARS = ['@', '&', '₩', '-', ')', '/', '(', '!', '?', '%', '^', '£', '¥'] as const

/** 가린 이름의 글자 수 */
export const LOCKED_MASK_LENGTH = 6

/** 문자열 → 32비트 해시(FNV-1a) */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 시드 하나에서 같은 순서의 난수를 뽑는 작은 생성기(mulberry32) */
function makeRandom(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 개체 id(시드)에서 특수문자 6글자 이름을 만든다. 같은 시드는 항상 같은 이름이다 */
export function lockedItemMaskName(seed: string): string {
  const random = makeRandom(hashSeed(seed))
  let name = ''
  for (let i = 0; i < LOCKED_MASK_LENGTH; i += 1) {
    name += LOCKED_MASK_CHARS[Math.floor(random() * LOCKED_MASK_CHARS.length)]
  }
  return name
}
