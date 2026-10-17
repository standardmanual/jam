/**
 * 프로필 설정의 «동기화 끊기» 흐름 — 브라우저 쪽 로직 (티켓 20261017_1422 2회)
 *
 * 화면 컴포넌트(`StravaDisconnectSheet`)에서 호출·성공·실패·중복 클릭 막기를 떼어 낸 순수 로직이다.
 * 저장소에 jsdom이 없어 컴포넌트를 눌러 볼 수 없으므로, 눌렀을 때의 동작을 여기서 단위 시험으로 고정한다.
 */

export type DisconnectOutcome = 'ok' | 'error'

/**
 * `POST /api/strava/disconnect`를 부른다. 200과 404(연결 없음)는 «이미 끊긴 것»이라 성공으로 본다.
 * 서버는 이미 끊긴 연결에 다시 불러도 200을 돌려준다(멱등). 그 밖의 상태와 네트워크 오류는 실패다.
 */
export async function requestStravaDisconnect(fetchImpl: typeof fetch = fetch): Promise<DisconnectOutcome> {
  try {
    const res = await fetchImpl('/api/strava/disconnect', { method: 'POST' })
    return res.ok || res.status === 404 ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

export interface DisconnectFlowDeps {
  /** 진행 중인 요청이 있는지 — 렌더를 거치지 않고 바로 읽어야 해서 ref 모양이다(빠른 연속 클릭 방지) */
  inFlight: { current: boolean }
  request: () => Promise<DisconnectOutcome>
  setSubmitting: (submitting: boolean) => void
  onSuccess: () => void
  onError: () => void
}

/**
 * 확정 버튼을 눌렀을 때의 흐름. 이미 진행 중이면 아무것도 하지 않는다(서버 호출은 한 번뿐).
 * 성공이면 `onSuccess`, 실패면 `onError`를 부르고, 어느 쪽이든 제출 중 표시를 푼다.
 */
export async function runStravaDisconnect(deps: DisconnectFlowDeps): Promise<void> {
  if (deps.inFlight.current) return
  deps.inFlight.current = true
  deps.setSubmitting(true)
  try {
    const outcome = await deps.request()
    if (outcome === 'ok') deps.onSuccess()
    else deps.onError()
  } finally {
    deps.inFlight.current = false
    deps.setSubmitting(false)
  }
}
