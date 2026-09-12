-- 166: badges.show_on_map 컬럼 신설 — 체크인 배지의 지도 마커 노출 활성/비활성
--      (티켓 20260912_1053)
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- 배경:
--   어드민 배지 관리는 이미 `type='checkin'` 배지의 생성·조회·수정을 지원한다(POI 1:1
--   연결, 지점 카테고리 선택 등). 다만 체크인 배지가 지도 드롭메뉴 마커로 노출될지 여부를
--   관리자가 제어할 방법이 없었다 — `/api/checkin-badges`는 `poi.is_active`와
--   `badges.deleted_at`만으로 걸러, "마커 표시" 자체를 껐다 켰다 할 옵션이 존재하지 않았다.
--
-- 값 집합: boolean, 기본값 true(기존 배지는 전부 지금처럼 계속 노출).
--   `type='checkin'` 배지에만 의미 있는 옵션이나, 다른 타입에도 영향이 없도록 컬럼 자체는
--   전 타입 공통으로 둔다(마이그레이션 156의 `admin_category` 신설 선례와 동일 패턴).
--
-- 실행 순서: 코드 배포와 무관하게 먼저 실행해도 안전하다. `NOT NULL DEFAULT true`로 추가해
--   기존 행에도 즉시 true가 채워진다.
--
-- 재실행 가능(idempotent): ADD COLUMN IF NOT EXISTS 패턴.

BEGIN;

ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS show_on_map BOOLEAN NOT NULL DEFAULT true;

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 컬럼이 생겼고 기본값이 true인지
-- SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'badges' AND column_name = 'show_on_map';
--
-- -- ② 기존 체크인 배지가 전부 true로 채워졌는지
-- SELECT count(*) FILTER (WHERE show_on_map = true) AS shown,
--        count(*) FILTER (WHERE show_on_map = false) AS hidden
--   FROM public.badges WHERE type = 'checkin';

-- ↩️ 롤백 DDL
--   ALTER TABLE public.badges DROP COLUMN IF EXISTS show_on_map;
--   -- 다른 컬럼·FK에 의존성이 없는 완전히 독립된 신규 컬럼이라 안전하게 되돌릴 수 있다.
