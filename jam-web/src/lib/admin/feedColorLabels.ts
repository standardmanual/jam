/**
 * 홈피드 색 키의 운영자용 이름 (티켓 20261122_2224 회차 9).
 *
 * 어드민 카드 폼(`app/admin/today/FeedCardSection.tsx`)이 쓰던 이름 표를 순수 파일로 옮겼다 — 서버 검증 경고(`lib/admin/feedCardFields.ts`)도 키 이름 대신
 * 같은 색 이름을 문구에 써야 하는데, `'use client'` 컴포넌트 파일에서 값을 가져오면 서버 모듈이 클라이언트 참조를 받는다.
 * `FeedCardSection.tsx`는 이 파일을 다시 내보내므로 기존 가져오기 경로는 그대로다.
 */
import type { FeedColorKey } from '@/lib/today/feedConstants'

/** 색 이름(PRD «색» 표). 키는 `FEED_COLOR_KEYS`와 같다. 스크린리더는 이 이름으로 읽는다. */
export const FEED_COLOR_LABELS: Readonly<Record<FeedColorKey, string>> = {
  red: '레드',
  yellow: '옐로',
  green: '그린',
  purple: '퍼플',
  blue: '블루',
  'red-soft': '연한 레드',
  'yellow-soft': '연한 옐로',
  'green-soft': '연한 그린',
  'purple-soft': '연한 퍼플',
  'blue-soft': '연한 블루',
  'ref-red': '참조 레드',
  'ref-blue': '참조 블루',
  'ref-lime': '참조 라임',
  'ref-pink': '참조 핑크',
  'ref-yellow': '참조 옐로',
  'green-deep': '짙은 그린',
  pink: '핑크',
  sky: '스카이',
  white: '화이트',
}
