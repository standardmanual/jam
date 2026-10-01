-- 209: ambient_drop_schedules 신규 — 앰비언트 드랍 날짜 예약 저장소 (티켓 20261001_2051, 상위 20260930_1457)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 민지 판정과 사용자 승인 뒤 오케스트레이터(카리나)가 처리한다.
--    Supabase는 staging·프로덕션 공용 단일 DB라 실행 즉시 프로덕션에 생긴다.
--
-- 배경:
--   앰비언트 드랍(시스템이 지점에 아이템 배지를 놓아 두는 것)에 날짜·지점·아이템을 정한 예약을 더한다(O6).
--   예약은 싱글톤 `ambient_drop_config`를 쓰지 않는다 — 예약을 등록·실행해도 매일 배포 설정이 바뀌지 않게
--   하려고 별도 테이블에 둔다. 매시 cron(`api/cron/ambient-drop`)이 도래한 예약을 한 번만 실행한다.
--
-- 설계:
--   - 새 테이블 1개만 만든다. 기존 테이블·RPC·`poi_drops`·`engine_decision_log`는 건드리지 않는다
--     (추가만 하는 확장 마이그레이션, `db-migration-rules.md` §1). 백필은 없다.
--   - 시각은 KST 정시만 받는다(CHECK). 상태는 7가지이고 `missed`·`stalled`처럼 시간이 지나 파생되는 값은
--     앱이 읽을 때 계산한다(`running`이 오래 남은 경우의 `stalled`는 DB 상태가 아니다).
--   - 지점은 두 모드다. `list`(지점 직접 선택, 지점마다 `per_poi_count`개)와 `category`(지점 종류+총 개수,
--     시스템이 흩어 놓음). 아이템도 두 모드다. `items`(배지 직접 선택)와 `collections`(컬렉션 선택).
--     한 예약 안에서 모드를 섞지 않는다 — 모드별 CHECK가 칸 조합을 강제한다.
--   - 1건 총 100개 상한(임시값)을 CHECK로 건다. `list`는 지점 수 × 지점당 개수, `category`는 총 개수.
--   - `poi_category`에는 FK를 걸지 않는다. `ON DELETE SET NULL`이면 종류가 지워질 때 예약이 「전체 종류」로
--     넓어진다. 앱이 등록 때 종류가 있는지 확인하고, 실행 때 종류가 없으면 대상 없음으로 건너뛴다.
--   - 칸 이름 `poi_ids`·`poi_category`·`badge_ids`·`collection_ids`·`per_poi_count`·`total_count`는 밸런스 규칙
--     R8의 키(`ops_rules`의 `economy_keys` 23개, 207)와 겹치지 않아야 한다. 새 칸을 더할 때도 확인한다.
--   - RLS: 켜되 정책은 만들지 않는다(207과 같은 방식). anon/authenticated는 전부 거부되고
--     service_role(어드민 API·cron)만 접근한다.
--
-- 재실행 가능(idempotent): CREATE TABLE IF NOT EXISTS · CREATE INDEX IF NOT EXISTS로 작성했다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ambient_drop_schedules (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT        NULL,
  scheduled_at   TIMESTAMPTZ NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'scheduled',
  poi_mode       TEXT        NOT NULL,
  poi_ids        UUID[]      NOT NULL DEFAULT '{}',
  poi_category   TEXT        NULL,
  item_mode      TEXT        NOT NULL,
  badge_ids      UUID[]      NOT NULL DEFAULT '{}',
  collection_ids UUID[]      NOT NULL DEFAULT '{}',
  per_poi_count  INTEGER     NULL,
  total_count    INTEGER     NULL,
  created_by     TEXT        NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at     TIMESTAMPTZ NULL,
  finished_at    TIMESTAMPTZ NULL,
  canceled_at    TIMESTAMPTZ NULL,
  result         JSONB       NULL,
  CONSTRAINT ambient_drop_schedules_title_length_check
    CHECK (title IS NULL OR char_length(title) <= 100),
  -- KST 정시만: 한국 시각으로 옮겼을 때 분·초가 0이어야 한다
  CONSTRAINT ambient_drop_schedules_kst_hour_check
    CHECK (date_trunc('hour', scheduled_at AT TIME ZONE 'Asia/Seoul') = scheduled_at AT TIME ZONE 'Asia/Seoul'),
  CONSTRAINT ambient_drop_schedules_status_check
    CHECK (status IN ('scheduled', 'running', 'done', 'skipped', 'failed', 'missed', 'canceled')),
  CONSTRAINT ambient_drop_schedules_poi_mode_check
    CHECK (poi_mode IN ('list', 'category')),
  CONSTRAINT ambient_drop_schedules_item_mode_check
    CHECK (item_mode IN ('items', 'collections')),
  CONSTRAINT ambient_drop_schedules_per_poi_count_check
    CHECK (per_poi_count IS NULL OR per_poi_count >= 1),
  CONSTRAINT ambient_drop_schedules_total_count_check
    CHECK (total_count IS NULL OR total_count >= 1),
  -- 지점 모드별 칸 조합. 곱은 bigint로 계산해 큰 값이 와도 상한 위반으로 걸리게 한다.
  CONSTRAINT ambient_drop_schedules_poi_mode_fields_check CHECK (
    (
      poi_mode = 'list'
      AND cardinality(poi_ids) >= 1
      AND per_poi_count IS NOT NULL
      AND total_count IS NULL
      AND cardinality(poi_ids)::bigint * per_poi_count <= 100
    )
    OR (
      poi_mode = 'category'
      AND cardinality(poi_ids) = 0
      AND total_count IS NOT NULL
      AND total_count BETWEEN 1 AND 100
      AND per_poi_count IS NULL
    )
  ),
  -- 아이템 모드별 칸 조합. 한쪽만 채운다.
  CONSTRAINT ambient_drop_schedules_item_mode_fields_check CHECK (
    (
      item_mode = 'items'
      AND cardinality(badge_ids) >= 1
      AND cardinality(collection_ids) = 0
    )
    OR (
      item_mode = 'collections'
      AND cardinality(collection_ids) >= 1
      AND cardinality(badge_ids) = 0
    )
  )
);

-- 매시 cron이 도래한 예약을 찾는 경로. 대기 중인 예약만 담아 작게 유지한다.
CREATE INDEX IF NOT EXISTS idx_ambient_drop_schedules_due
  ON public.ambient_drop_schedules (scheduled_at)
  WHERE status = 'scheduled';

-- RLS: 정책을 만들지 않는다 = anon/authenticated 전부 거부, service_role만 접근.
ALTER TABLE public.ambient_drop_schedules ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ambient_drop_schedules IS
  '앰비언트 드랍 날짜 예약(티켓 20261001_2051, 상위 20260930_1457). 싱글톤 ambient_drop_config를 쓰지 않고 별도로 둔다. 매시 cron(api/cron/ambient-drop)이 도래한 예약을 한 번만 실행한다. 어드민 API·cron 전용(service_role만 접근).';
COMMENT ON COLUMN public.ambient_drop_schedules.title IS '예약 이름(운영자가 알아보는 용도, 100자 이하). 없어도 된다.';
COMMENT ON COLUMN public.ambient_drop_schedules.scheduled_at IS '놓을 시각. KST 정시만 받는다(CHECK). 도래한 뒤 3시간을 넘기면 놓지 않고 missed로 둔다(앱 상수).';
COMMENT ON COLUMN public.ambient_drop_schedules.status IS
  'scheduled(대기) · running(실행 중, cron이 선점) · done(놓음) · skipped(대상 없음) · failed(전부 실패 또는 오류) · missed(3시간을 넘겨 놓침) · canceled(공개 전 취소). running이 30분 넘게 남으면 앱이 stalled로 파생해 읽는다(DB 상태 아님).';
COMMENT ON COLUMN public.ambient_drop_schedules.poi_mode IS 'list(지점 직접 선택, poi_ids·per_poi_count) · category(지점 종류+총 개수, poi_category·total_count). 한 예약에서 섞지 않는다.';
COMMENT ON COLUMN public.ambient_drop_schedules.poi_ids IS 'poi_mode=list일 때 놓을 지점 id. category에서는 비어 있어야 한다.';
COMMENT ON COLUMN public.ambient_drop_schedules.poi_category IS
  'poi_mode=category일 때 지점 종류(poi_categories.slug). null은 「전체 종류」. FK를 걸지 않는다 — ON DELETE SET NULL이면 종류가 지워질 때 예약이 전체로 넓어진다. 앱이 등록 때 존재를 확인하고 실행 때 없으면 대상 없음으로 건너뛴다.';
COMMENT ON COLUMN public.ambient_drop_schedules.item_mode IS 'items(배지 직접 선택, badge_ids) · collections(컬렉션 선택, collection_ids — 노출 중인 컬렉션의 아이템에서 시스템이 고름). 한 예약에서 섞지 않는다.';
COMMENT ON COLUMN public.ambient_drop_schedules.badge_ids IS 'item_mode=items일 때 놓을 아이템 배지 id. collections에서는 비어 있어야 한다.';
COMMENT ON COLUMN public.ambient_drop_schedules.collection_ids IS 'item_mode=collections일 때 대상 컬렉션(item_books.id). items에서는 비어 있어야 한다.';
COMMENT ON COLUMN public.ambient_drop_schedules.per_poi_count IS 'poi_mode=list일 때 지점마다 놓을 개수(1 이상). 지점 수 × 이 값이 100 이하여야 한다.';
COMMENT ON COLUMN public.ambient_drop_schedules.total_count IS 'poi_mode=category일 때 놓을 총 개수(1~100). 시스템이 매일 배포와 같은 한도(max_active_per_poi)로 흩어 놓는다.';
COMMENT ON COLUMN public.ambient_drop_schedules.created_by IS '등록한 관리자 이메일.';
COMMENT ON COLUMN public.ambient_drop_schedules.claimed_at IS 'cron이 running으로 선점한 시각. 30분 넘게 running이면 stalled로 읽는다.';
COMMENT ON COLUMN public.ambient_drop_schedules.finished_at IS '실행이 끝난 시각(done·skipped·failed·missed).';
COMMENT ON COLUMN public.ambient_drop_schedules.canceled_at IS '공개 전에 취소한 시각.';
COMMENT ON COLUMN public.ambient_drop_schedules.result IS
  '실행 결과 요약(JSONB): 요청 수·놓은 수·실패 수·건너뜀 사유(reason)·제외 목록(excluded)·겹친 지점 수·놓은 drop id. missed는 {"reason":"missed"}. 실행 이력 원본은 engine_decision_log(ambient_batch_result)에 남는다.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'ambient_drop_schedules';          -- 1행, rowsecurity = true
-- SELECT count(*) FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'ambient_drop_schedules';          -- 0이어야 정상
-- SELECT indexdef FROM pg_indexes
--   WHERE schemaname = 'public' AND indexname = 'idx_ambient_drop_schedules_due';  -- WHERE (status = 'scheduled')
-- SELECT conname FROM pg_constraint
--   WHERE conrelid = 'public.ambient_drop_schedules'::regclass AND contype = 'c' ORDER BY conname; -- CHECK 9개
--
-- 정시 CHECK 스모크(승인 뒤 실행 전에 DO 블록 + RAISE EXCEPTION 롤백으로 확인한다):
--   KST 10:00은 통과, KST 10:30은 ambient_drop_schedules_kst_hour_check 위반이어야 한다.

-- 되돌림 SQL
-- 사전 확인: 아래 개수가 0이 아니면 그 예약을 먼저 취소한다(테이블을 지우면 놓일 드랍이 놓이지 않는다).
-- SELECT count(*) FROM public.ambient_drop_schedules WHERE status IN ('scheduled', 'running');
-- 이미 놓인 poi_drops는 이 테이블을 가리키지 않아 영향이 없고, 실행 이력은 engine_decision_log에 남는다.
-- 코드(cron의 예약 처리)를 먼저 되돌린 뒤 실행한다.
-- DROP TABLE IF EXISTS public.ambient_drop_schedules;
