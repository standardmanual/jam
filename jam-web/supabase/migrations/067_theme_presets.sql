-- Phase 3 (디자인 리뉴얼): 어드민이 메인/서브 컬러 프리셋을 만들고 활성화할 수 있게 하는 테이블.
-- 활성 프리셋 1개의 컬러가 런타임에 CSS 변수(--color-main/--color-sub)로 전체 서비스에 주입된다.
-- (참고: SuperHi Plus 토큰 정의는 src/app/globals.css, 주입 로직은 src/app/layout.tsx)

CREATE TABLE public.theme_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  main_color TEXT NOT NULL, -- 코발트 계열 hex, 예: #0033e5
  sub_color TEXT NOT NULL,  -- 아이스 계열 hex, 예: #f0f7ff
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 활성 프리셋은 항상 최대 1개
CREATE UNIQUE INDEX theme_presets_single_active
  ON public.theme_presets (is_active)
  WHERE is_active;

ALTER TABLE public.theme_presets ENABLE ROW LEVEL SECURITY;

-- 색상값 자체는 민감정보가 아니며 런타임 주입(비로그인 페이지 포함)에 필요하므로 전체 공개 읽기.
-- 생성/활성화 전환은 어드민 API 라우트(getAdminUser 검증)에서 서비스 롤로만 수행한다.
CREATE POLICY "theme_presets: 전체 읽기 허용"
  ON public.theme_presets FOR SELECT
  USING (TRUE);

INSERT INTO public.theme_presets (name, main_color, sub_color, is_active)
VALUES ('기본(코발트/아이스)', '#0033e5', '#f0f7ff', true);

-- 프리셋 전환(이전 활성 row → false, 신규 row → true)을 단일 트랜잭션으로 보장.
-- SECURITY DEFINER + search_path 고정으로 실행자 권한과 무관하게 안전하게 동작.
CREATE FUNCTION public.activate_theme_preset(p_preset_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.theme_presets WHERE id = p_preset_id) THEN
    RAISE EXCEPTION '존재하지 않는 프리셋입니다: %', p_preset_id;
  END IF;

  UPDATE public.theme_presets SET is_active = false WHERE is_active = true AND id <> p_preset_id;
  UPDATE public.theme_presets SET is_active = true WHERE id = p_preset_id;
END;
$$;
