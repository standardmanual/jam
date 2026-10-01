-- 207: ops_rules 신규 — 밸런스 규칙과 신호 기준값을 담는 규칙 값 테이블 (티켓 20260930_1459 조각 A)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 민지 판정과 사용자 승인 뒤 오케스트레이터(카리나)가 처리한다.
--    Supabase는 staging·프로덕션 공용 단일 DB라 실행 즉시 프로덕션에 생긴다.
--
-- 배경:
--   운영툴은 AI 없이 규칙으로 「밸런스 경고」를 계산한다(docs/specs/prd/ops-tool/PRD.md §5.2).
--   규칙 값은 배포 없이 바꿔야 하므로 코드 상수가 아니라 이 테이블에 둔다. 기획 상세(S3)를 열 때마다
--   이 테이블을 읽어 그 순간의 값으로 계산하고, 결과는 저장하지 않는다.
--
-- 설계:
--   - 새 테이블 1개만 만든다. 기존 테이블은 바꾸지 않는다(추가만 하는 확장 마이그레이션,
--     `db-migration-rules.md` §1). 백필은 없고 시드 8행만 넣는다.
--   - `rule_group`: `balance`(밸런스 규칙, 이 티켓)와 `signal`(신호 기준값, 조각 C가 같은 테이블에 넣는다).
--   - `value`: 규칙마다 모양이 다르다. R1~R3 `{max, provisional}`, R4 `{min_days, provisional}`,
--     R5 `{kinds: {종류: {max, provisional}}}`, R6·R7 `{}`(R5 값을 따른다), R8 `{keys: [...]}`.
--     `provisional`은 실측 없이 정한 임시값 표시다(실측 티켓 20261001_1220이 끝나면 다시 정한다).
--   - `level`: `info`(참고) · `warn`(주의). 툴은 「중단」을 쓰지 않는다.
--   - `updated_by`는 시드에서 비운다. `previous_value`는 설정 화면(조각 B)의 「직전 값으로 되돌리기」 자리다.
--   - R8 키 목록은 `drop_policy`와 `combine_policy`의 컬럼 이름에서 `id`·`updated_at`을 뺀 23개다
--     (2026-10-01 기준 `database.generated.ts`의 컬럼. 1457이 `drop_schedule` 필드를 정하면 겹치는지 확인하고 확정한다).
--   - RLS: 켜되 정책은 만들지 않는다(198_ops_inbox.sql과 같은 방식). anon/authenticated는 전부 거부되고
--     service_role(어드민 API·서버 화면)만 접근한다.
--
-- 재실행 가능(idempotent): CREATE TABLE IF NOT EXISTS · INSERT ... ON CONFLICT DO NOTHING으로 작성했다.
-- 이미 있는 행의 값은 덮어쓰지 않는다(설정 화면에서 바꾼 값을 재실행이 되돌리지 않게 한다).

BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_rules (
  rule_key       TEXT        PRIMARY KEY,
  rule_group     TEXT        NOT NULL,
  value          JSONB       NOT NULL,
  level          TEXT        NOT NULL,
  enabled        BOOLEAN     NOT NULL DEFAULT true,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     TEXT        NULL,
  previous_value JSONB       NULL,
  CONSTRAINT ops_rules_rule_group_check CHECK (rule_group IN ('balance', 'signal')),
  CONSTRAINT ops_rules_level_check CHECK (level IN ('info', 'warn'))
);

-- RLS: 정책을 만들지 않는다 = anon/authenticated 전부 거부, service_role만 접근.
ALTER TABLE public.ops_rules ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ops_rules IS
  '운영툴의 규칙 값(티켓 20260930_1459). 밸런스 규칙(rule_group=balance)과 신호 기준값(rule_group=signal, 조각 C)을 함께 담는다. 기획 상세를 열 때 읽어 그 순간의 값으로 계산한다. 어드민 API·서버 화면 전용(service_role만 접근).';
COMMENT ON COLUMN public.ops_rules.rule_key IS '규칙 키(예: open_collections_max). 규칙 목록은 docs/specs/prd/ops-tool/PRD.md §5.2.';
COMMENT ON COLUMN public.ops_rules.value IS
  '규칙 값(JSONB, 규칙마다 모양이 다르다). provisional=true는 실측 없이 정한 임시값이다.';
COMMENT ON COLUMN public.ops_rules.level IS 'info(참고) · warn(주의). 툴은 중단을 쓰지 않는다.';
COMMENT ON COLUMN public.ops_rules.enabled IS 'false면 그 규칙은 계산하지 않는다.';
COMMENT ON COLUMN public.ops_rules.updated_by IS '마지막으로 값을 바꾼 사람. 시드는 비워 둔다.';
COMMENT ON COLUMN public.ops_rules.previous_value IS '직전 값(설정 화면의 「직전 값으로 되돌리기」용, 조각 B가 채운다).';

-- 시드: 밸런스 규칙 R1~R8. 모두 balance · warn(주의) · 켜짐.
INSERT INTO public.ops_rules (rule_key, rule_group, value, level, enabled) VALUES
  -- R1 동시 개방 컬렉션 수 — 임시값(혜린 가정 6, 윈터안 9. 티켓 20260929_2226)
  ('open_collections_max', 'balance',
   '{"max": 6, "provisional": true}'::jsonb, 'warn', true),
  -- R2 한 주 신규 개방 수 — 임시값
  ('weekly_new_collections_max', 'balance',
   '{"max": 1, "provisional": true}'::jsonb, 'warn', true),
  -- R3 28일 신규 개방 수 — 임시값
  ('rolling_new_collections_max', 'balance',
   '{"max": 2, "provisional": true}'::jsonb, 'warn', true),
  -- R4 개방 리드타임 — 확정값(06 3.2 사용자 결정)
  ('launch_lead_days_min', 'balance',
   '{"min_days": 28, "provisional": false}'::jsonb, 'warn', true),
  -- R5 항목별 포인트 — 달성형 100·컬렉션 완성 20·레시피 30은 2026-10-01 서비스의 같은 종류 최댓값, 횟수형 10·미션 50은 임시값
  ('point_reward_max', 'balance',
   '{"kinds": {
      "count_badge":           {"max": 10,  "provisional": true},
      "achievement_badge":     {"max": 100, "provisional": false},
      "mission":               {"max": 50,  "provisional": true},
      "collection_completion": {"max": 20,  "provisional": false},
      "recipe":                {"max": 30,  "provisional": false}
    }}'::jsonb, 'warn', true),
  -- R6 한 번의 행동으로 받는 포인트 합 — R5 값을 따른다(따로 저장하지 않는다)
  ('single_action_points', 'balance', '{}'::jsonb, 'warn', true),
  -- R7 파밍 방지(횟수형 사다리 합) — R5의 달성형 값을 따른다(따로 저장하지 않는다)
  ('count_ladder_points', 'balance', '{}'::jsonb, 'warn', true),
  -- R8 경제 수치 불변 — drop_policy·combine_policy 컬럼 이름 23개(id·updated_at 제외)
  ('economy_keys', 'balance',
   '{"keys": [
      "adjacent_weight", "bonus_drop_rate", "bonus_drop_rate_intense", "comeback_gap_days",
      "completed_book_weight", "completion_decay", "context_override_rate", "daily_downgrade_common",
      "daily_downgrade_from", "explore_weight", "fail_reward_points", "intense_duration_min",
      "intense_elevation_m", "last_piece_pity_threshold", "momentum_weight", "mystery_spice_rate",
      "rare_pity_threshold", "rarity_common", "rarity_epic", "rarity_mystic", "rarity_rare",
      "same_book_penalty", "weekly_first_rare_mult"
    ]}'::jsonb, 'warn', true)
ON CONFLICT (rule_key) DO NOTHING;

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'ops_rules';                      -- 1행, rowsecurity = true
-- SELECT count(*) FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'ops_rules';                      -- 0이어야 정상
-- SELECT rule_key, rule_group, level, enabled FROM public.ops_rules ORDER BY rule_key; -- 8행, 모두 balance · warn · true
-- SELECT jsonb_array_length(value -> 'keys') FROM public.ops_rules
--   WHERE rule_key = 'economy_keys';                                              -- 23

-- 되돌림 SQL
-- DROP TABLE IF EXISTS public.ops_rules;
