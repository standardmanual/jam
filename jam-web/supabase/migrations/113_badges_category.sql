-- ============================================================
-- Migration 113: 체크인 배지 카테고리 컬럼 추가
--
-- 티켓: 20260830_1344
--
-- 배경(요약 — 티켓 문서 참고):
--   체크인 배지는 "어느 지점에 연결됐는가"(poi.linked_badge_id)로만 판정되고, 배지 자체에는
--   분류용 카테고리 컬럼이 없었다. 어드민이 체크인 배지 저작 화면에서 이 배지가 어떤 지점
--   계열(등산/자전거길/공원 등)에 속하는지 직접 태깅할 수 있게 한다.
--
-- 값 집합 결정:
--   기존 poi_categories 테이블(slug/label, 어드민이 자유롭게 관리)을 그대로 재사용한다.
--   별도 값 집합을 새로 만들지 않은 이유 — 이미 지점 카테고리 개념이 존재하고 어드민이
--   관리하는 단일 소스이므로, 배지 카테고리도 같은 값 집합을 쓰는 것이 "이 체크인 배지가
--   어떤 지점 계열에 속하는지 태깅한다"는 의미에 맞고 신규 관리 UI도 필요 없다.
--   단, poi.linked_badge_id(N:M, 배지가 여러 지점에 연결 가능)와는 별개 개념이다 — poi.category는
--   "실제 연결된 지점들의 카테고리"이고 badges.category는 "배지 자체에 어드민이 붙인 대표
--   카테고리 태그"다. 서로 다른 지점 카테고리로 연결돼도(또는 하나도 연결 안 돼도) 무관하게
--   badges.category는 독립적으로 설정할 수 있다.
--
-- 이 마이그레이션이 하는 일:
--   badges 테이블에 nullable 컬럼 category(text) 추가, poi_categories(slug) FK 연결.
--   기존 행은 전부 NULL로 유지되며(체크인 아닌 배지 포함), 서비스 로직(배지 발급 판정)에는
--   전혀 관여하지 않는 순수 분류/표시용 필드다. FK는 ON DELETE SET NULL — 카테고리가
--   삭제돼도 배지 자체가 막히지 않는다.
-- ============================================================

ALTER TABLE public.badges ADD COLUMN category TEXT;

ALTER TABLE public.badges
  ADD CONSTRAINT badges_category_fkey FOREIGN KEY (category)
  REFERENCES public.poi_categories(slug) ON UPDATE CASCADE ON DELETE SET NULL;
