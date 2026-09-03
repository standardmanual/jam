/**
 * GA4 커스텀 이벤트 계측 공용 헬퍼 (티켓 20260903_1034).
 *
 * `@next/third-parties/google`가 제공하는 `sendGAEvent()`를 그대로 감싼다 — 직접 `window.gtag`를
 * 참조하지 않는 게 GA4 권장 방식이다(third-parties가 내부 dataLayer 이름을 관리한다).
 *
 * 환경 분리: GA4 측정 스트림이 현재 1개(`G-7K884Q399P`)뿐이라 staging/production 트래픽이
 * 같은 스트림에 섞인다. 스트림을 분리하는 대신 모든 이벤트에 `environment` 파라미터를 붙여
 * GA4 콘솔에서 세그먼트로 나눠 볼 수 있게 한다 (jam-stage/jam Vercel 프로젝트가 이미 별도
 * 프로젝트로 분리돼 있으므로, 프로젝트별 환경변수로 값을 다르게 준다 — `NEXT_PUBLIC_GA_ENVIRONMENT`).
 * `NEXT_PUBLIC_GA_MEASUREMENT_ID`가 없는 환경(로컬 등)에서는 스크립트 자체를 렌더하지 않으므로
 * 이 함수도 조용히 스킵한다.
 */
import { sendGAEvent } from '@next/third-parties/google'

type GaEnvironment = 'production' | 'staging' | 'development'

function resolveEnvironment(): GaEnvironment {
  const value = process.env.NEXT_PUBLIC_GA_ENVIRONMENT
  if (value === 'production' || value === 'staging' || value === 'development') return value
  return 'development'
}

export type GaEventParams = Record<string, string | number | boolean | null | undefined>

/**
 * GA4 커스텀 이벤트를 전송한다. `NEXT_PUBLIC_GA_MEASUREMENT_ID`가 설정되지 않은 환경(로컬 개발
 * 등)에서는 GA 스크립트 자체가 없으므로 아무 것도 하지 않는다.
 */
export function trackEvent(eventName: string, params: GaEventParams = {}): void {
  if (!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) return
  sendGAEvent('event', eventName, { ...params, environment: resolveEnvironment() })
}
