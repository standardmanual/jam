-- 344: activity_badge_templates 신규 — 액티비티 배지 템플릿(SVG)을 분류마다 하나씩 저장 (티켓 20261115_2355, 상위 20261115_2353)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 작성만 하고 실행하지 않았다. 실행은 카리나가 한다.
-- 되돌림 파일: 344_activity_badge_templates_down.sql
--
-- 배경: 새 배지 이미지 제작 기능은 분류 4개(metric·days·streak·count)에 템플릿을 하나씩
--   등록해 두고 배지를 고르면 그 분류의 템플릿을 불러온다. asset_presets는 이름으로 여러 개를
--   저장하는 구조라 «분류마다 정확히 한 줄»과 SVG 본문 저장에 맞지 않아 표를 따로 둔다.
-- 설계:
--   - class_key가 기본 키라 분류마다 한 줄이 된다. 허용값은 티켓 20261115_2354의 분류 키와 같다.
--   - RLS를 켜고 정책은 만들지 않는다(185와 같은 패턴). anon·authenticated 권한도 명시 회수하고
--     service_role(어드민 API)만 읽고 쓴다.
--   - updated_at은 트리거 없이 애플리케이션이 갱신 시점마다 쓴다(저장소 관례).
-- 확장 단계다: 새 표를 더하기만 하고 기존 표·칸은 건드리지 않는다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.activity_badge_templates (
  class_key      TEXT        PRIMARY KEY,
  svg            TEXT        NOT NULL,
  slots          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  default_params JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_badge_templates DROP CONSTRAINT IF EXISTS activity_badge_templates_class_key_check;
ALTER TABLE public.activity_badge_templates ADD CONSTRAINT activity_badge_templates_class_key_check
  CHECK (class_key IN ('metric', 'days', 'streak', 'count'));

ALTER TABLE public.activity_badge_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.activity_badge_templates FROM anon, authenticated;

COMMENT ON TABLE public.activity_badge_templates IS
  '액티비티 배지 템플릿(티켓 20261115_2355). 분류(class_key)마다 SVG 하나. 어드민 API 전용(service_role만 접근).';
COMMENT ON COLUMN public.activity_badge_templates.class_key IS
  '템플릿 분류. metric·days·streak·count 중 하나, 분류마다 한 줄.';
COMMENT ON COLUMN public.activity_badge_templates.svg IS '템플릿 SVG 본문.';
COMMENT ON COLUMN public.activity_badge_templates.slots IS 'SVG에서 읽어 낸 이름 자리와 값 자리의 정보.';
COMMENT ON COLUMN public.activity_badge_templates.default_params IS '색과 글자의 기본 조정값.';
COMMENT ON COLUMN public.activity_badge_templates.updated_by IS '마지막으로 고친 운영자의 이메일.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.activity_badge_templates'::regclass;
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'activity_badge_templates';
-- SELECT policyname FROM pg_policies WHERE tablename = 'activity_badge_templates'; -- 0행이어야 정상
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'activity_badge_templates' AND grantee IN ('anon','authenticated'); -- 0행이어야 정상
