-- ============================================================
-- Migration 104: 앰비언트(시스템) POI 드랍 재도입 — 3축(카테고리/등급비율/대상컬렉션) 배치 엔진
--
-- 티켓: 20260826_009
--
-- 배경:
--   앰비언트 드랍은 2026-08-25에 전면 제거됐다(티켓 20260825_004, 마이그레이션 100).
--   제거는 기능 결함이 아니었다 — 미들웨어가 /api/cron/*를 307로 가로채 cron 자체가
--   실행되지 않아 source='system' 행이 0건이었을 뿐 기능은 갖춰져 있었다(티켓 20260825_003).
--   그럼에도 사용자가 관측과 무관하게 쓰지 않기로 결정했었고, 이후 드랍엔진 v2·컨텐츠·
--   POI 체계가 성숙한 만큼 이번 재도입은 옛 설계를 복원하지 않고 새로 설계했다.
--
--   구 ambient_drop_policy(마이그레이션 044, 100에서 DROP)는 "전역 상시 커버리지
--   목표치"(POI 수 × 비율 → 부족분 보충) 모델이었다. 신규 ambient_drop_config는
--   "실행마다 카테고리/등급비율/대상컬렉션 3축을 명시값 또는 무작위로 선택해 batch_size개를
--   배치"하는 배치 실행형 모델로, 커버리지 계산이 없다(교차채널 자동 밸런싱은 범위 밖).
--
-- 이 마이그레이션이 하는 일:
--   1. poi_drops.source 컬럼 COMMENT 갱신 — 다시 활성 컬럼이므로 "레거시" 표기 제거
--   2. idx_poi_drops_system_available 부분 인덱스 재생성 (마이그레이션 100에서 DROP됐던 것)
--   3. ambient_drop_config 싱글톤 테이블 신규 생성
--
-- 손대지 않는 살아있는 레거시(그대로 재사용, 이번 마이그레이션 무변경):
--   - assign_random_serial() 트리거의 source='system' 분기 (일련번호 50,001~999,999) — 044
--   - poi_drops_source_consistency CHECK — 044
--   - pickup_drop() RPC — 공유 오브젝트 모델 그대로 재사용(047)
-- ============================================================

-- ----------------------------------------------------------------
-- 1. poi_drops.source 컬럼 COMMENT 갱신 (더 이상 레거시가 아니다)
-- ----------------------------------------------------------------
COMMENT ON COLUMN public.poi_drops.source IS
  '드랍 출처. ''user''=유저가 인벤토리에서 직접 드랍(30일 만료 있음). ''system''=앰비언트(시스템) 배치(만료 없음 — 필요 시 badges.valid_from/valid_until로 대체, 티켓 20260826_009로 재도입). assign_random_serial() 트리거와 poi_drops_source_consistency CHECK가 이 값을 참조한다.';

-- ----------------------------------------------------------------
-- 2. 앰비언트 전용 부분 인덱스 재생성 (100에서 DROP됐던 것 — 조회 패턴 동일해 원상 복구)
-- ----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_poi_drops_system_available
  ON public.poi_drops (poi_id)
  WHERE source = 'system' AND is_available = TRUE;

-- ----------------------------------------------------------------
-- 3. ambient_drop_config — 3축 설정 싱글톤 (drop_policy와 동일 패턴: id=1 고정, RLS 미적용 —
--    service_role 전용, 어드민 API/cron 라우트를 통해서만 접근)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ambient_drop_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- 트리거 — 자동 스케줄 등록 여부(on/off). 실제 실행 시각은 vercel.json의 고정 cron
  -- (Vercel Hobby 플랜 제약으로 일 1회 고정)이며, 이 값은 그 실행이 실제로 배치를
  -- 수행할지를 결정하는 스위치다. 스케줄 시각 자체는 코드 상수로 고정되며 vercel.json과
  -- 반드시 함께 바뀌어야 한다 (jam-web/src/lib/ambient-drop/schedule.ts 참고).
  auto_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  -- 상호 배제 — 자동 스케줄 시각 전후 n분 동안 수동 배포 버튼을 비활성화한다.
  -- auto_enabled=FALSE면 이 값은 무시되고 수동 배포는 항상 가능하다.
  exclusion_window_minutes INTEGER NOT NULL DEFAULT 15 CHECK (exclusion_window_minutes >= 0),

  -- 메타 옵션 — 켜지면 아래 3축 모드를 실행 시점에 전부 'random'으로 취급한다
  -- (저장된 축별 모드 값은 그대로 두고, 실행 시에만 비파괴적으로 오버라이드).
  all_random BOOLEAN NOT NULL DEFAULT FALSE,

  -- 축 1: 카테고리 (poi_categories.slug, 13종). explicit + category_slug IS NULL = "전체".
  category_mode TEXT NOT NULL DEFAULT 'random' CHECK (category_mode IN ('explicit', 'random')),
  category_slug TEXT REFERENCES public.poi_categories(slug) ON UPDATE CASCADE ON DELETE SET NULL,

  -- 축 2: 등급(rarity) 비율. explicit이면 아래 4개 비율(합=1, 앱 레이어에서 검증)로 가중
  -- 추첨하고, random이면 실행 시점에 분포 자체를 무작위로 생성해 그 실행 전체에 적용한다.
  -- 초기값은 100% common — 티켓 §5: 현재 아이템배지 카탈로그가 common 등급만 존재하므로
  -- 운영값은 common 고정. 기능 자체는 전체 등급(rare/legend/mythic)을 지원한다.
  rarity_mode TEXT NOT NULL DEFAULT 'explicit' CHECK (rarity_mode IN ('explicit', 'random')),
  rarity_common NUMERIC(4,3) NOT NULL DEFAULT 1.000,
  rarity_rare NUMERIC(4,3) NOT NULL DEFAULT 0.000,
  rarity_legend NUMERIC(4,3) NOT NULL DEFAULT 0.000,
  rarity_mythic NUMERIC(4,3) NOT NULL DEFAULT 0.000,

  -- 축 3: 대상 컬렉션(item_books). explicit + collection_ids = '{}'(빈 배열) = "전체 컬렉션".
  -- 배열 원소는 item_books.id를 참조하나(Postgres는 배열 FK를 지원하지 않아 앱 레이어에서
  -- 검증), 존재하지 않는 값이 섞여도 실행 시 해당 원소가 매칭되는 배지가 없을 뿐이다.
  collection_mode TEXT NOT NULL DEFAULT 'random' CHECK (collection_mode IN ('explicit', 'random')),
  collection_ids UUID[] NOT NULL DEFAULT '{}',

  -- 배치 실행 규모 — 3축에 속하지 않는 실행 파라미터. 구 ambient_drop_policy의
  -- replenish_batch_size/max_active_per_poi 운영값(POI당 1개, 배치당 30개)을 초기값으로
  -- 참고만 했다 — 커버리지 계산(target_coverage_ratio 등)은 이 재설계에 없다.
  batch_size INTEGER NOT NULL DEFAULT 30 CHECK (batch_size > 0),
  max_active_per_poi INTEGER NOT NULL DEFAULT 1 CHECK (max_active_per_poi > 0),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.ambient_drop_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.ambient_drop_config IS
  '앰비언트(시스템) POI 드랍 배치 설정 싱글톤(id=1). 구 ambient_drop_policy(마이그레이션 044, 100에서 DROP)와 스키마가 다르다 — 전역 커버리지 목표치 모델이 아니라, 실행마다 카테고리/등급비율/대상컬렉션 3축을 명시 또는 무작위로 선택해 batch_size개를 배치하는 모델이다. 티켓 20260826_009.';
