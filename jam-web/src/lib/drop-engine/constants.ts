/**
 * 드랍엔진 v2 — 세계관 고정 상수 (019_seed_worldview.sql 고정 UUID)
 * 이름이 아닌 id로 식별한다 (이름 변경에 취약하지 않게).
 */

/** 미스터리 헌터 — legend+ 전용 전역 스파이스 */
export const MYSTERY_FACTION_ID = '24d7af8e-a4ef-8798-a7f1-f1f2d6c9d582'

/** 작심삼일 클럽 — 신규 유저 온보딩 + 복귀 서사 */
export const RESOLUTION_FACTION_ID = 'e9e608d7-812c-4139-88c4-81d129076e3f'

/** 신규 유저 온보딩(첫 3드랍): 주 활동종목 → 세계관 매핑 */
export const ONBOARDING_FACTION_BY_ACTIVITY: Record<string, string> = {
  walking: '73f0f601-2382-900c-8ca2-5cc7c93ed95d', // 숲속의 갱단
  running: 'e33307bb-5191-5ad5-58e0-053b40cb09f0', // 비트 마에스트로
  cycling: '1d75e1ea-ad3c-b2e8-a8a3-0a062fc3e41d', // 장비병 환자들
  hiking: '7a91727e-e2e1-b7f7-45f0-899ce04716bd', // 아스팔트 레인저
  trail_running: '7a91727e-e2e1-b7f7-45f0-899ce04716bd',
}

export const ONBOARDING_DROP_COUNT = 3

/**
 * activity_type별 드랍 기여 가중치 (BADGE_ENGINE_UNIFIED.md §3.1).
 * "확정 1개 드랍"에는 영향 없음 — 보너스 드랍 확률과 rare+ pity(common_streak)
 * 진행 기여도에만 곱해진다. 걷기는 MET(운동강도)가 낮아 0.4로 낮춰 적용.
 * 축1 게이트(진짜 걷기 판정)를 통과한 걷기 활동에만 적용되고, 다른 종목은 1.0(영향 없음).
 */
export const ACTIVITY_TYPE_DROP_WEIGHT: Record<string, number> = {
  walking: 0.4,
}
export const DEFAULT_ACTIVITY_DROP_WEIGHT = 1.0
