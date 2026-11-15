import type { RecipeWithSlots } from './CombineClient'

/** 믹스 화면 테스트용 레시피 — 슬롯 2칸·보상 배지 1개. 테스트에서 `{ ...TEST_RECIPE, id: ... }`로 덮어 쓴다. */
export const TEST_RECIPE: RecipeWithSlots = {
  id: 'test-recipe',
  name: '테스트 레시피',
  reward_points: 20,
  reward_badge_ids: ['test-reward-badge'],
  valid_from: null,
  valid_until: null,
  description: null,
  reward_locked: false,
  allow_no_reward: false,
  created_at: '2026-01-01T00:00:00.000Z',
  slots: [
    {
      id: 'test-slot-1',
      slot_order: 1,
      badge_type: 'item',
      candidates: [{ id: 'test-candidate-1', name: '테스트 재료 1', image_url: null }],
    },
    {
      id: 'test-slot-2',
      slot_order: 2,
      badge_type: 'item',
      candidates: [{ id: 'test-candidate-2', name: '테스트 재료 2', image_url: null }],
    },
  ],
  rewardBadges: [
    { id: 'test-reward-badge', name: '테스트 보상 배지', image_url: null, rarity: 'common', description: '' },
  ],
}
