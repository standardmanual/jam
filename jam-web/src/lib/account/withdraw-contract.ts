/**
 * 유저용 탈퇴의 서버·화면 계약 (티켓 20261021_1249 3회, 운영 로직 17.1절)
 *
 * - 확인 문구 상수 한 곳: 화면의 라벨·불일치 문구·입력 비교, 서버의 재검사와 오류 문구가 모두 이 상수에서 글자를 가져온다.
 *   어드민의 «삭제합니다»(`DeleteUserButton.tsx`)와 같은 형식이지만 어드민 전용이라 값을 나누지 않고 재사용하지도 않는다.
 * - 일치 검사: 앞뒤 공백을 무시하고 NFC로 정규화한 뒤 비교한다. iOS 예측 입력이 공백을 붙일 수 있고, 붙여넣은 한글이 NFD(자모 분리)일 수 있다.
 *   서버도 같은 함수로 다시 검사한다.
 * - 본인 데이터 요약(`GET /api/account/delete-summary`)의 모양과 그것을 읽는 파서. 파서는 계약 밖 모양을 null로 돌려줘서
 *   화면이 요약을 못 읽은 경우와 같게(일반 문장 하나) 다루게 한다.
 *
 * 이 파일은 서버 전용 모듈을 가져오지 않는다 — 클라이언트 컴포넌트와 API route가 함께 쓴다.
 */

/** 탈퇴 확인 문구. 화면 문구와 서버 오류 문구는 `{phrase}` 보간으로 이 값을 받는다 */
export const WITHDRAW_CONFIRM_PHRASE = '탈퇴합니다'

/** 입력값을 비교용으로 다듬는다: NFC 정규화 뒤 앞뒤 공백 제거 */
export function normalizeConfirmInput(value: string): string {
  return value.normalize('NFC').trim()
}

/** 입력이 확인 문구와 같은가. 문자열이 아니면(본문 누락 등) 아니다 */
export function isWithdrawConfirmed(value: unknown): boolean {
  return typeof value === 'string' && normalizeConfirmInput(value) === normalizeConfirmInput(WITHDRAW_CONFIRM_PHRASE)
}

/** `POST /api/account/delete` 본문 */
export interface WithdrawRequestBody {
  confirmPhrase: string
}

/** 탈퇴 화면이 «지워지는 것»으로 보이는 본인 데이터 요약 */
export interface AccountSummary {
  /** 액티비티 배지 보유 수(삭제된 배지 제외, 프로필의 배지 수와 같은 기준) */
  activityBadgeCount: number
  /** 체크인 배지 종류 수(반복 획득은 1개) */
  checkinBadgeCount: number
  /** 지워질 때 «없어짐» 처리되는 아이템 배지 수(어드민 삭제 미리보기의 «없어질 아이템 수»와 같은 기준) */
  itemCount: number
  /** 잼 잔액 */
  jamBalance: number
  /** 포인트 잔액 */
  pointBalance: number
  /** Strava 동기화가 연결돼 있는가(끊긴 연결은 아니다) */
  stravaConnected: boolean
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** 잔액은 정수이면 된다. 음수 잔액이 있어도 요약 전체를 버리지 않는다 */
function isBalance(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

/** 요약 응답을 읽는다. 계약(`{ summary: AccountSummary }`)과 다르면 null */
export function parseAccountSummary(data: unknown): AccountSummary | null {
  if (typeof data !== 'object' || data === null) return null
  const raw = (data as Record<string, unknown>).summary
  if (typeof raw !== 'object' || raw === null) return null
  const s = raw as Record<string, unknown>
  if (
    !isCount(s.activityBadgeCount) ||
    !isCount(s.checkinBadgeCount) ||
    !isCount(s.itemCount) ||
    !isBalance(s.jamBalance) ||
    !isBalance(s.pointBalance) ||
    typeof s.stravaConnected !== 'boolean'
  ) {
    return null
  }
  return {
    activityBadgeCount: s.activityBadgeCount,
    checkinBadgeCount: s.checkinBadgeCount,
    itemCount: s.itemCount,
    jamBalance: s.jamBalance,
    pointBalance: s.pointBalance,
    stravaConnected: s.stravaConnected,
  }
}
