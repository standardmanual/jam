/**
 * 고르기 화면에 들어온 유저를 어디에 둘지 정하는 순수 판정 (티켓 20261021_1247 1회)
 *
 * 화면(`page.tsx`)이 `users` 행을 읽은 뒤 이 함수로 «홈으로 / 트라이브 단계 / 아이디 단계»를 고른다.
 * 판정 기준은 `tribe_id` 하나다(`lib/tribe/gate-contract.ts`의 `hasTribe`). `(main)` 레이아웃의 트라이브 게이트·로그인 콜백·프로필 경유지와
 * 같은 기준이라 «게이트는 `/onboarding`으로 보내는데 이 화면은 홈으로 되돌리는» 반복이 생기지 않는다.
 * 예전에는 `onboarding_completed_at`을 봤고, 그러면 완료 시각은 있는데 트라이브가 없는 계정이 두 화면 사이를 오갔다.
 *
 * 순수 모듈이다(import는 계약 파일의 판정 하나). 서버 전용 코드를 가져오지 않는다.
 */
import { hasTribe } from '@/lib/tribe/gate-contract'

/** 화면이 `users`에서 읽는 칸 */
export interface OnboardingUserRow {
  username: string | null
  display_name: string | null
  avatar_url: string | null
  tribe_id: string | null
}

export type OnboardingEntry =
  /** 트라이브를 이미 골랐다 — 이 화면에 올 이유가 없으니 홈으로 보낸다 */
  | { kind: 'home' }
  /**
   * 아이디는 정했고 트라이브만 남았다 — 곧장 트라이브 단계로 간다.
   * 로그인 직후이든 트라이브 게이트로 돌아왔든 이 화면은 이유를 모르므로, 이 유저에게만 «트라이브를 고르면 JAM!을 시작할 수 있어요» 한 줄을 보인다.
   */
  | { kind: 'tribe'; username: string; displayName: string; avatarUrl: string | null }
  /** 아이디부터 정한다 */
  | { kind: 'account'; avatarUrl: string | null }

export function resolveOnboardingEntry(row: OnboardingUserRow | null | undefined): OnboardingEntry {
  if (hasTribe(row?.tribe_id)) return { kind: 'home' }
  const avatarUrl = row?.avatar_url ?? null
  if (row?.username) {
    return { kind: 'tribe', username: row.username, displayName: row.display_name ?? '', avatarUrl }
  }
  return { kind: 'account', avatarUrl }
}
