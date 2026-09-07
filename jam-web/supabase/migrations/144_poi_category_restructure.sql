-- 144: POI 카테고리 체계 재정리 (티켓 20260907_1243)
--
-- 선행 조건: 마이그레이션 143(poi.naver_category/naver_keyword/pending_review,
--   poi_categories.requires_review, 'unassigned' 카테고리 시드)이 이미 적용돼 있어야 한다.
--
-- 배경:
--   poi_categories.keywords(text[])는 카테고리 하나에 지역 범위(구+동 고정)가 일괄
--   적용돼, 키워드마다 필요한 지역 단위가 다른 경우를 표현하지 못했다(관공서의 주민센터는
--   동 단위, 구청은 구 단위, 시청은 시/도 단위라야 결과가 나옴). 또한 "자동수집은 하되
--   지도에는 노출하지 않는다"를 표현할 컬럼이 없었다.
--   실측(2026-09-07)으로 확인된 사실 — 산(mountain) 자동수집 32그리드 검색 0건(847건 전부
--   수동 등록), 기차/지하철(train_subway) 967건 중 자동수집 산출 40건뿐, 대중교통(transit)
--   그리드당 수확률 0.09로 저조, 관광명소(tourist_attraction) 기존 97건 중 새 키워드 기준
--   부합 3건뿐(35건 공원류·59건 판정불가). 상세 근거·최종 확정 표는 티켓 문서 참고.
--
-- 이 마이그레이션이 하는 일:
--   1) poi_categories.keywords를 text[] → jsonb로 전환. 각 원소
--      {"keyword": string, "scope": "dong"|"gu"|"sido"} — scope는 이 키워드로 네이버
--      지역검색 시 역지오코딩 결과 중 어느 지역 단위까지 접두어로 쓸지를 뜻한다
--      (src/lib/poi/naver.ts buildRegionPrefix, src/lib/poi/reverse-geocode.ts 참고).
--      기존 텍스트 키워드 내용은 이번에 카테고리별로 전면 재정의되므로(아래 4번) 변환 없이
--      컬럼을 새로 만든다.
--   2) poi_categories.display_on_map(boolean, default true) 추가 — false면 자동수집은
--      계속하되 지도에는 노출하지 않는다(병원·약국처럼 방문 목적이 사적인 카테고리).
--   3) 신규 카테고리 stadium(경기장)·school(학교)·route(자전거길/트레일, bike_route+trail
--      통합) 추가.
--   4) 살아남는 파이프라인 카테고리(government/convenience/tourist_attraction/nature/
--      stadium/school/park/hospital/pharmacy/food) 전부 tier=1로 통일 — 코드의
--      tier===1||tier===2 필터(categories.ts)는 그대로 두되 데이터로 티어 분기를
--      무력화한다(코드 변경 없이 해소, tier 컬럼 자체는 제거하지 않음).
--   5) mountain·train_subway는 pipeline_linked=false로 전환(자동수집 중단). 기존 POI는
--      건드리지 않는다 — 활성 유지, 재분류 대상에서도 제외(재분류는 별도 스크립트
--      scripts/reclassify-poi-categories.ts, 이 마이그레이션 범위 밖).
--   6) transit(대중교통) 카테고리와 기존 POI 16건을 완전히 삭제한다.
--   7) other(기타) 카테고리 삭제 — 기존 POI 3건은 unassigned로 이관 후 카테고리 삭제.
--   8) bike_route·trail 카테고리를 route로 통합 — 기존 POI 0건으로 파악됐으나(티켓 실측),
--      혹시 남아있을 경우를 대비해 삭제 전 route로 재배정하는 안전장치를 둔다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.
--
-- ⚠️ 실행 전 반드시 아래 3개 쿼리로 사전 영향 범위를 확인할 것 (이 역할에는 DB 조회
--    도구가 없어 작성 시점에 직접 확인하지 못했다 — 완료 보고 alerts 참고):
--
--   -- (a) transit 카테고리 POI를 참조하는 활동배지 발급 이력 — user_activity_badges.
--   --     triggered_by_poi_id는 ON DELETE NO ACTION이라 값이 남아있으면 6번 DELETE가
--   --     FK 위반으로 그대로 실패한다(src/lib/admin/poi-references.ts에 문서화된 위험).
--   --     이 마이그레이션은 DELETE 전에 이 참조를 NULL로 비워 방어한다(아래 6번 참고,
--   --     이력 행 자체는 삭제되지 않고 "어느 지점이었는지"만 비워진다).
--   SELECT count(*) FROM public.user_activity_badges uab
--     JOIN public.poi p ON p.id = uab.triggered_by_poi_id WHERE p.category = 'transit';
--
--   -- (b) 앰비언트 드랍 설정(싱글톤)이 삭제 대상 카테고리를 명시 타깃으로 쓰고 있는지 —
--   --     ambient_drop_config.category_slug는 ON DELETE SET NULL이라 에러 없이 조용히
--   --     NULL이 된다. category_mode='explicit'인 상태에서 NULL이 되면 "특정 카테고리만"이
--   --     아니라 "전체 카테고리 대상"으로 동작이 바뀐다(migrations/104 주석: explicit +
--   --     category_slug IS NULL = "전체") — 삭제가 아니라 동작 범위가 조용히 넓어지는
--   --     쪽이라 사전 확인 권장.
--   SELECT id, category_mode, category_slug FROM public.ambient_drop_config WHERE id = 1;
--
--   -- (c) 참고용 — badges.category도 같은 FK(ON DELETE SET NULL)이지만 이 컬럼은
--   --     migrations/113 설계 시점부터 "카테고리가 삭제돼도 배지 자체는 막히지 않는다"는
--   --     전제로 만들어진 순수 표시용 태그라 영향이 낮다(서비스 로직 미관여).
--   SELECT id, name, category FROM public.badges WHERE category IN ('transit', 'other', 'bike_route', 'trail');
--
-- 실행 순서: 코드 배포보다 먼저 실행해야 한다 — 배포된 코드가 keywords를 jsonb 배열로
--    읽고 poi_categories.display_on_map을 조회하므로, 컬럼이 없으면 조회가 깨진다.
--
-- 2026-09-07 실행 시 오케스트레이터가 추가한 보정 2건(게이트 리뷰 지적 + 실행 전 백업
-- 관례 반영) — 원안(jam-developer 작성분) 대비 달라진 부분:
--   0) poi_backup_144 스냅샷을 맨 앞에서 생성(아래 "백업 권장" 안내를 실제 실행 스텝으로 승격)
--   11) poi.category의 DEFAULT가 삭제되는 'other'를 계속 가리키던 문제를 마지막에 수정
--       (게이트 리뷰: 현재 모든 INSERT 경로가 category를 명시해 즉시 회귀는 없으나,
--       향후 생략 INSERT가 추가되면 FK 위반이 이 마이그레이션과 무관해 보이는 에러로
--       나타난다 — 원인 추적 난이도를 낮추기 위해 선제 수정)

-- ----------------------------------------------------------------
-- 0. 실행 전 백업 (transit 16건 하드삭제·other 3건 이관 대비 스냅샷)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.poi_backup_144 AS
SELECT * FROM public.poi WHERE category IN ('transit', 'other');

-- ----------------------------------------------------------------
-- 1. display_on_map 컬럼 추가
-- ----------------------------------------------------------------
ALTER TABLE public.poi_categories
  ADD COLUMN IF NOT EXISTS display_on_map BOOLEAN NOT NULL DEFAULT true;

-- ----------------------------------------------------------------
-- 2. keywords: text[] → jsonb 전환
--    (카테고리별 실제 값은 4번에서 전면 재정의하므로 USING 변환 없이 새로 만든다)
-- ----------------------------------------------------------------
ALTER TABLE public.poi_categories DROP COLUMN keywords;
ALTER TABLE public.poi_categories ADD COLUMN keywords JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.poi_categories
  ADD CONSTRAINT poi_categories_keywords_is_array CHECK (jsonb_typeof(keywords) = 'array');

-- ----------------------------------------------------------------
-- 3. 신규 카테고리 추가 (stadium·school·route) — 최종 상태로 바로 INSERT
-- ----------------------------------------------------------------
INSERT INTO public.poi_categories (slug, label, pipeline_linked, tier, display_on_map, keywords) VALUES
  ('stadium', '경기장', true, 1, true, '[
     {"keyword": "경기장", "scope": "gu"},
     {"keyword": "종합운동장", "scope": "gu"}
   ]'::jsonb),
  ('school', '학교', true, 1, true, '[
     {"keyword": "대학교", "scope": "gu"}
   ]'::jsonb),
  ('route', '자전거길/트레일', false, NULL, false, '[]'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------
-- 4. 살아남는 기존 파이프라인 카테고리 — 키워드 전면 재정의 + tier=1 통일
-- ----------------------------------------------------------------
UPDATE public.poi_categories SET
  pipeline_linked = true, tier = 1, display_on_map = true,
  keywords = '[
    {"keyword": "주민센터", "scope": "dong"},
    {"keyword": "구청", "scope": "gu"},
    {"keyword": "군청", "scope": "gu"},
    {"keyword": "시청", "scope": "sido"}
  ]'::jsonb
WHERE slug = 'government';

UPDATE public.poi_categories SET
  pipeline_linked = true, tier = 1, display_on_map = true,
  keywords = '[
    {"keyword": "편의점", "scope": "dong"},
    {"keyword": "마트", "scope": "dong"},
    {"keyword": "시장", "scope": "dong"}
  ]'::jsonb
WHERE slug = 'convenience';

UPDATE public.poi_categories SET
  pipeline_linked = true, tier = 1, display_on_map = true,
  keywords = '[
    {"keyword": "박물관", "scope": "gu"},
    {"keyword": "미술관", "scope": "gu"},
    {"keyword": "전망대", "scope": "gu"}
  ]'::jsonb
WHERE slug = 'tourist_attraction';

UPDATE public.poi_categories SET
  pipeline_linked = true, tier = 1, display_on_map = true,
  keywords = '[
    {"keyword": "국립공원", "scope": "sido"},
    {"keyword": "자연휴양림", "scope": "sido"},
    {"keyword": "해수욕장", "scope": "sido"},
    {"keyword": "수목원", "scope": "sido"}
  ]'::jsonb
WHERE slug = 'nature';

-- park/hospital/pharmacy/food — 자동수집은 유지하되 지도 비노출(display_on_map=false)
UPDATE public.poi_categories SET
  pipeline_linked = true, tier = 1, display_on_map = false,
  keywords = '[{"keyword": "공원", "scope": "dong"}]'::jsonb
WHERE slug = 'park';

UPDATE public.poi_categories SET
  pipeline_linked = true, tier = 1, display_on_map = false,
  keywords = '[{"keyword": "병원", "scope": "dong"}]'::jsonb
WHERE slug = 'hospital';

UPDATE public.poi_categories SET
  pipeline_linked = true, tier = 1, display_on_map = false,
  keywords = '[{"keyword": "약국", "scope": "dong"}]'::jsonb
WHERE slug = 'pharmacy';

UPDATE public.poi_categories SET
  pipeline_linked = true, tier = 1, display_on_map = false,
  keywords = '[
    {"keyword": "카페", "scope": "dong"},
    {"keyword": "음식점", "scope": "dong"}
  ]'::jsonb
WHERE slug = 'food';

-- ----------------------------------------------------------------
-- 5. mountain·train_subway — 자동수집 중단(pipeline_linked=false). 기존 POI는 손대지
--    않는다(활성 유지, 지도 노출 유지, 재분류 대상 아님).
-- ----------------------------------------------------------------
UPDATE public.poi_categories SET
  pipeline_linked = false, tier = NULL, keywords = '[]'::jsonb, display_on_map = true
WHERE slug IN ('mountain', 'train_subway');

-- ----------------------------------------------------------------
-- 6. transit(대중교통) 완전 삭제 — 카테고리 + 기존 POI 16건
--    FK 순서: user_activity_badges 참조 먼저 해제(NO ACTION이라 안 하면 DELETE가 실패) →
--    poi_drops/poi_blocks/poi_views/user_checkin_badge_earns는 ON DELETE CASCADE로 함께
--    삭제되고 custody_events.poi_id는 ON DELETE SET NULL로 이력만 남는다
--    (src/lib/admin/poi-references.ts 실측 근거, 2026-09-07).
-- ----------------------------------------------------------------
UPDATE public.user_activity_badges SET triggered_by_poi_id = NULL
WHERE triggered_by_poi_id IN (SELECT id FROM public.poi WHERE category = 'transit');

DELETE FROM public.poi WHERE category = 'transit';

-- ----------------------------------------------------------------
-- 7. other(기타) 삭제 — 기존 POI는 unassigned로 이관 후 카테고리 삭제
-- ----------------------------------------------------------------
UPDATE public.poi SET category = 'unassigned' WHERE category = 'other';

-- ----------------------------------------------------------------
-- 8. bike_route·trail → route 통합 — 안전장치로 재배정 UPDATE 먼저(실측 0건이나 방어적으로)
-- ----------------------------------------------------------------
UPDATE public.poi SET category = 'route' WHERE category IN ('bike_route', 'trail');

-- ----------------------------------------------------------------
-- 9. 폐기 카테고리 행 삭제 (6·7·8에서 참조 POI를 모두 비운 뒤라야 FK RESTRICT를 통과한다)
-- ----------------------------------------------------------------
DELETE FROM public.poi_categories WHERE slug IN ('transit', 'other', 'bike_route', 'trail');

-- ----------------------------------------------------------------
-- 10. unassigned(미분류·거부됨, 마이그레이션 143 시드) — display_on_map 기본값(true)을
--     비노출로 덮어쓴다.
-- ----------------------------------------------------------------
UPDATE public.poi_categories SET display_on_map = false WHERE slug = 'unassigned';

-- ----------------------------------------------------------------
-- 11. poi.category DEFAULT 보정 (게이트 리뷰 지적 — 위 헤더 주석 참고)
-- ----------------------------------------------------------------
ALTER TABLE public.poi ALTER COLUMN category SET DEFAULT 'unassigned';

-- 🧪 적용 후 검증
--   SELECT slug, label, pipeline_linked, tier, display_on_map, keywords
--     FROM public.poi_categories ORDER BY slug;
--   -- 14개(government/convenience/tourist_attraction/nature/stadium/school/park/hospital/
--   -- pharmacy/food/mountain/train_subway/route/unassigned)만 남아야 한다.
--   SELECT count(*) FROM public.poi WHERE category = 'transit'; -- 0
--   SELECT count(*) FROM public.poi WHERE category = 'other';   -- 0
--   SELECT count(*) FROM public.poi WHERE category IN ('bike_route', 'trail'); -- 0

-- ↩️ 롤백 안내
--   스키마 되돌리기(컬럼/제약)는 아래 DDL로 가능하다. 다만 **6·7번에서 삭제·이관된 POI
--   데이터는 이 롤백으로 복구되지 않는다** — transit 16건은 하드 삭제라 사전 백업 없이는
--   되살릴 수 없고, other 3건은 category만 'unassigned'로 바뀐 것이라 원한다면
--   `UPDATE public.poi SET category = 'other' WHERE ...`로 수동 복구는 가능하나 어떤 행이
--   원래 'other'였는지는 이 마이그레이션이 별도로 기록하지 않는다(실행 전 스냅샷 백업 권장:
--   `CREATE TABLE poi_backup_144 AS SELECT * FROM public.poi WHERE category IN ('transit','other');`).
--     ALTER TABLE public.poi_categories DROP CONSTRAINT IF EXISTS poi_categories_keywords_is_array;
--     ALTER TABLE public.poi_categories DROP COLUMN IF EXISTS display_on_map;
--     -- keywords를 text[]로 되돌리려면 컬럼을 다시 만들어야 한다(신규 카테고리 3종은 값이 없었으므로 무손실 롤백 불가):
--     -- ALTER TABLE public.poi_categories DROP COLUMN keywords;
--     -- ALTER TABLE public.poi_categories ADD COLUMN keywords TEXT[] NOT NULL DEFAULT '{}';
--     DELETE FROM public.poi_categories WHERE slug IN ('stadium', 'school', 'route');
