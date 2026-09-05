-- 135: 게이트 미션 — missions에 `gate_axis` · `gate_stage` · `visibility_rule_json` 추가
--      (티켓 20260905_0033, 마스터 20260905_0026 §게이트)
--
-- 배경:
--   v5는 「종목당 8개 × 5종목 = 미션 40개」가 Mystic·Lv.8+를 여는 열쇠가 된다. 그런데
--   `missions`에는 «어느 축을 여는지»를 담을 컬럼이 없고, 노출 규칙은 코드에 하드코딩돼
--   있다 — `visibility.ts`가 `gated_badge_id` → 그 배지의 등급 → 유저의 **같은 이름** 배지
--   최고 등급을 ±1로 비교한다. v5의 «해당 축 Epic 보유 AND Mystic 미보유»는 그 규칙으로
--   표현할 수 없다.
--
-- 왜 별도 `gate_missions` 테이블이 아닌가 (2026-09-05 사용자 확정, 티켓 판단 ①):
--   게이트 미션과 기간형 미션이 **참가·진행률·보상·알림 인프라를 전부 공유**한다. 다른 건
--   「여는 축·단계·노출 규칙」 셋뿐이다. 별도 테이블로 빼면 그 인프라를 이중화하거나 모든
--   조회에 조인을 걸어야 한다 — 컬럼 3개를 아끼려고 파이프라인을 복제하는 교환이다.
--   기간형 미션에는 세 컬럼이 전부 NULL이며, 아래 CHECK가 그것을 강제한다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 실행 순서: **코드 배포보다 먼저 실행해야 한다.**
--   `today/cards.ts`·미션 목록·상세·참가 API가 `missions`를 `select('*')`로 읽으므로 컬럼이
--   없어도 쿼리는 깨지지 않고 게이트 판정만 «축 없음»으로 떨어진다(레거시 경로 유지).
--   다만 어드민 게이트 미션 화면은 컬럼이 있어야 저장이 된다.
--   기존 데이터는 한 행도 바뀌지 않는다 — 세 컬럼 모두 NULL로 추가된다.
--
-- ⚠️ 130~134의 변경분을 되돌리지 않는다. 이 파일은 `badges` 테이블·`badges_condition_json_known_keys`
--    CHECK·`check_family_condition_consistency()` 트리거 함수·`increment_activity_badge_earn()`
--    RPC를 **한 줄도 건드리지 않는다.** 대상은 `public.missions` 하나뿐이다.
--    (134가 CHECK/트리거를 통째로 다시 쓴 것은 그 두 대상을 «마지막으로 다시 쓴 한 파일»로
--     모으기 위해서였다. 이 파일은 그 대상을 손대지 않으므로 다시 쓰지 않는다 —
--     `condition-registry.test.ts`가 읽는 「마지막 파일」은 134 그대로 남는다.)
--
-- 재실행 가능(idempotent): ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS 로 작성했다.

BEGIN;

-- ── ① 컬럼 3종 ──────────────────────────────────────────────────────────────

ALTER TABLE public.missions
  -- 이 미션이 «여는 축». 형태는 계열 키와 같은 `{종목}:{축슬러그}`다 —
  -- 「축은 같은 종목 안에서만 공유한다」(마스터 티켓)를 키 안에 담기 위함이고,
  -- 어드민이 종목별로 커버리지를 볼 수 있게 하기 위함이다.
  -- ⚠️ 축 «목록»은 DB에 두지 않는다. v5의 9축은 카탈로그(티켓 20260905_0035)가 정하며,
  --    ENUM으로 굳히면 카탈로그가 축을 하나 바꿀 때마다 마이그레이션이 필요해진다.
  ADD COLUMN IF NOT EXISTS gate_axis TEXT,
  -- 게이트 단계. 마스터 티켓의 2단 게이트 표를 그대로 옮긴 두 값이다.
  ADD COLUMN IF NOT EXISTS gate_stage TEXT,
  -- 노출 조건. 형태는 `src/types/database.ts`의 `MissionVisibilityRule`:
  --   { "require_owned":    { "family_keys": ["walking:...", ...], "min_rarity": "epic" },
  --     "hide_when_owned":  { "family_keys": ["walking:...", ...], "min_rarity": "mystic" },
  --     "unmet_visibility": "locked" }
  -- 안쪽 요구의 형태는 교차 게이트(`BadgeGateRequirement`, 마이그레이션 133)와 **같다** —
  -- 판정도 같은 `normalizeGateRequirement()`(crossGate.ts) 한 함수를 쓴다.
  ADD COLUMN IF NOT EXISTS visibility_rule_json JSONB;

COMMENT ON COLUMN public.missions.gate_axis IS
  '게이트 미션이 여는 축 (`{종목}:{축슬러그}`). NULL이면 기간형/일반 미션 (티켓 20260905_0033)';
COMMENT ON COLUMN public.missions.gate_stage IS
  '게이트 단계 — rare_to_epic | epic_to_mystic. gate_axis와 항상 짝이다';
COMMENT ON COLUMN public.missions.visibility_rule_json IS
  '노출 조건(MissionVisibilityRule). 게이트 미션에만 허용. 형태가 깨지면 앱이 fail-closed(locked)로 막는다';

-- ── ② 제약 ──────────────────────────────────────────────────────────────────

-- 단계 값 — 마스터 티켓의 2단 게이트 표 그대로.
ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_gate_stage_values;
ALTER TABLE public.missions
  ADD CONSTRAINT missions_gate_stage_values CHECK (
    gate_stage IS NULL OR gate_stage IN ('rare_to_epic', 'epic_to_mystic')
  );

-- 축과 단계는 **항상 짝**이다. 한쪽만 있으면 매트릭스에서 자리를 잡지 못한 채
-- 「게이트 미션인데 어느 칸에도 없는」 유령이 된다.
ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_gate_axis_stage_paired;
ALTER TABLE public.missions
  ADD CONSTRAINT missions_gate_axis_stage_paired CHECK ((gate_axis IS NULL) = (gate_stage IS NULL));

-- 축 키 형태 — `isValidFamilyKey()`(src/lib/admin/badge-families.ts)와 **같은 규칙**이다.
-- 막아야 하는 것은 «교차 게이트/노출 규칙에 적을 수 없게 되는 형태»뿐이라 관대하게 본다:
-- 앞뒤 공백 없음 · 비어 있지 않음 · 콜론 포함 · 쉼표 없음(목록 구분자) · `#` 시작 아님(폴백 접두어).
ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_gate_axis_format;
ALTER TABLE public.missions
  ADD CONSTRAINT missions_gate_axis_format CHECK (
    gate_axis IS NULL
    OR (
      gate_axis = btrim(gate_axis)
      AND gate_axis <> ''
      AND position(':' in gate_axis) > 0
      AND position(',' in gate_axis) = 0
      AND left(gate_axis, 1) <> '#'
    )
  );

-- 노출 규칙은 게이트 미션 전용이고, 허용 키는 3개뿐이다.
-- 배지 쪽 `badges_condition_json_known_keys`(133·134)와 같은 태도 — **키 이름만** 검사한다.
-- 값의 형태는 앱이 fail-closed로 막는다(`resolveMissionVisibility`).
ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_visibility_rule_shape;
ALTER TABLE public.missions
  ADD CONSTRAINT missions_visibility_rule_shape CHECK (
    visibility_rule_json IS NULL
    OR (
      gate_axis IS NOT NULL
      AND jsonb_typeof(visibility_rule_json) = 'object'
      AND (
        visibility_rule_json - ARRAY['require_owned', 'hide_when_owned', 'unmet_visibility']::text[]
      ) = '{}'::jsonb
    )
  );

-- 게이트 미션은 레거시 게이팅(`gated_badge_id`)을 함께 쓰지 않는다.
-- 두 경로가 한 행에 공존하면 「어느 규칙으로 판정되는가」가 데이터만 봐서는 알 수 없다 —
-- 앱(`visibility.ts`)은 축 경로를 우선하지만, 그 우선순위를 데이터가 만들 수 있게 두면
-- 어드민이 레거시 게이트를 지우지 않은 채 축을 붙이고 게이팅이 조용히 바뀐다.
ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_gate_axis_excludes_gated_badge;
ALTER TABLE public.missions
  ADD CONSTRAINT missions_gate_axis_excludes_gated_badge CHECK (
    gate_axis IS NULL OR gated_badge_id IS NULL
  );

-- ── ③ 인덱스 — 매트릭스(축 × 단계) 조회용 ──────────────────────────────────
--
-- UNIQUE로 두지 **않는다.** 「같은 축·단계에 미션 2개 이상」은 어드민 정합성 검사가 잡는다
-- (티켓 §정합성 검사). DB로 막으면 «새 미션을 만들고 옛 미션을 지우는» 교체 절차가
-- 중간 상태에서 통째로 거부된다.
CREATE INDEX IF NOT EXISTS missions_gate_axis_stage_idx
  ON public.missions (gate_axis, gate_stage)
  WHERE gate_axis IS NOT NULL;

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 컬럼 3종이 붙었는지
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='missions'
--    AND column_name IN ('gate_axis','gate_stage','visibility_rule_json');
--    → 3행, 전부 is_nullable = YES
--
-- -- ② 기존 미션이 한 행도 바뀌지 않았는지 (세 컬럼 전부 NULL)
-- SELECT count(*) FROM public.missions
--  WHERE gate_axis IS NOT NULL OR gate_stage IS NOT NULL OR visibility_rule_json IS NOT NULL;
--    → 0
--
-- -- ③ 130~134가 만든 것이 그대로인지 (이 파일은 badges를 건드리지 않는다)
-- SELECT conname FROM pg_constraint WHERE conname = 'badges_condition_json_known_keys';       -- 1행
-- SELECT prosrc LIKE '%COALESCE(family_key%' AS has_family_key_grouping,
--        prosrc LIKE '%repeat_count%'        AS has_repeat_count
--   FROM pg_proc WHERE proname = 'check_family_condition_consistency';                        -- 둘 다 true
-- SELECT proname FROM pg_proc WHERE proname = 'increment_activity_badge_earn';                -- 1행
-- SELECT pg_get_triggerdef(oid) FROM pg_trigger
--  WHERE tgname = 'badges_family_consistency' AND tgrelid = 'public.badges'::regclass;
--    → BEFORE INSERT OR UPDATE OF name, activity_types, condition_json, level, rarity, family_key
--
-- -- ④ 롤백 스모크 — 짝 제약이 실제로 거는지. MCP엔 트랜잭션이 없으므로 RAISE EXCEPTION으로 되돌린다.
-- DO $smoke$
-- DECLARE v_id UUID;
-- BEGIN
--   INSERT INTO public.missions (title, mission_type, condition_json, starts_at, gate_axis)
--   VALUES ('__smoke_135__', 'distance', '{"distance_km":1}'::jsonb, now(), 'walking:거리')
--   RETURNING id INTO v_id;
--   RAISE EXCEPTION '롤백(실패): gate_stage 없이 gate_axis만 넣는 것이 막혔어야 한다 (id=%)', v_id;
-- END
-- $smoke$;
--    → 기대: missions_gate_axis_stage_paired 위반 (「롤백(실패)」가 뜨면 제약이 안 걸린 것)

-- ── 기존 게이트 미션 15개의 «폐기» — 이 파일에서는 실행하지 않는다 ──────────
--
-- 2026-09-05 사용자 확정(티켓 판단 ②): 기존 게이트 미션 15개는 전환하지 않고 폐기한 뒤
-- v5 미션 40개를 새로 만든다. 그 15개가 가리키는 보상 배지는 티켓 20260905_0035가
-- 카탈로그를 전량 교체하면 사라지기 때문이다.
--
-- ⚠️ **폐기 시점은 0035 시딩과 맞춰야 한다.** 먼저 지우면 그동안 게이트가 열린 채로 남는다.
--    그래서 이 티켓은 «식별 수단과 절차»만 남긴다.
--
-- 식별 기준: 「레거시 게이팅을 쓰는데 축이 없는 미션」 = `gated_badge_id IS NOT NULL AND gate_axis IS NULL`.
-- 이 식은 135 실행 직후에는 기존 15개와 정확히 일치하고, v5 게이트 미션이 들어와도
-- (그쪽은 `gate_axis`가 채워지므로) 절대 섞이지 않는다. 어드민 게이트 미션 화면이 이
-- 목록을 「폐기 대상(레거시)」으로 따로 보여준다.
--
-- -- 폐기 대상 확인 (0035 착수 시점에 다시 돌려서 15건인지 볼 것)
-- SELECT id, title, gated_badge_id, starts_at, ends_at FROM public.missions
--  WHERE gated_badge_id IS NOT NULL AND gate_axis IS NULL ORDER BY created_at;
--
-- -- 폐기 절차 (0035 시딩과 **같은 시점에** 실행. 이 티켓에서는 실행하지 않는다)
-- --   ① 참가·완료·랭킹 기록이 FK로 걸려 있으므로 자식부터 지운다
-- --   ② missions 삭제
-- BEGIN;
-- WITH legacy AS (
--   SELECT id FROM public.missions WHERE gated_badge_id IS NOT NULL AND gate_axis IS NULL
-- )
-- DELETE FROM public.mission_rank_snapshots WHERE mission_id IN (SELECT id FROM legacy);
-- WITH legacy AS (
--   SELECT id FROM public.missions WHERE gated_badge_id IS NOT NULL AND gate_axis IS NULL
-- )
-- DELETE FROM public.user_mission_completions WHERE mission_id IN (SELECT id FROM legacy);
-- WITH legacy AS (
--   SELECT id FROM public.missions WHERE gated_badge_id IS NOT NULL AND gate_axis IS NULL
-- )
-- DELETE FROM public.user_mission_participations WHERE mission_id IN (SELECT id FROM legacy);
-- DELETE FROM public.missions WHERE gated_badge_id IS NOT NULL AND gate_axis IS NULL;
-- COMMIT;

-- ↩️ 롤백 DDL
--    ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_gate_axis_excludes_gated_badge;
--    ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_visibility_rule_shape;
--    ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_gate_axis_format;
--    ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_gate_axis_stage_paired;
--    ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_gate_stage_values;
--    DROP INDEX IF EXISTS public.missions_gate_axis_stage_idx;
--    ALTER TABLE public.missions
--      DROP COLUMN IF EXISTS visibility_rule_json,
--      DROP COLUMN IF EXISTS gate_stage,
--      DROP COLUMN IF EXISTS gate_axis;
