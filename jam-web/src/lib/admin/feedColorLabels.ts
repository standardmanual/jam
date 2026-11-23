/**
 * 홈피드 색 키의 운영자용 이름 (티켓 20261122_2224 회차 9).
 *
 * 어드민 카드 폼(`app/admin/today/FeedCardSection.tsx`)이 쓰던 이름 표를 순수 파일로 옮겼다 — 서버 검증 경고(`lib/admin/feedCardFields.ts`)도 키 이름 대신
 * 같은 색 이름을 문구에 써야 하는데, `'use client'` 컴포넌트 파일에서 값을 가져오면 서버 모듈이 클라이언트 참조를 받는다.
 * `FeedCardSection.tsx`는 이 파일을 다시 내보내므로 기존 가져오기 경로는 그대로다.
 */
import { FEED_COLOR_USAGE, type FeedColorKey } from '@/lib/today/feedConstants'

/** 색 이름(PRD «색» 표). 키는 `FEED_COLOR_KEYS`와 같다. 스크린리더는 이 이름으로 읽는다. */
export const FEED_COLOR_LABELS: Readonly<Record<FeedColorKey, string>> = {
  red: '레드',
  yellow: '옐로',
  green: '그린',
  purple: '퍼플',
  blue: '블루',
  'green-deep': '짙은 그린',
  pink: '핑크',
  sky: '스카이',
  white: '화이트',
}

/** 카드 폼에서 색을 고르는 자리: 배경색·칩 색·박스 색. */
export type FeedColorRole = 'bg' | 'chip' | 'box'

/** 자리 → 쓰임 표(`FEED_COLOR_USAGE`)의 칸. 배경색은 바탕, 칩 색은 값 칩, 박스 색은 박스 칸을 읽는다. */
const ROLE_USAGE_KEY = { bg: 'bg', chip: 'valueChip', box: 'box' } as const satisfies Record<FeedColorRole, keyof typeof FEED_COLOR_USAGE>

export interface FeedColorChoice {
  value: FeedColorKey
  label: string
  colorKey: FeedColorKey
}

/** 이 자리에서 고를 수 있는 색 — 쓰임 표에 든 색만, 표의 순서 그대로다. 비워 두면 «자동»이라 여기에는 없다. */
export function feedColorChoices(role: FeedColorRole): FeedColorChoice[] {
  return FEED_COLOR_USAGE[ROLE_USAGE_KEY[role]].map((key) => ({ value: key, label: FEED_COLOR_LABELS[key], colorKey: key }))
}

/**
 * 저장된 값이 이 자리의 쓰임 표 밖의 색(예: 칩에 짙은 초록)이면 그 값을 «현재 값»으로 보이는 선택지를 돌려준다. 아니면 undefined.
 * 선택지 목록에는 넣지 않는다 — 다른 값으로 바꾸면 이 색은 다시 고를 수 없다.
 */
export function currentColorChoice(role: FeedColorRole, value: string | null | undefined): FeedColorChoice | undefined {
  if (!value || !Object.hasOwn(FEED_COLOR_LABELS, value)) return undefined
  const key = value as FeedColorKey
  if ((FEED_COLOR_USAGE[ROLE_USAGE_KEY[role]] as readonly string[]).includes(key)) return undefined
  return { value: key, label: `${FEED_COLOR_LABELS[key]} (현재 값)`, colorKey: key }
}
