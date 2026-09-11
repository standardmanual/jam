-- 158: 랭킹모드(ranking_modes) 신규 + 투데이 카드 랭킹보드 카드 종류 연동
--      (티켓 20260911_1440, 홈 피드 랭킹보드)
--
-- 배경:
--   지금 랭킹은 항상 특정 미션에 종속된 속성(status_display_type='ranking')으로만 존재하고,
--   랭킹 자체가 독립된 개념으로 존재하지 않는다. 이 마이그레이션은 "랭킹모드"라는 새 독립
--   엔티티를 만들어, 랭킹이 미션에 종속되지 않고도 존재할 수 있게 한다.
--
--   대상 선정(target)과 정렬 지표(metric)는 서로 독립인 두 축이다:
--     - target_type='mission_participants' → target_mission_id 참조, metric_type은 항상
--       'mission_progress'(미션의 기존 순위 비교 규칙을 그대로 감싸 재사용 — 새 규칙 아님).
--     - target_type='manual_users' → target_user_ids 배열, metric_type은 'condition_field'
--       (배지 조건 레지스트리의 필드 키 하나 — metric_field_key) 또는 'badge_count'
--       (metric_badge_type으로 배지 타입 지정).
--
--   정렬 지표를 "레지스트리의 필드 키"로 저장하는 것이 핵심 결정이다 — 지표 종류를 랭킹모드
--   전용으로 새로 열거하지 않고 이미 있는 배지 조건 필드 목록(conditionRegistry.ts)을 그대로
--   참조한다. 다만 1차로 실제 계산 가능한 필드는 애플리케이션 레이어의 화이트리스트
--   (`src/lib/ranking/metricValues.ts`)가 별도로 관리한다 — Out of Scope(한 번의 활동 기록류
--   대표값 기준 미정 등)에 해당하는 필드는 이 DB 제약이 아니라 그 화이트리스트가 막는다.
--
--   교차 필드 정합성(예: target_type='mission_participants'인데 target_mission_id가
--   비어있음)은 이 마이그레이션이 DB CHECK로 강제하지 않는다 — 이 저장소의 기존 관례(예:
--   today_cards의 템플릿별 필요 필드)를 따라 어드민 API 레이어에서 검증한다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 재실행 가능(idempotent): CREATE TABLE IF NOT EXISTS + 동적 제약 재생성(082/103과 동일 패턴,
--   제약 이름을 하드코딩하지 않고 컬럼 언급으로 찾아 지운다) + ADD COLUMN IF NOT EXISTS.

BEGIN;

-- ── ① ranking_modes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ranking_modes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title              TEXT NOT NULL,

  target_type        TEXT NOT NULL CHECK (target_type IN ('mission_participants', 'manual_users')),
  -- target_type='mission_participants'일 때만 값을 가진다. 미션이 삭제되면 랭킹모드는
  -- 남되(어드민이 경고를 받도록 API 레이어가 처리 — User Story 8) 참조만 풀린다.
  target_mission_id  UUID REFERENCES public.missions(id) ON DELETE SET NULL,
  -- target_type='manual_users'일 때만 값을 가진다. 탈퇴 등으로 사라진 유저 id가 남아있을 수
  -- 있으므로(FK 배열이 아니라 UUID[] — Postgres는 배열 컬럼에 FK를 걸 수 없다), 랭킹 계산
  -- 시점에 존재하지 않는 유저는 애플리케이션 레이어가 걸러낸다.
  target_user_ids    UUID[] NOT NULL DEFAULT '{}',

  metric_type        TEXT NOT NULL CHECK (metric_type IN ('mission_progress', 'condition_field', 'badge_count')),
  -- metric_type='condition_field'일 때만 값을 가진다. badges.condition_json과 같은 필드 키
  -- 네임스페이스를 그대로 참조한다(conditionRegistry.ts의 CONDITION_FIELDS[].key) — 이 테이블
  -- 자체는 그 값을 검증하지 않는다(레지스트리가 늘어날 때 이 테이블을 매번 고치지 않기 위함).
  metric_field_key   TEXT,
  -- metric_type='badge_count'일 때만 값을 가진다.
  metric_badge_type  TEXT CHECK (metric_badge_type IN ('activity', 'item', 'checkin')),

  starts_at          TIMESTAMPTZ NOT NULL,
  ends_at            TIMESTAMPTZ NOT NULL,
  -- 공개할 순위 인원 제한(선택) — missions.visible_rank_count와 같은 개념을 그대로 가져왔다.
  visible_rank_count INTEGER,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         UUID REFERENCES public.users(id)
);

ALTER TABLE public.ranking_modes ENABLE ROW LEVEL SECURITY;
-- 인증 유저 대상 읽기 정책을 두지 않는다 — 랭킹모드 자체(특히 수동 지정 유저 목록)는
-- 어드민 API(requireAdmin)와, 투데이 카드 조회 시 서버가 계산하는 결과(resolved_ranking,
-- service-role)로만 노출된다. today_cards처럼 "활성 카드는 인증 유저가 직접 읽는다"는 경로가
-- ranking_modes에는 없다 — 원본 테이블이 아니라 계산된 순위 목록만 클라이언트에 내려간다.

CREATE INDEX IF NOT EXISTS idx_ranking_modes_target_mission
  ON public.ranking_modes (target_mission_id) WHERE target_mission_id IS NOT NULL;

-- ── ② today_cards 연동 ──────────────────────────────────────────────────
ALTER TABLE public.today_cards
  ADD COLUMN IF NOT EXISTS ranking_mode_id UUID REFERENCES public.ranking_modes(id) ON DELETE SET NULL;

-- template_type CHECK에 'ranking_board' 추가. 제약 이름을 하드코딩하지 않고 컬럼 언급으로
-- 찾아 지운다(103_rename_poi_badge_to_checkin.sql과 동일 패턴) — 048이 붙인 기본 이름
-- (today_cards_template_type_check)이 실제와 다를 가능성에 대비한다.
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.today_cards'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%template_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.today_cards DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.today_cards
  ADD CONSTRAINT today_cards_template_type_check CHECK (template_type IN (
    'badge_spotlight', 'progress_nudge', 'mission_spotlight',
    'itembook_milestone', 'location_trend', 'drop_alert', 'editorial_article',
    'ranking_board'
  ));

-- layout_type CHECK에 'ranking_list'(랭킹보드 전용 노출 형태 — 순위 리스트) 추가. 049가 붙인
-- 기본 이름이 실제와 다를 가능성에 대비해 같은 동적 조회로 찾아 지운다.
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.today_cards'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%layout_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.today_cards DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.today_cards
  ADD CONSTRAINT today_cards_layout_type_check CHECK (layout_type IN (
    'large_thumbnail', 'badge_gallery', 'shortcut', 'banner', 'other', 'ranking_list'
  ));

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 테이블·인덱스·RLS가 만들어졌는지
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'ranking_modes';
-- SELECT indexname FROM pg_indexes WHERE tablename = 'ranking_modes';
--
-- -- ② today_cards 제약이 새 값을 허용하는지
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.today_cards'::regclass AND contype = 'c';
--
-- -- ③ 기존 today_cards 행이 전부 그대로 유효한지(마이그레이션이 기존 데이터를 깨지 않았는지)
-- SELECT COUNT(*) FROM public.today_cards WHERE ranking_mode_id IS NOT NULL; -- 기대: 0(신규 컬럼)

-- ↩️ 롤백 DDL
--    ALTER TABLE public.today_cards DROP CONSTRAINT IF EXISTS today_cards_layout_type_check;
--    ALTER TABLE public.today_cards ADD CONSTRAINT today_cards_layout_type_check
--      CHECK (layout_type IN ('large_thumbnail', 'badge_gallery', 'shortcut', 'banner', 'other'));
--    ALTER TABLE public.today_cards DROP CONSTRAINT IF EXISTS today_cards_template_type_check;
--    ALTER TABLE public.today_cards ADD CONSTRAINT today_cards_template_type_check
--      CHECK (template_type IN (
--        'badge_spotlight', 'progress_nudge', 'mission_spotlight',
--        'itembook_milestone', 'location_trend', 'drop_alert', 'editorial_article'
--      ));
--    ALTER TABLE public.today_cards DROP COLUMN IF EXISTS ranking_mode_id;
--    DROP TABLE IF EXISTS public.ranking_modes;
