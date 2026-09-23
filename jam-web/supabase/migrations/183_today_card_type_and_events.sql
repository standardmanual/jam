-- 183: 유형 ID 컬럼(today_cards) + 노출·열람·후속 행동 계측 테이블(today_card_events) 신규
-- 티켓 20260923_2259 — 확장 단계(파일 작성만, 실행은 사용자 승인 후 오케스트레이터)
--
-- 배경:
--   컨텐츠 자동화 파이프라인(PRD docs/specs/prd/content-automation/PRD.md §6·§9)이 카드마다
--   17종 유형 ID(T01~T17) 중 하나를 붙이고, 그 유형별 반응(노출·열람·후속 행동)을 모아야
--   전략 변경안(§10)과 유형 카탈로그 성과 리뷰(§11)가 설 수 있다. 이 파일은 스키마만 연다 —
--   이벤트 기록 API·클라이언트 트래커·집계 조회는 후속 티켓 20260924_0004(전환 단계, 선행 조건
--   = 이 마이그레이션 실행 완료).
--
-- 설계:
--   - today_cards.content_type_id: TEXT NULL + CHECK(T01~T17). 기존 카드는 전부 NULL로 남는다
--     (확장 단계 — 백필 없음, 어드민이 새로 쓰거나 수정할 때만 채운다).
--   - today_card_events: 집계 전용 로그 테이블. **유저 식별자 컬럼을 두지 않는다**(결정 4-6,
--     PRD §9 "개인 식별자는 저장하지 않는다"). card_id는 today_cards를 참조하되 ON DELETE
--     SET NULL — 카드가 지워져도(어드민 정리) 이미 쌓인 유형별 집계(§11 유형 리뷰)가 함께
--     사라지지 않게 한다. content_type_id는 카드의 content_type_id를 복제해 기록 시점 값을
--     그대로 남긴다(카드가 나중에 유형을 바꾸거나 지워져도 이벤트의 유형 귀속이 흔들리지 않음).
--   - event: 'impression'(노출) · 'click'(열람) · 'followup'(§6 성공 행동) 셋 중 하나.
--   - followup_action: 성공 행동의 구체 내용(유형마다 다름 — "트라이브 상세 진입", "픽업" 등
--     §6 표의 자유 텍스트). 유형마다 다른 값이 허용돼야 해서 고정 CHECK를 걸지 않는다.
--   - 인덱스 (content_type_id, occurred_at): 유형별 기간 집계 조회(§11 리뷰 양식)가 기본 접근
--     경로라 복합 인덱스로 맞춘다.
--   - RLS: 어드민 집계 전용 로그(strava_sync_failures와 동일 패턴, 176_strava_sync_failures.sql).
--     RLS는 켜두되 정책은 만들지 않아 anon/authenticated는 기본 거부 — 클라이언트 직접 insert
--     금지, 쓰기는 서비스 롤(어드민 API)만.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 재실행 가능(idempotent): ADD COLUMN IF NOT EXISTS · CREATE TABLE IF NOT EXISTS ·
-- DROP CONSTRAINT IF EXISTS로 작성했다.

BEGIN;

-- ── today_cards.content_type_id ─────────────────────────────────────────
ALTER TABLE public.today_cards ADD COLUMN IF NOT EXISTS content_type_id TEXT NULL;

ALTER TABLE public.today_cards DROP CONSTRAINT IF EXISTS today_cards_content_type_id_check;
ALTER TABLE public.today_cards ADD CONSTRAINT today_cards_content_type_id_check
  CHECK (content_type_id IS NULL OR content_type_id IN (
    'T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09',
    'T10', 'T11', 'T12', 'T13', 'T14', 'T15', 'T16', 'T17'
  ));

COMMENT ON COLUMN public.today_cards.content_type_id IS
  '컨텐츠 유형 카탈로그(PRD content-automation/PRD.md §6) ID. T01~T17, 비어 있을 수 있다(티켓 20260923_2259). 자동화 파이프라인이 만든 카드에만 붙고 수동 제작 카드는 NULL로 둘 수 있다.';

-- ── today_card_events ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.today_card_events (
  id                BIGSERIAL PRIMARY KEY,
  card_id           UUID REFERENCES public.today_cards(id) ON DELETE SET NULL,
  content_type_id   TEXT,
  event             TEXT NOT NULL,
  followup_action   TEXT,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.today_card_events DROP CONSTRAINT IF EXISTS today_card_events_event_check;
ALTER TABLE public.today_card_events ADD CONSTRAINT today_card_events_event_check
  CHECK (event IN ('impression', 'click', 'followup'));

CREATE INDEX IF NOT EXISTS today_card_events_type_time_idx
  ON public.today_card_events (content_type_id, occurred_at);

-- RLS: 어드민(service_role) 집계 전용. service_role은 RLS를 우회하므로 정책을 만들지
-- 않는다 = anon/authenticated에는 전부 거부된다(클라이언트 직접 insert 불가).
ALTER TABLE public.today_card_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.today_card_events IS
  '투데이 카드 노출·열람·후속 행동 계측(티켓 20260923_2259, PRD content-automation/PRD.md §9). 집계 전용 — 유저 식별자 컬럼 없음(결정 4-6). 기록 API·트래커는 후속 티켓 20260924_0004.';
COMMENT ON COLUMN public.today_card_events.content_type_id IS
  '기록 시점 카드의 content_type_id를 복제한 값. 카드가 나중에 유형을 바꾸거나 삭제돼도 이 이벤트의 유형 귀속은 바뀌지 않는다.';
COMMENT ON COLUMN public.today_card_events.followup_action IS
  '후속 행동(event=followup)의 구체 내용 — 유형마다 다른 자유 텍스트(PRD §6 "성공 행동" 열). 고정 CHECK 없음.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① today_cards에 컬럼·CHECK가 생겼는지
-- SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_name = 'today_cards' AND column_name = 'content_type_id';
-- SELECT conname FROM pg_constraint WHERE conname = 'today_cards_content_type_id_check';
--
-- -- ② today_card_events 테이블·제약이 만들어졌는지
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.today_card_events'::regclass;
--
-- -- ③ RLS가 켜졌고 정책이 없는지(= anon/authenticated 접근 불가)
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'today_card_events';
-- SELECT policyname FROM pg_policies WHERE tablename = 'today_card_events'; -- 0행이어야 정상

-- 되돌림 SQL
-- ALTER TABLE public.today_cards DROP CONSTRAINT IF EXISTS today_cards_content_type_id_check;
-- ALTER TABLE public.today_cards DROP COLUMN IF EXISTS content_type_id;
-- DROP TABLE IF EXISTS public.today_card_events;
