/**
 * 액티비티 배지 이미지 생성기 — 블롭 배경 색상 프리셋 (티켓 20260902_1751)
 *
 * 액티비티 5종 × 배지 등급 4단계 조합별로 어울리는 블롭 배경 4색 팔레트를 담는다.
 * 활동별 색 계열(걷기=샌드/살구, 러닝=코랄/오렌지, 사이클링=블루, 등산=슬레이트-바이올렛,
 * 트레일러닝=그린)을 고정하고, 그 안에서 포인트 색이 등급칩(`--color-rarity-*`)의 어조를 빌려
 * common(회색톤)→rare(그린)→epic(골드)→mystic(핑크)로 이동하도록 설계했다.
 *
 * 값 순서는 `BlobAnimationFields.tsx`의 색상 슬롯 1~4(베이스·포인트·라이트·딥)와 동일하다.
 * `Record<ActivityType, Record<BadgeRarity, ...>>`로 둬서 키 오타가 컴파일 타임에 잡힌다.
 */
import type { ActivityType, BadgeRarity } from '@/types/database'

export type BlobColorPreset = [string, string, string, string]

const BADGE_BLOB_PRESETS: Record<ActivityType, Record<BadgeRarity, BlobColorPreset>> = {
  walking: {
    common: ['#C9A98A', '#B0A79A', '#F1E4D3', '#8A6A48'],
    rare: ['#E0A96C', '#6FBF8E', '#F8E0BD', '#A66B31'],
    epic: ['#E6A85A', '#F5C863', '#FBE4BC', '#B87A2A'],
    mystic: ['#E88F6B', '#F2599E', '#F9CFC0', '#A6446B'],
  },
  running: {
    common: ['#C97A55', '#A69488', '#F0DCC9', '#7A4429'],
    rare: ['#F0793A', '#3FCB8E', '#FBD8B9', '#B8431A'],
    epic: ['#F5762C', '#FFC24B', '#FFE1B3', '#C23D0F'],
    mystic: ['#FF5C3D', '#FF3D8F', '#FFC7B0', '#9E1C3E'],
  },
  cycling: {
    common: ['#6E8CA0', '#9B9B93', '#DCE4E8', '#3E5566'],
    rare: ['#3E90C7', '#35C79A', '#C9E8F5', '#1F4E73'],
    epic: ['#2F7FC2', '#F2A93C', '#BFE0F7', '#163F63'],
    mystic: ['#1F6FE0', '#FF4FA3', '#A9D4FF', '#0B2E63'],
  },
  hiking: {
    common: ['#7C8AA0', '#9C9C9C', '#E1E5EC', '#454F63'],
    rare: ['#5F7CA8', '#4FBF8A', '#D3DEEF', '#2E4566'],
    epic: ['#5A6FA3', '#E0A752', '#D6DCEE', '#333C63'],
    mystic: ['#6A5FC7', '#F05FB0', '#CBC3EF', '#302259'],
  },
  trail_running: {
    common: ['#7A9169', '#A38F73', '#DCE6D1', '#46583A'],
    rare: ['#4F9E5C', '#2FBF8F', '#CDE9CE', '#245C34'],
    epic: ['#4C8F4E', '#D99A3C', '#D8E7C4', '#2E5A28'],
    mystic: ['#2E9E5B', '#E85CA8', '#B6E3C0', '#12432A'],
  },
}

/** 활동 종목·등급 조합에 대응하는 블롭 4색 프리셋을 돌려준다. */
export function getBadgeBlobPreset(activityType: ActivityType, rarity: BadgeRarity): BlobColorPreset {
  return BADGE_BLOB_PRESETS[activityType][rarity]
}

/**
 * 프리셋 표에 실제로 값이 있는 종목인가 (티켓 20260905_0032 C-1).
 *
 * `badges.activity_types`는 text[]라 타입이 보장되지 않는다 — `road_running` 같은 레거시
 * 필터 키가 남아 있으면 `getBadgeBlobPreset`이 `undefined[rarity]`로 깨진다. DB에서 읽은
 * 값으로 프리셋을 고르기 전에 이 가드를 통과시킨다.
 */
export function hasBadgeBlobPreset(activityType: string): activityType is ActivityType {
  return activityType in BADGE_BLOB_PRESETS
}
