/**
 * 캡슐 계약 — 서버와 클라이언트가 함께 읽는 순수 타입·상수 (티켓 20261018_0052 1회, 운영 로직 5.2절)
 *
 * 서버 모듈(`capsule.ts`, `policy.ts`)과 분리한 이유: 캡슐 화면(3-4)이 이 파일을 가져와도
 * `@/lib/supabase/server`·`next/headers`가 번들에 끌려오지 않게 하기 위해서다. **이 파일은 아무것도 가져오지 않는다.**
 */

/** 못 여는 까닭. 1회는 «다 채우지 못함»뿐이고, 인벤토리 빈칸 모자람은 2회가 더한다. */
export type CapsuleNotOpenableReason = 'not_full'

/** 캡슐 조회·채우기 응답의 캡슐 상태 */
export interface CapsuleStatus {
  /** 이 캡슐이 생길 때 정해진 필요량(이후 고정) */
  required: number
  /** 지금까지 채운 양 */
  filled: number
  /** 남은 양(`required - filled`) */
  remaining: number
  /** 유저가 가진 잼 */
  balance: number
  /** 지금 열 수 있는지. 1회는 `filled >= required` 여부만 본다(빈칸 검사는 2회) */
  openable: boolean
  /** 못 여는 까닭. 열 수 있으면 null */
  notOpenableReason: CapsuleNotOpenableReason | null
}

/** 채우기 성공 응답: 캡슐 상태에 이번에 채운 양을 더한다 */
export interface CapsuleFillPayload extends CapsuleStatus {
  /** 이번에 실제로 채운 양(가진 잼이 모자라면 요청보다 적을 수 있다) */
  applied: number
}

/** 채우기가 거절되는 경우의 코드. DB 함수 `capsule_fill`의 `error` 값과 같다. */
export const CAPSULE_ERROR_CODES = ['user_suspended', 'already_full', 'invalid_amount', 'exceeds_remaining', 'insufficient_jam'] as const

export type CapsuleErrorCode = (typeof CAPSULE_ERROR_CODES)[number]

/** 채우기 거절 응답(4xx)의 모양 */
export interface CapsuleErrorResponse {
  error: string
  code: CapsuleErrorCode
  /** `exceeds_remaining`일 때 채울 수 있는 남은 양 */
  remaining?: number
}

/** 채울 양의 상한 — DB 함수 인자가 INTEGER라 이보다 크면 형식 오류다 */
export const CAPSULE_AMOUNT_MAX = 2147483647
