/**
 * 프로필 설정의 «탈퇴하기» 흐름 — 브라우저 쪽 로직 (티켓 20261021_1249 3회)
 *
 * 화면 컴포넌트(`WithdrawSheet`)에서 호출·성공·실패·중복 클릭 막기를 떼어 낸 순수 로직이다. 저장소에 jsdom이 없어 컴포넌트를 눌러 볼 수 없으므로
 * 눌렀을 때의 동작을 여기서 단위 시험으로 고정한다(`lib/strava/disconnect-client.ts`와 같은 구조).
 *
 * 성공 뒤의 순서: `signOut()`이 **끝난 뒤에** 이동한다. 로그인된 채 `/login`에 닿으면 `proxy.ts`가 홈으로 돌려보내기 때문이다.
 * `signOut()`이 오류를 내도 이동한다(계정은 이미 지워졌다). 성공하면 제출 중 표시를 풀지 않는다 — 시트를 «탈퇴하는 중» 그대로 두어
 * 지워진 계정의 프로필 편집 화면이 잠깐 비치지 않게 한다.
 */
import { d } from '@/lib/i18n'
import { isWithdrawConfirmed, parseAccountSummary, type AccountSummary } from './withdraw-contract'

export type SummaryOutcome = { ok: true; summary: AccountSummary } | { ok: false }

/**
 * `GET /api/account/delete-summary`를 부른다. 응답이 실패이거나 모양이 계약과 다르거나 네트워크 오류면 `{ ok: false }`다 —
 * 화면은 이때 수치 대신 일반 문장을 보이고 탈퇴는 막지 않는다. 오류 문구는 화면에 띄우지 않으므로 싣지 않는다.
 */
export async function requestAccountSummary(
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<SummaryOutcome> {
  try {
    const res = await fetchImpl('/api/account/delete-summary', { signal })
    if (!res.ok) return { ok: false }
    const summary = parseAccountSummary(await res.json())
    return summary ? { ok: true, summary } : { ok: false }
  } catch {
    return { ok: false }
  }
}

export type WithdrawOutcome = { ok: true } | { ok: false; message: string }

/**
 * `POST /api/account/delete`를 부른다. 실패 문구는 서버가 `d.account.*`로 완성해 내려보낸 `error`를 그대로 쓴다(ADR 0001).
 * 네트워크 오류와 읽을 수 없는 응답(JSON이 아닌 게이트웨이 오류 등)은 500과 같은 고정 문장이다. DB·Auth 오류 원문은 어디에도 없다.
 */
export async function requestAccountDeletion(
  confirmPhrase: string,
  fetchImpl: typeof fetch = fetch
): Promise<WithdrawOutcome> {
  try {
    const res = await fetchImpl('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmPhrase }),
    })
    if (res.ok) return { ok: true }
    let message: string | null = null
    try {
      const body: unknown = await res.json()
      const error = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).error : undefined
      if (typeof error === 'string' && error.trim() !== '') message = error
    } catch {
      // 본문을 읽지 못하면 아래 고정 문장을 쓴다
    }
    return { ok: false, message: message ?? d.account.deleteFailed }
  } catch {
    return { ok: false, message: d.account.deleteFailed }
  }
}

export interface WithdrawFlowDeps {
  /** 진행 중인 요청이 있는지 — 렌더를 거치지 않고 바로 읽어야 해서 ref 모양이다(빠른 연속 클릭 방지) */
  inFlight: { current: boolean }
  /** 입력칸의 현재 값. 확인 문구와 맞지 않으면 아무것도 하지 않는다(버튼이 막혀 있어도 한 번 더 막는다) */
  phrase: string
  request: (confirmPhrase: string) => Promise<WithdrawOutcome>
  setSubmitting: (submitting: boolean) => void
  /** 실패 안내. 요청을 시작할 때 null로 지운다 */
  setError: (message: string | null) => void
  signOut: () => Promise<unknown>
  /** 로그인 화면으로 이동한다(`window.location.replace`) */
  redirect: () => void
}

/**
 * 확정 버튼을 눌렀을 때의 흐름. 이미 진행 중이거나 확인 문구가 맞지 않으면 아무것도 하지 않는다(서버 호출은 한 번뿐).
 * 실패면 안내를 띄우고 제출 중 표시를 푼다(입력값은 호출부가 유지한다). 성공이면 `signOut()` 뒤에 이동하고 제출 중 표시를 풀지 않는다.
 */
export async function runWithdraw(deps: WithdrawFlowDeps): Promise<void> {
  if (deps.inFlight.current) return
  if (!isWithdrawConfirmed(deps.phrase)) return
  deps.inFlight.current = true
  deps.setSubmitting(true)
  deps.setError(null)

  let outcome: WithdrawOutcome
  try {
    outcome = await deps.request(deps.phrase)
  } catch {
    outcome = { ok: false, message: d.account.deleteFailed }
  }

  if (!outcome.ok) {
    deps.setError(outcome.message)
    deps.inFlight.current = false
    deps.setSubmitting(false)
    return
  }

  try {
    await deps.signOut()
  } catch (error) {
    console.error('[withdraw] 탈퇴 뒤 로그아웃 정리 실패(계속 이동):', error)
  }
  deps.redirect()
}
