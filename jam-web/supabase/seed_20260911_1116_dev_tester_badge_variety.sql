-- seed_20260911_1116_dev_tester_badge_variety.sql
-- 스테이징 테스트 계정(dev-tester)에 레벨형·반복획득형(COUNT) 배지를 추가 시드
--   — 티켓 20260911_1116
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 전제: `seed_dev_test_user.sql`이 먼저 적용되어 있어야 한다
--   (auth.users / public.users / public.inventory 행이 이미 존재해야 함).
--   이 파일은 그 위에 activity·item 배지를 각 1~2종 추가로 보장하고,
--   레벨형(LEVEL) 1종·반복획득형(COUNT≥2) 1종을 신규로 채운다.
--
-- 배경: 티켓 20260911_1102 게이트 리뷰 중 발견됨 — dev-tester 계정에 획득 배지가 0건이라
--   배지 상세·공유 카드 실렌더 검증(특히 LEVEL·COUNT 행)을 매번 다른 계정으로 대체해야 했다.
--
-- 고정값
--   user_id: 00000000-0000-0000-0000-000000000001 (dev-tester@jam.local)
--
-- 모든 INSERT는 idempotent(ON CONFLICT DO NOTHING 또는 존재 시 스킵).
-- 실제 배지 ID는 서브쿼리로 조회 — 시드 실행 시점의 DB 상태에 의존.
-- 조회 결과가 없으면 해당 블록만 건너뜀.
--
-- ── 실행 전 확인 (참고용, 필수 아님) ─────────────────────────────────────
--   SELECT COUNT(*) FROM public.user_activity_badges
--    WHERE user_id = '00000000-0000-0000-0000-000000000001';
--   SELECT COUNT(*) FROM public.inventory_items ii
--    JOIN public.inventory inv ON inv.id = ii.inventory_id
--    WHERE inv.user_id = '00000000-0000-0000-0000-000000000001';
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 0. 전제 확인 — public.users 행이 없으면 전체를 건너뛴다.
--    (seed_dev_test_user.sql 미적용 상태에서 이 파일만 실행되는 사고 방지)
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = '00000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'dev-tester(00000000-0000-0000-0000-000000000001) 유저가 없습니다. seed_dev_test_user.sql을 먼저 적용하세요.';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 1. 활동(activity) 배지 기본 확보 — 등급형 중 미보유 2종
--    (seed_dev_test_user.sql이 이미 3종을 넣었다면 대부분 스킵되고,
--     혹시 그 시드가 아직 적용되지 않았거나 대상 배지가 삭제됐다면 여기서 보강)
-- ────────────────────────────────────────────────────────────
INSERT INTO public.user_activity_badges (user_id, badge_id, earned_at, triggered_by)
SELECT
  '00000000-0000-0000-0000-000000000001',
  b.id,
  NOW() - (row_number() OVER (ORDER BY b.created_at) * INTERVAL '1 day'),
  'seed_dev_variety'
FROM (
  SELECT id, created_at
  FROM public.badges
  WHERE type = 'activity'
    AND deleted_at IS NULL
    AND rarity IS NOT NULL              -- 등급형(레벨형·반복형 제외)
    AND NOT (condition_json ? 'repeat_count')
    AND id NOT IN (
      SELECT badge_id FROM public.user_activity_badges
      WHERE user_id = '00000000-0000-0000-0000-000000000001'
    )
  ORDER BY created_at
  LIMIT 2
) b
ON CONFLICT (user_id, badge_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 2. 레벨형(LEVEL) 배지 1종 — badges.level이 채워진 무한레벨형
--    (rarity IS NULL이 레벨형 판정 기준 — BADGE_ENGINE_UNIFIED.md §2)
--    같은 이름 계열에서 level이 가장 낮은 1개(가장 보편적으로 존재)를 선택.
-- ────────────────────────────────────────────────────────────
INSERT INTO public.user_activity_badges (user_id, badge_id, earned_at, triggered_by)
SELECT
  '00000000-0000-0000-0000-000000000001',
  b.id,
  NOW() - INTERVAL '5 days',
  'seed_dev_variety'
FROM (
  SELECT id
  FROM public.badges
  WHERE type = 'activity'
    AND deleted_at IS NULL
    AND rarity IS NULL
    AND level IS NOT NULL
    AND id NOT IN (
      SELECT badge_id FROM public.user_activity_badges
      WHERE user_id = '00000000-0000-0000-0000-000000000001'
    )
  ORDER BY level ASC, created_at
  LIMIT 1
) b
ON CONFLICT (user_id, badge_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 3. 반복획득형(COUNT) 배지 1종 — condition_json.repeat_count가 있는 등급형
--    earn_count=3, earn_history에 가상 근거 3건을 채워 COUNT 행(×3) 렌더를 검증 가능하게 한다.
-- ────────────────────────────────────────────────────────────
INSERT INTO public.user_activity_badges (
  user_id, badge_id, earned_at, triggered_by, earn_count, earn_history
)
SELECT
  '00000000-0000-0000-0000-000000000001',
  b.id,
  NOW() - INTERVAL '7 days',
  'seed_dev_variety',
  3,
  jsonb_build_array(
    jsonb_build_object('strava_id', 9999990001, 'earned_at', (NOW() - INTERVAL '7 days')::text),
    jsonb_build_object('strava_id', 9999990002, 'earned_at', (NOW() - INTERVAL '4 days')::text),
    jsonb_build_object('strava_id', 9999990003, 'earned_at', (NOW() - INTERVAL '1 days')::text)
  )
FROM (
  SELECT id
  FROM public.badges
  WHERE type = 'activity'
    AND deleted_at IS NULL
    AND rarity IS NOT NULL
    AND condition_json ? 'repeat_count'
    AND id NOT IN (
      SELECT badge_id FROM public.user_activity_badges
      WHERE user_id = '00000000-0000-0000-0000-000000000001'
    )
  ORDER BY created_at
  LIMIT 1
) b
ON CONFLICT (user_id, badge_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 4. 아이템(item) 배지 기본 확보 — 미보유 2종
--    (인벤토리는 seed_dev_test_user.sql에서 이미 생성되어 있어야 함)
-- ────────────────────────────────────────────────────────────
INSERT INTO public.inventory_items (inventory_id, badge_id, obtained_at, obtained_by, expires_at)
SELECT
  inv.id,
  b.id,
  NOW() - (row_number() OVER (ORDER BY b.created_at) * INTERVAL '2 days'),
  'seed_dev_variety',
  NOW() + INTERVAL '30 days'
FROM (
  SELECT id
  FROM public.inventory
  WHERE user_id = '00000000-0000-0000-0000-000000000001'
) inv
CROSS JOIN (
  SELECT id, created_at
  FROM public.badges
  WHERE type = 'item'
    AND deleted_at IS NULL
    AND id NOT IN (
      SELECT ii.badge_id
      FROM public.inventory_items ii
      JOIN public.inventory i2 ON i2.id = ii.inventory_id
      WHERE i2.user_id = '00000000-0000-0000-0000-000000000001'
    )
  ORDER BY created_at
  LIMIT 2
) b
ON CONFLICT DO NOTHING;

-- 인벤토리 used_slots 동기화
UPDATE public.inventory
SET used_slots = (
  SELECT COUNT(*) FROM public.inventory_items
  WHERE inventory_id = (
    SELECT id FROM public.inventory
    WHERE user_id = '00000000-0000-0000-0000-000000000001'
  )
)
WHERE user_id = '00000000-0000-0000-0000-000000000001';

COMMIT;

-- ============================================================
-- 실행 확인 쿼리 (실행 후 아래를 별도로 돌려볼 것)
-- ============================================================
-- SELECT b.name, b.rarity, b.level, uab.earn_count
--   FROM public.user_activity_badges uab
--   JOIN public.badges b ON b.id = uab.badge_id
--  WHERE uab.user_id = '00000000-0000-0000-0000-000000000001'
--  ORDER BY uab.earned_at;
-- → level이 있는 행 1개(레벨형), earn_count >= 2인 행 1개(반복형)가 보여야 정상.
--
-- SELECT COUNT(*) FROM public.inventory_items ii
--   JOIN public.inventory i ON i.id = ii.inventory_id
--  WHERE i.user_id = '00000000-0000-0000-0000-000000000001';
-- → 기존 seed_dev_test_user.sql 3건 + 이 파일 2건 = 최대 5건 (중복 조건 시 더 적을 수 있음)

-- ↩️ 롤백 — 이 시드가 넣은 행만 지운다
-- DELETE FROM public.user_activity_badges
--  WHERE user_id = '00000000-0000-0000-0000-000000000001' AND triggered_by = 'seed_dev_variety';
-- DELETE FROM public.inventory_items
--  WHERE obtained_by = 'seed_dev_variety'
--    AND inventory_id = (SELECT id FROM public.inventory WHERE user_id = '00000000-0000-0000-0000-000000000001');
-- UPDATE public.inventory SET used_slots = (
--   SELECT COUNT(*) FROM public.inventory_items WHERE inventory_id = inventory.id
-- ) WHERE user_id = '00000000-0000-0000-0000-000000000001';
