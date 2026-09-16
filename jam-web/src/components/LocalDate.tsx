'use client'

/** `korean` prop으로 지정하는 표시 옵션 — UX_WRITING_GUIDELINE.md §3 날짜/시간 표기 규칙 참조. */
export interface KoreanDateTimeOptions {
  /** 요일 포함 여부 (기본 false — 좁은 카드·리스트에서는 생략) */
  weekday?: boolean
  /** 연도 포함 여부 (기본 false — 최근 데이터만 다루는 화면에서는 생략) */
  year?: boolean
  /** 시:분을 '오후 3시 30분' 형태로 함께 표시할지 여부 (기본 false — 날짜만 표시) */
  time?: boolean
}

interface LocalDateProps {
  iso: string | null | undefined
  /**
   * Intl.DateTimeFormatOptions를 그대로 전달하는 저수준 경로.
   * '오후 03:30'처럼 hour/minute을 콜론으로 표시하는 형태가 필요할 때만 쓴다.
   * `korean`과 동시에 넘기면 `korean`이 우선한다.
   */
  options?: Intl.DateTimeFormatOptions
  /**
   * UX_WRITING_GUIDELINE.md §3 형식('7월 31일 금요일 오후 3시 30분')으로 표시하는 경로.
   * Intl 표준 hour12 옵션은 '오후 03:30' 형태만 지원해 이 형식을 표현할 수 없어 별도로 조립한다.
   */
  korean?: KoreanDateTimeOptions
  suffix?: string
  fallback?: string
}

/**
 * 시:분을 '오후 3시 30분' 형태로 조립한다.
 *
 * Intl의 hour12 포맷은 '오후 3:30'(콜론 구분)만 만들어 줄 뿐 '시'/'분' 접미사를 붙여주지
 * 않는다 — formatToParts로 dayPeriod/hour/minute 조각을 얻어 직접 조합한다.
 */
function formatKoreanTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }).formatToParts(date)
  const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value ?? ''
  const hour = parts.find((p) => p.type === 'hour')?.value ?? ''
  const minute = parts.find((p) => p.type === 'minute')?.value ?? ''
  return `${dayPeriod} ${hour}시 ${minute}분`
}

/**
 * ISO 문자열을 UX_WRITING_GUIDELINE.md §3 형식으로 변환한다 (KST 고정, 문자열 반환).
 * JSX가 아닌 문자열이 필요한 자리(props로 넘기는 값 등)에서 `<LocalDate korean={...} />`
 * 대신 직접 호출한다.
 */
export function formatKoreanDateTime(iso: string | null | undefined, korean: KoreanDateTimeOptions = {}): string {
  if (!iso) return ''
  const date = new Date(iso)
  const dateOptions: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' }
  if (korean.year) dateOptions.year = 'numeric'
  if (korean.weekday) dateOptions.weekday = 'long'
  const datePart = date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', ...dateOptions })
  if (!korean.time) return datePart
  return `${datePart} ${formatKoreanTime(date)}`
}

/**
 * 날짜/시각을 KST 고정으로 표시한다 (티켓 20260830_2120 — React error #418 수정).
 *
 * 이전에는 `timeZone`을 지정하지 않아 `toLocaleString`이 실행 환경의 시스템 타임존을
 * 그대로 썼다. Vercel 서버 함수는 UTC, 브라우저는 KST로 도는데, 이 컴포넌트는 서버
 * 렌더와 클라이언트 하이드레이션 양쪽에서 호출되므로 두 결과 문자열이 달라져
 * 하이드레이션 불일치(React error #418)가 났다. 특히 UTC 15:00~23:59(=KST 00:00~08:59)
 * 사이에 찍힌 시각은 서버·클라이언트가 날짜 자체를 다르게 계산해 매번 재현됐다.
 *
 * `timeZone: 'Asia/Seoul'`을 명시하면 실행 환경의 시스템 타임존과 무관하게 항상 같은
 * 결과가 나온다 — 이 서비스는 전체가 KST 기준(`src/lib/notifications/kst.ts` 참조)이라
 * 최종 표시 문자열도 기존 클라이언트(KST 브라우저) 기준과 동일하게 유지된다.
 *
 * `korean` prop을 넘기면 §3 형식('7월 31일 금요일 오후 3시 30분')으로, 넘기지 않으면
 * 기존처럼 `options`를 그대로 `toLocaleString`에 전달한다.
 */
export default function LocalDate({ iso, options, korean, suffix = '', fallback = '' }: LocalDateProps) {
  if (!iso) return <>{fallback}</>
  if (korean) return <>{formatKoreanDateTime(iso, korean)}{suffix}</>
  return <>{new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', ...options })}{suffix}</>
}
