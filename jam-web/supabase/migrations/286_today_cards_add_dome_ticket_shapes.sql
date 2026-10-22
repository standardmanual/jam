-- 286: 투데이 카드 노출 형태(layout_type) 및 모양(shape)에 'dome'(아치 돔)과 'ticket'(티켓) 추가
-- 티켓 20261022_2225 — 사용자 결정(1 Dome, 2 Ticket 사용)에 따라 홈 피드 카드 유형 확장
--
-- 재실행 가능(idempotent): DROP CONSTRAINT IF EXISTS → ADD CONSTRAINT

BEGIN;

-- ── 1. today_cards.layout_type CHECK 확장 ────────────────────────────────
ALTER TABLE public.today_cards DROP CONSTRAINT IF EXISTS today_cards_layout_type_check;
ALTER TABLE public.today_cards ADD CONSTRAINT today_cards_layout_type_check
  CHECK (layout_type IN (
    'large_thumbnail',
    'badge_gallery',
    'shortcut',
    'banner',
    'other',
    'ranking_list',
    'dome',
    'ticket'
  ));

COMMENT ON COLUMN public.today_cards.layout_type IS
  '노출 형태(large_thumbnail·badge_gallery·shortcut·banner·other·ranking_list·dome·ticket). 티켓 20261022_2225에서 dome, ticket 추가.';

-- ── 2. today_cards.shape CHECK 확장 ──────────────────────────────────────
ALTER TABLE public.today_cards DROP CONSTRAINT IF EXISTS today_cards_shape_check;
ALTER TABLE public.today_cards ADD CONSTRAINT today_cards_shape_check
  CHECK (shape IS NULL OR shape IN ('hero', 'poster', 'square', 'brief', 'list', 'dome', 'ticket'));

COMMENT ON COLUMN public.today_cards.shape IS
  '카드 모양(hero·poster·square·brief·list·dome·ticket). 티켓 20261022_2225에서 dome, ticket 추가.';

COMMIT;
