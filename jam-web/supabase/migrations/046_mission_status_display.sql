-- Phase 13: 미션 상황(랭킹/달성) 표시 방식 + 복수 배지 보상
-- - status_display_type: 관리자가 미션 등록 시 랭킹형/달성형 선택 (기본 ranking)
-- - visible_rank_count: 상위 N명만 목록 노출 (NULL = 전체 공개, 본인은 항상 별도 표시)
-- - reward_badge_ids: 복수 배지 보상 (활동배지/아이템배지 무관, badges.id 배열)

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS status_display_type TEXT NOT NULL DEFAULT 'ranking'
    CHECK (status_display_type IN ('ranking', 'achievement')),
  ADD COLUMN IF NOT EXISTS visible_rank_count INTEGER,
  ADD COLUMN IF NOT EXISTS reward_badge_ids UUID[] NOT NULL DEFAULT '{}';

-- 기존 단일 배지 보상(reward_type IN ('badge','item_badge') AND reward_id IS NOT NULL)을 배열로 이관
UPDATE public.missions
SET reward_badge_ids = ARRAY[reward_id]::UUID[]
WHERE reward_type IN ('badge', 'item_badge')
  AND reward_id IS NOT NULL
  AND (reward_badge_ids IS NULL OR reward_badge_ids = '{}');

-- reward_type/reward_id는 배지+포인트 동시 구성으로 대체 — 더 이상 필수 아님(legacy 보존)
ALTER TABLE public.missions ALTER COLUMN reward_type DROP NOT NULL;
