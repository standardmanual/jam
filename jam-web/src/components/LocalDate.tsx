'use client'

interface LocalDateProps {
  iso: string | null | undefined
  options?: Intl.DateTimeFormatOptions
  suffix?: string
  fallback?: string
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
 */
export default function LocalDate({ iso, options, suffix = '', fallback = '' }: LocalDateProps) {
  if (!iso) return <>{fallback}</>
  return <>{new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', ...options })}{suffix}</>
}
