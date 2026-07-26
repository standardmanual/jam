-- Phase 15 개선: 투데이 카드 노출 형태(layout_type) 추가
-- 콘텐츠 종류(template_type)와 별개로, 화면에 어떤 형태로 보여줄지 어드민이 선택.
-- 큰썸네일형 / 배지목록형(갤러리) / 바로가기형 / 배너형 / 기타

ALTER TABLE public.today_cards
  ADD COLUMN IF NOT EXISTS layout_type TEXT NOT NULL DEFAULT 'large_thumbnail'
    CHECK (layout_type IN ('large_thumbnail', 'badge_gallery', 'shortcut', 'banner', 'other'));
