-- 352: 홈피드 카드 색(15색)의 hex 값을 어드민이 덮어쓰는 표를 만든다 (확장 단계)
-- 티켓 20261121_2145 (상위 20261120_2026 후속, 컬러셋 교체 어드민, 규격 정본 docs/service/prd/home-feed/PRD.md §6 「색」)
--
-- 색 키(`red`·`yellow`·…·`ref-yellow`)는 그대로 두고 키가 가리키는 hex만 바꾼다. 카드에는 hex가 아니라 키를 저장하므로
-- (2회차 결정) 이미 저장된 카드의 키는 그대로이고 «보이는 색»만 바뀐다. 행이 없으면 기본값(`colors.css`)이다 — 기본값 복원은 행 삭제다.
-- 이 표는 홈피드 카드 전용 변수(`--feed-color-<키>`)에만 쓰인다. 디자인 시스템 토큰(`--jam-*`)은 바뀌지 않는다.
--
-- RLS: 색은 비밀이 아니라 홈 화면을 그릴 때 누구나 읽을 수 있어야 하므로 SELECT만 anon·authenticated에 허용하고,
-- 쓰기는 정책이 없어 service_role(어드민 API)만 한다.
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다. 되돌림: 352_feed_color_overrides_down.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.feed_color_overrides (
  color_key  text        PRIMARY KEY,
  hex        text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid        NULL
);

ALTER TABLE public.feed_color_overrides DROP CONSTRAINT IF EXISTS feed_color_overrides_color_key_check;
ALTER TABLE public.feed_color_overrides
  ADD CONSTRAINT feed_color_overrides_color_key_check CHECK (color_key IN (
    'red', 'yellow', 'green', 'purple', 'blue',
    'red-soft', 'yellow-soft', 'green-soft', 'purple-soft', 'blue-soft',
    'ref-red', 'ref-blue', 'ref-lime', 'ref-pink', 'ref-yellow'));

ALTER TABLE public.feed_color_overrides DROP CONSTRAINT IF EXISTS feed_color_overrides_hex_check;
ALTER TABLE public.feed_color_overrides
  ADD CONSTRAINT feed_color_overrides_hex_check CHECK (hex ~ '^#[0-9a-fA-F]{6}$');

ALTER TABLE public.feed_color_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feed_color_overrides_read ON public.feed_color_overrides;
CREATE POLICY feed_color_overrides_read ON public.feed_color_overrides
  FOR SELECT TO anon, authenticated USING (true);

COMMENT ON TABLE public.feed_color_overrides IS
  '홈피드 카드 색 키(15색)의 hex 덮어쓰기(352, 티켓 20261121_2145). 행이 없으면 colors.css 기본값. 읽기는 누구나, 쓰기는 service_role만';
COMMENT ON COLUMN public.feed_color_overrides.color_key IS '색 키 15개(today_cards.bg_color_key와 같은 허용 값)';
COMMENT ON COLUMN public.feed_color_overrides.hex IS '#rrggbb. 카드에는 키를 저장하므로 이 값을 바꾸면 보이는 색만 바뀐다';

COMMIT;
