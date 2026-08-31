-- ============================================================
-- Migration 115: 배지 등급명 legend → epic, mythic → mystic 전면 변경
-- 티켓 20260831_1115
--
-- 서열은 그대로다 (common < rare < epic < mystic). ALTER TYPE ... RENAME VALUE는
-- pg_enum.enumsortorder를 보존하므로 정렬 순서가 유지되고, 기존 행 UPDATE도 불필요하다.
-- 기존 이름('legend'·'mythic')이 재사용되지 않으므로 역방향 rename으로 롤백 가능하다.
--
-- 실행 순서: seed_rarity_rename_backup_20260831.sql → 이 파일 →
--            seed_rarity_rename_data_20260831.sql
--
-- ── 컬럼명 정리 ──────────────────────────────────────────────────────────
-- 2026-08-13 티켓 20260813_003(legendary → legend)이 enum만 rename하고 컬럼을 놓쳐
-- 테이블마다 이름이 갈라져 있다. 이번에 전부 epic/mystic으로 통일한다.
--
--   drop_policy         : rarity_legendary     / rarity_mythic       (구 이름 잔존)
--   ambient_drop_config : rarity_legend        / rarity_mythic       (104에서 legend로 개명)
--   abusing_policy      : soft|hard_legendary_rate / soft|hard_mythic_rate (구 이름 잔존)
--
-- abusing_policy는 티켓 본문에 없던 추가 발견분이다. shadow-ban.ts가
-- `${banLevel}_${rarity}_rate` 로 컬럼명을 런타임 조합하므로, enum 값이 바뀌면
-- 컬럼명도 반드시 같이 바뀌어야 조회가 성립한다(안 바꾸면 undefined → 항상 드랍 허용).
--
-- 어느 이름으로 남아 있든 안전하게 처리하도록 컬럼 존재 여부를 확인하고 rename 한다.
-- ============================================================

BEGIN;

-- ── 1. enum 값 rename ───────────────────────────────────────────────────
ALTER TYPE public.badge_rarity RENAME VALUE 'legend' TO 'epic';
ALTER TYPE public.badge_rarity RENAME VALUE 'mythic' TO 'mystic';

-- ── 2. drop_policy 컬럼 rename ──────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='drop_policy' AND column_name='rarity_legendary') THEN
    ALTER TABLE public.drop_policy RENAME COLUMN rarity_legendary TO rarity_epic;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='drop_policy' AND column_name='rarity_legend') THEN
    ALTER TABLE public.drop_policy RENAME COLUMN rarity_legend TO rarity_epic;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='drop_policy' AND column_name='rarity_mythic') THEN
    ALTER TABLE public.drop_policy RENAME COLUMN rarity_mythic TO rarity_mystic;
  END IF;
END $$;

-- ── 3. ambient_drop_config 컬럼 rename ──────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='ambient_drop_config' AND column_name='rarity_legend') THEN
    ALTER TABLE public.ambient_drop_config RENAME COLUMN rarity_legend TO rarity_epic;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='ambient_drop_config' AND column_name='rarity_legendary') THEN
    ALTER TABLE public.ambient_drop_config RENAME COLUMN rarity_legendary TO rarity_epic;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='ambient_drop_config' AND column_name='rarity_mythic') THEN
    ALTER TABLE public.ambient_drop_config RENAME COLUMN rarity_mythic TO rarity_mystic;
  END IF;
END $$;

-- ── 4. abusing_policy 컬럼 rename (티켓 본문 외 추가 발견분) ────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='abusing_policy' AND column_name='soft_legendary_rate') THEN
    ALTER TABLE public.abusing_policy RENAME COLUMN soft_legendary_rate TO soft_epic_rate;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='abusing_policy' AND column_name='soft_legend_rate') THEN
    ALTER TABLE public.abusing_policy RENAME COLUMN soft_legend_rate TO soft_epic_rate;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='abusing_policy' AND column_name='hard_legendary_rate') THEN
    ALTER TABLE public.abusing_policy RENAME COLUMN hard_legendary_rate TO hard_epic_rate;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='abusing_policy' AND column_name='hard_legend_rate') THEN
    ALTER TABLE public.abusing_policy RENAME COLUMN hard_legend_rate TO hard_epic_rate;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='abusing_policy' AND column_name='soft_mythic_rate') THEN
    ALTER TABLE public.abusing_policy RENAME COLUMN soft_mythic_rate TO soft_mystic_rate;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='abusing_policy' AND column_name='hard_mythic_rate') THEN
    ALTER TABLE public.abusing_policy RENAME COLUMN hard_mythic_rate TO hard_mystic_rate;
  END IF;
END $$;

COMMIT;

-- ── 검증 쿼리 ───────────────────────────────────────────────────────────
-- 1) enum 값과 서열
-- SELECT enumlabel, enumsortorder FROM pg_enum
--  WHERE enumtypid = 'public.badge_rarity'::regtype ORDER BY enumsortorder;
--    → common(1) / rare(2) / epic(3) / mystic(4)
--
-- 2) 컬럼명
-- SELECT table_name, column_name FROM information_schema.columns
--  WHERE table_schema='public'
--    AND table_name IN ('drop_policy','ambient_drop_config','abusing_policy')
--    AND column_name ~ '(rarity_|_rate)'
--  ORDER BY table_name, column_name;
--    → legend/legendary/mythic 이 하나도 남아 있지 않아야 한다
--
-- 3) 배지 등급 분포 (백업과 대조)
-- SELECT rarity, count(*) FROM public.badges GROUP BY rarity ORDER BY rarity;

-- ── 롤백 ────────────────────────────────────────────────────────────────
-- BEGIN;
-- ALTER TYPE public.badge_rarity RENAME VALUE 'epic' TO 'legend';
-- ALTER TYPE public.badge_rarity RENAME VALUE 'mystic' TO 'mythic';
-- ALTER TABLE public.drop_policy         RENAME COLUMN rarity_epic   TO rarity_legendary;
-- ALTER TABLE public.drop_policy         RENAME COLUMN rarity_mystic TO rarity_mythic;
-- ALTER TABLE public.ambient_drop_config RENAME COLUMN rarity_epic   TO rarity_legend;
-- ALTER TABLE public.ambient_drop_config RENAME COLUMN rarity_mystic TO rarity_mythic;
-- ALTER TABLE public.abusing_policy      RENAME COLUMN soft_epic_rate   TO soft_legendary_rate;
-- ALTER TABLE public.abusing_policy      RENAME COLUMN hard_epic_rate   TO hard_legendary_rate;
-- ALTER TABLE public.abusing_policy      RENAME COLUMN soft_mystic_rate TO soft_mythic_rate;
-- ALTER TABLE public.abusing_policy      RENAME COLUMN hard_mystic_rate TO hard_mythic_rate;
-- COMMIT;
