/**
 * 캡슐 시트 열기 신호 (티켓 20261021_1248 2회, 채원 사전 판정: 카드의 ② 버튼이 캡슐 시트를 바로 연다)
 *
 * 홈의 «JAM! 시작하기» 카드(`OnboardingQuestCard`)와 캡슐 위젯(`CapsuleWidget`)은 서로 다른 컴포넌트이고 한쪽이 다른 쪽을 감싸지 않는다.
 * 그래서 카드가 위젯의 상태를 직접 만지지 않고 브라우저 이벤트 하나로 «시트를 열어 달라»고만 알린다. 위젯이 마운트돼 있지 않으면 아무 일도 일어나지 않는다.
 * 시트를 여는 일(조회 실패 때의 다시 시도 포함)은 알약을 눌렀을 때와 같은 경로로 위젯이 처리한다.
 *
 * 브라우저 전용이다. 서버에서 부르면 아무것도 하지 않는다. 테스트는 `target`으로 EventTarget을 넘긴다.
 */
export const CAPSULE_SHEET_OPEN_EVENT = 'jam:capsule-sheet-open'

function defaultTarget(): EventTarget | null {
  return typeof window === 'undefined' ? null : window
}

/** 캡슐 시트를 열어 달라고 알린다. 받는 위젯이 없으면 조용히 끝난다. */
export function requestCapsuleSheetOpen(target: EventTarget | null = defaultTarget()): void {
  target?.dispatchEvent(new Event(CAPSULE_SHEET_OPEN_EVENT))
}

/** 열기 신호를 받는다. 돌려주는 함수를 부르면 구독이 풀린다. */
export function subscribeCapsuleSheetOpen(handler: () => void, target: EventTarget | null = defaultTarget()): () => void {
  if (!target) return () => {}
  target.addEventListener(CAPSULE_SHEET_OPEN_EVENT, handler)
  return () => target.removeEventListener(CAPSULE_SHEET_OPEN_EVENT, handler)
}
