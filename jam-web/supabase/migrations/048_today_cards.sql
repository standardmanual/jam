-- Phase 15: 홈 → '투데이' 개편 — 콘텐츠 카드 CMS
-- today_cards: 어드민이 제작하는 "오늘 소개할 콘텐츠" 카드. 시작/종료 일시(예약발행)
-- + 노출조건 태그(OR 매칭)로 조건부 노출. 자세한 스키마 근거는 PRD/Phase15_02_DATA_MODEL.md §1.

CREATE TABLE IF NOT EXISTS public.today_cards (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type     TEXT NOT NULL CHECK (template_type IN (
                       'badge_spotlight', 'progress_nudge', 'mission_spotlight',
                       'itembook_milestone', 'location_trend', 'drop_alert', 'editorial_article'
                     )),

  -- 공통 표시 필드
  title             TEXT NOT NULL,
  subtitle          TEXT,
  cover_image_url   TEXT,

  -- 템플릿별 참조 필드 (해당 템플릿에서만 사용, 나머지는 NULL/빈 배열)
  badge_ids         UUID[] NOT NULL DEFAULT '{}',   -- badge_spotlight, progress_nudge, location_trend
  mission_id        UUID REFERENCES public.missions(id) ON DELETE SET NULL,      -- progress_nudge, mission_spotlight
  item_book_id      UUID REFERENCES public.item_books(id) ON DELETE SET NULL,    -- itembook_milestone
  region_label      TEXT,                            -- location_trend (자유 입력, 예: "성수동")
  body_markdown     TEXT,                             -- editorial_article 본문

  -- 이동 경로 (editorial_article은 무시하고 /today/[id]로 고정 이동)
  target_href       TEXT,

  -- 노출 제어
  exposure_tags     TEXT[] NOT NULL DEFAULT '{all}',
  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ NOT NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_today_cards_window
  ON public.today_cards (starts_at, ends_at) WHERE is_active = TRUE;

ALTER TABLE public.today_cards ENABLE ROW LEVEL SECURITY;

-- 인증 유저는 활성 카드만 읽기 가능 (노출조건/기간 필터는 애플리케이션 레벨에서 추가 적용)
DROP POLICY IF EXISTS "today_cards: 인증 유저 읽기" ON public.today_cards;
CREATE POLICY "today_cards: 인증 유저 읽기" ON public.today_cards
  FOR SELECT TO authenticated USING (is_active = TRUE);
-- 쓰기는 서비스 롤(어드민 API)만 — 별도 authenticated INSERT/UPDATE 정책 없음
