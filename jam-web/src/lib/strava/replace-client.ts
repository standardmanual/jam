/**
 * «그래도 연결하기» 흐름 — 서버·화면 계약과 브라우저 쪽 로직 (티켓 20261021_1249 4회, 운영 로직 3.2절)
 *
 * 화면 컴포넌트(`StravaDuplicateSheet`)에서 호출·성공·실패·중복 탭 막기를 떼어 낸 순수 로직이다. 저장소에 jsdom이 없어 컴포넌트를 눌러 볼 수 없으므로
 * 눌렀을 때의 동작을 여기서 단위 시험으로 고정한다(`lib/strava/disconnect-client.ts`, `lib/account/withdraw-client.ts`와 같은 구조).
 *
 * 이 파일은 서버 전용 모듈을 가져오지 않는다. 클라이언트 컴포넌트가 쓰고, `POST /api/strava/replace`가 응답 모양(`next`)의 타입과 성공 뒤 이동 경로를
 * 맞추려고 타입만 가져온다.
 *
 * 성공 뒤: 시트를 «연결하는 중» 그대로 두고 `window.location.replace`로 도착 화면(`/profile?strava=connected&reveal=1`)으로 이동한다.
 * 닫으면 새 연결이 반영되기 전의 화면이 잠깐 비치고, `router.push`는 클라이언트 캐시를 비우지 않아 뒤로 가기로 낡은 화면에 돌아올 수 있다.
 */
import { d } from '@/lib/i18n'

/** 성공 뒤 이동하는 곳. 콜백이 연결을 마쳤을 때의 목적지와 같다 — 도착 화면의 `StravaConnectReveal`이 획득 연출을 잇는다 */
export const STRAVA_REPLACE_DONE_PATH = '/profile?strava=connected&reveal=1'

/** «Strava 다시 동기화하기»가 가는 곳. 프로필 설정의 같은 버튼(`StravaSettingsSection`)과 같다 */
export const STRAVA_RESTART_PATH = '/api/strava/auth'

export const STRAVA_REPLACE_ENDPOINT = '/api/strava/replace'

/**
 * 실패했을 때 시트가 어떤 모양이 되는지 서버가 알려 준다.
 *  - retry: 같은 버튼을 다시 누르면 된다(일시적인 문제).
 *  - restart: 연결 요청이 닫혔다. 처음부터 Strava 동기화를 다시 해야 한다(«그래도 연결하기»는 막힌다).
 *  - blocked: 그사이 기존 계정이 어드민이 되었거나 정지됐다. 시트가 막힘 모양으로 바뀐다.
 */
export type StravaReplaceNext = 'retry' | 'restart' | 'blocked'

const NEXT_VALUES: readonly StravaReplaceNext[] = ['retry', 'restart', 'blocked']

function isNext(value: unknown): value is StravaReplaceNext {
  return typeof value === 'string' && (NEXT_VALUES as readonly string[]).includes(value)
}

/** 시트의 푸터 맨 위에 보이는 실패 안내. `message`는 서버가 완성한 문장이다 */
export interface StravaReplaceNotice {
  message: string
  next: Exclude<StravaReplaceNext, 'blocked'>
}

export type StravaReplaceOutcome = { ok: true } | { ok: false; next: StravaReplaceNext; message: string }

const FALLBACK_MESSAGE: Record<StravaReplaceNext, string> = {
  retry: d.stravaConnection.replaceResult.retry,
  restart: d.stravaConnection.replaceResult.restart,
  blocked: d.stravaConnection.replaceResult.blocked,
}

/**
 * `POST /api/strava/replace`를 부른다. 실패 문구와 `next`는 서버가 `d.stravaConnection.replaceResult.*`로 완성해 내려보낸 값을 그대로 쓴다(ADR 0001).
 * 네트워크 오류와 읽을 수 없는 응답(JSON이 아닌 게이트웨이 오류 등)은 retry와 그 고정 문장이다. DB·Strava 오류 원문과 토큰은 어디에도 없다.
 */
export async function requestStravaReplace(fetchImpl: typeof fetch = fetch): Promise<StravaReplaceOutcome> {
  try {
    const res = await fetchImpl(STRAVA_REPLACE_ENDPOINT, { method: 'POST' })
    if (res.ok) return { ok: true }

    let body: Record<string, unknown> = {}
    try {
      const parsed: unknown = await res.json()
      if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>
    } catch {
      // 본문을 읽지 못하면 아래 고정 문장을 쓴다
    }
    const next: StravaReplaceNext = isNext(body.next) ? body.next : 'retry'
    const message = typeof body.error === 'string' && body.error.trim() !== '' ? body.error : FALLBACK_MESSAGE[next]
    return { ok: false, next, message }
  } catch {
    return { ok: false, next: 'retry', message: FALLBACK_MESSAGE.retry }
  }
}

export interface StravaReplaceFlowDeps {
  /** 진행 중인 요청이 있는지 — 렌더를 거치지 않고 바로 읽어야 해서 ref 모양이다(빠른 연속 탭 방지) */
  inFlight: { current: boolean }
  request: () => Promise<StravaReplaceOutcome>
  setSubmitting: (submitting: boolean) => void
  /** 실패 안내. 요청을 시작할 때 null로 지운다 */
  setNotice: (notice: StravaReplaceNotice | null) => void
  /** 실행 중에 기존 계정이 막힌 경우 — 시트가 막힘 모양으로 바뀐다 */
  onBlocked: () => void
  /** 도착 화면으로 이동한다(`window.location.replace`) */
  redirect: () => void
}

/**
 * «그래도 연결하기» 버튼을 눌렀을 때의 흐름. 이미 진행 중이면 아무것도 하지 않는다(서버 호출은 한 번뿐).
 * 성공이면 이동하고 제출 중 표시를 풀지 않는다. 실패면 `blocked`는 시트 모양을 바꾸고, `retry`·`restart`는 안내를 띄운다. 실패에서는 제출 중 표시를 푼다.
 */
export async function runStravaReplace(deps: StravaReplaceFlowDeps): Promise<void> {
  if (deps.inFlight.current) return
  deps.inFlight.current = true
  deps.setSubmitting(true)
  deps.setNotice(null)

  let outcome: StravaReplaceOutcome
  try {
    outcome = await deps.request()
  } catch {
    outcome = { ok: false, next: 'retry', message: FALLBACK_MESSAGE.retry }
  }

  if (outcome.ok) {
    deps.redirect()
    return
  }

  if (outcome.next === 'blocked') {
    deps.onBlocked()
  } else {
    deps.setNotice({ message: outcome.message, next: outcome.next })
  }
  deps.inFlight.current = false
  deps.setSubmitting(false)
}
