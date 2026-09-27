/**
 * 온보딩 퀘스트 단계 부품 전용 오류 (티켓 20260928_0058).
 *
 * `POST /api/onboarding-quest/step` 호출부(홈 `OnboardingSyncButton.tsx`, 티켓
 * 20260927_2331)가 서버 응답 실패(res.ok === false)를 알릴 때 던진다. 호출부는 이
 * 타입이면 저장 실패 전용 토스트를, 그 외 예외(네트워크 오류 등)면 공통 네트워크 오류
 * 토스트를 보여 기존 두 갈래 문구를 그대로 유지한다.
 */
export class StepSaveFailedError extends Error {
  constructor() {
    super('온보딩 퀘스트 단계 기록 실패')
    this.name = 'StepSaveFailedError'
  }
}
