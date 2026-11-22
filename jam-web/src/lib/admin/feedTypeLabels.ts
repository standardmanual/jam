/**
 * 카드 유형의 운영자용 이름 (티켓 20261122_1239, 상위 20261122_1100 8회차-3).
 *
 * 어드민 카드 폼·목록·상세(`app/admin/today/FeedCardSection.tsx`)가 쓰던 이름 표를 순수 파일로 옮겼다 — 운영툴의 신호 문구·
 * 패턴 폼·홈 미리보기도 같은 이름을 써야 하는데, `'use client'` 컴포넌트 파일에서 값을 가져오면 서버 모듈이 클라이언트 참조를 받는다.
 * `FeedCardSection.tsx`는 이 파일을 다시 내보내므로 기존 가져오기 경로는 그대로다.
 */
import type { FeedType } from '@/lib/today/feedChipSlots'

/** 유형 이름(PRD «카드 유형 8가지» 표). 키는 `FEED_TYPES`와 같다. */
export const FEED_TYPE_LABELS: Readonly<Record<FeedType, string>> = {
  hero_box: '히어로',
  full_image: '전체 배경 이미지',
  badge_intro: '배지 소개',
  badge_only: '배지만',
  collection_intro: '컬렉션 소개',
  drop_pickup: '드랍·픽업',
  text_box: '텍스트',
  gallery_list: '목록형',
}

/** 유형이 비어 있는 옛 데이터를 홈이 그리는 유형 — 목록·상세에서도 같은 이름으로 보인다(티켓 20261122_1153). */
export const FEED_TYPE_FALLBACK_TEXT = '텍스트 박스(기본)'

/** 카드 유형을 운영자에게 보이는 이름으로. 비어 있으면 «텍스트 박스(기본)», 모르는 유형 값은 키를 그대로 보인다. */
export function feedTypeDisplayName(feedType: string | null | undefined): string {
  if (!feedType) return FEED_TYPE_FALLBACK_TEXT
  return (FEED_TYPE_LABELS as Readonly<Record<string, string>>)[feedType] ?? feedType
}
