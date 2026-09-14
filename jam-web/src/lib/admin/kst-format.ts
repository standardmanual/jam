/**
 * 어드민 투데이 화면 전용 날짜·시각 포맷 유틸 (티켓 20260911_1636)
 *
 * `TodayCardDetail.tsx`·`TodayCardForm.tsx`가 `new Date(iso).getFullYear()` 등
 * 로컬 벽시계 게터로 날짜·시각 문자열을 직접 조립하고 있었다 — `timeZone`을 명시하지
 * 않아 실행 환경의 시스템 타임존을 그대로 썼다. Vercel 서버 함수는 UTC, 브라우저는
 * KST로 도는데 이 컴포넌트들은 `'use client'`라 서버 렌더와 클라이언트 하이드레이션
 * 양쪽에서 호출되므로 두 결과 문자열이 달라져 하이드레이션 불일치가 날 수 있었다
 * (`LocalDate.tsx` 주석·티켓 20260830_2120과 동일한 원인).
 *
 * `toLocaleString`의 `timeZone` 옵션으로는 `getFullYear()` 같은 개별 게터를 대체할 수
 * 없어(그 옵션은 완성된 문자열에만 적용된다), `today-calendar.ts`와 동일하게
 * `KST_OFFSET_MS`를 더한 뒤 UTC 필드를 읽는 방식을 쓴다 — KST는 서머타임이 없어
 * 이 연산이 항상 정확하다.
 */
import { KST_OFFSET_MS } from '@/lib/notifications/kst'

interface KstParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function kstPartsOf(iso: string): KstParts {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS)
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
  }
}

/** "YYYY.MM.DD HH:mm" 형식으로 날짜·시각 포맷(KST 고정) */
export function formatKstYmdHm(iso: string): string {
  const p = kstPartsOf(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}.${pad(p.month)}.${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`
}

/** ISO(UTC) 문자열을 datetime-local input이 요구하는 "YYYY-MM-DDTHH:mm"(KST 고정)으로 변환 */
export function toKstLocalInputValue(iso: string): string {
  const p = kstPartsOf(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/** "YYYY.MM.DD" 형식으로 날짜 포맷(KST 고정) — 어드민 배지 화면(`BadgesTable.tsx`·
 *  `BadgeCard.tsx`·`BadgeDetail.tsx`)의 동일한 로컬 게터 조립 패턴을 대체한다. */
export function formatKstYmd(iso: string): string {
  const p = kstPartsOf(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}.${pad(p.month)}.${pad(p.day)}`
}
