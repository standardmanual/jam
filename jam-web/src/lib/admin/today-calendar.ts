/**
 * 어드민 투데이 캘린더뷰(20260902_1028) — 'YYYY-MM-DD' 날짜 문자열 ↔ KST 하루 경계 변환.
 *
 * 순수 함수만 모아둔다(DB·네트워크 접근 없음) — 서버 컴포넌트(`page.tsx`)·API
 * 라우트(`api/admin/today/preview`)·클라이언트 컴포넌트(`TodayDateNav.tsx`) 셋 모두에서
 * 그대로 import해 쓴다. KST(Asia/Seoul)는 서머타임이 없어 UTC 연산만으로 항상 정확하다
 * (`lib/notifications/kst.ts`와 동일 근거).
 */
import { KST_OFFSET_MS } from '@/lib/notifications/kst'

const DATE_STR_RE = /^\d{4}-\d{2}-\d{2}$/

/** KST 기준 오늘 날짜를 'YYYY-MM-DD'로 반환 */
export function todayKstDateString(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(kst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** URL 쿼리로 들어온 date 값을 검증한다. 형식이 잘못됐거나 없으면 오늘 날짜로 대체한다. */
export function normalizeDateParam(raw: string | undefined, now: Date = new Date()): string {
  if (raw && DATE_STR_RE.test(raw) && !Number.isNaN(new Date(`${raw}T00:00:00Z`).getTime())) {
    return raw
  }
  return todayKstDateString(now)
}

/** 'YYYY-MM-DD'(KST 달력 날짜) 기준 그 하루의 시작·끝 순간을 UTC ISO 문자열로 반환한다. */
export function kstDayBoundsIso(dateStr: string): { startIso: string; endIso: string } {
  const [y, m, d] = dateStr.split('-').map(Number)
  const startUtcMs = Date.UTC(y, m - 1, d) - KST_OFFSET_MS
  const endUtcMs = startUtcMs + 24 * 3600_000 - 1
  return { startIso: new Date(startUtcMs).toISOString(), endIso: new Date(endUtcMs).toISOString() }
}

/** 'YYYY-MM-DD'에 days만큼 더한 날짜 문자열(음수 가능) */
export function shiftDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

/** 'YYYY-MM-DD' → "2026년 9월 2일 (화)" 표시용 라벨 */
export function formatKstDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12)) // 정오로 잡아 자정 경계 근처 부동소수 이슈 회피
  return `${y}년 ${m}월 ${d}일 (${WEEKDAY_LABELS[dt.getUTCDay()]})`
}
