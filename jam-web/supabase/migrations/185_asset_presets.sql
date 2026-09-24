-- 185: asset_presets 신규 — JAM! 에셋 제너레이터 프리셋 저장 (티켓 20260924_2159)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 사용자 승인 후 오케스트레이터(또는 사용자가 SQL 편집기에서 직접)가 처리한다.
--
-- 배경:
--   자동 경로(윤진)는 어드민 화면 없이 프리셋만으로 배지 대표 이미지를 렌더링해야 한다
--   (docs/specs/prd/asset-generator/PRD.md §5·§8). 그러려면 프리셋이 이미지 원본까지 포함해
--   서버에서 읽을 수 있는 형태로 저장되어야 한다.
--
-- 설계:
--   - `target_type`은 1차로 'badge' 하나만 허용한다(PRD §12, 후속 차수에서 값 추가 — 그때
--     CHECK 제약을 갱신하는 별도 마이그레이션이 필요하다).
--   - `stage_ratio`는 어드민 화면이 다루는 세 값(`StageRatio`, PRD §3)만 허용한다.
--   - `layers`(JSONB)는 오버레이 레이어(이미지·텍스트) 목록과 순서만 담는다. 리본 레이어·
--     텍스트 글자 내용·배경색/끝색·리본의 랜덤 속성값과 시드는 저장하지 않는다(PRD §5) —
--     값 형태의 CHECK는 걸지 않는다(레이어 스키마가 진화 중, `shader_lab_compositions`의
--     `scene_json`과 같은 이유).
--   - 이미지 레이어의 `assetUrl`은 저장소(`images` 버킷) 공개 URL을 가리킨다. 실제 파일은
--     `asset-generator/presets/{presetId}/{layerId}.{png|svg}` 경로에 함께 올라간다 — 저장소
--     쓰기는 애플리케이션 코드(API 라우트)가 처리하고, 이 마이그레이션은 스키마만 연다.
--   - `created_by`는 `shader_lab_compositions`(마이그레이션 168)와 달리 이메일 문자열이 아니라
--     UUID다(티켓 지시). FK는 걸지 않는다 — 운영 편의 데이터라 계정 삭제 연쇄 처리가
--     불필요하다는 원칙은 168과 같다.
--   - `updated_at`은 트리거 없이 애플리케이션이 갱신 시점마다 명시적으로 쓴다(이 저장소에
--     `updated_at` 자동 갱신 트리거 관례가 없다 — 129의 `set_inventory_max_slots`도 값을
--     직접 넣는다).
--   - RLS: 켜되 정책은 만들지 않는다(168·184와 같은 패턴). RLS만 켜면 anon/authenticated
--     전체 조회·수정이 막히고 service_role(어드민 API 라우트, `getAdminUser()`로 이미
--     어드민만 통과시킨다)만 접근할 수 있다.
--
-- 재실행 가능(idempotent): CREATE TABLE IF NOT EXISTS · DROP CONSTRAINT IF EXISTS로 작성했다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.asset_presets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  target_type TEXT        NOT NULL,
  stage_ratio TEXT        NOT NULL,
  layers      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_by  UUID        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.asset_presets DROP CONSTRAINT IF EXISTS asset_presets_target_type_check;
ALTER TABLE public.asset_presets ADD CONSTRAINT asset_presets_target_type_check
  CHECK (target_type IN ('badge'));

ALTER TABLE public.asset_presets DROP CONSTRAINT IF EXISTS asset_presets_stage_ratio_check;
ALTER TABLE public.asset_presets ADD CONSTRAINT asset_presets_stage_ratio_check
  CHECK (stage_ratio IN ('1:1', '4:5', '9:16'));

-- RLS: 정책을 만들지 않는다 = anon/authenticated 전부 거부, service_role만 접근.
ALTER TABLE public.asset_presets ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.asset_presets IS
  'JAM! 에셋 제너레이터 프리셋(티켓 20260924_2159). 수동 경로(어드민)가 만들고, 자동 경로(윤진 CLI, 하위 티켓 2201)가 읽어 렌더링한다. 어드민 API 전용(service_role만 접근).';
COMMENT ON COLUMN public.asset_presets.target_type IS
  '프리셋이 적용될 컨텐츠 유형. 1차는 badge 하나만(PRD §12, 후속 차수에서 값 추가).';
COMMENT ON COLUMN public.asset_presets.stage_ratio IS
  '스테이지 비율(1:1·4:5·9:16). 어드민 화면 StageRatio 타입과 값이 같다.';
COMMENT ON COLUMN public.asset_presets.layers IS
  '오버레이 레이어(이미지·텍스트) 목록과 순서(OverlayLayerConfig[], 직렬화 규칙은 presetSerialize.ts). 리본 레이어·텍스트 글자 내용·배경색/끝색·리본 랜덤값과 시드는 저장하지 않는다(PRD §5). 이미지 레이어의 assetUrl은 저장소 공개 URL을 가리킨다.';
COMMENT ON COLUMN public.asset_presets.created_by IS
  '프리셋을 만든 어드민의 users.id. FK 없음(운영 편의 데이터, shader_lab_compositions와 같은 원칙).';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 테이블·기본키·CHECK가 만들어졌는지
-- SELECT conname FROM pg_constraint WHERE conrelid = 'public.asset_presets'::regclass;
--
-- -- ② RLS가 켜졌고 정책이 없는지(= anon/authenticated 접근 불가)
-- SELECT relrowsecurity FROM pg_class WHERE relname = 'asset_presets';
-- SELECT policyname FROM pg_policies WHERE tablename = 'asset_presets'; -- 0행이어야 정상

-- 되돌림 SQL
-- DROP TABLE IF EXISTS public.asset_presets;
