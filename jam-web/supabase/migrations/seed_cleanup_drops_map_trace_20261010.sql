-- 드랍 지도 화면을 피그마로 옮기는 작업(2026-10-10)에서 위치를 대체해 /drops를 열었을 때
-- 서비스가 자체적으로 남긴 흔적을 지운다. 사용자 요청(2026-10-10)에 따라 카리나가 실행했다.
--
-- 대상(작업 시간대 2026-10-10 10:00 UTC 이후, 아래 조건에 정확히 일치하는 행만):
--   1) poi_search_cache 24행 : 격자 37.548_127.045 / 37.546_127.043 / 37.538_126.816 의 장소 검색 캐시
--   2) poi 1행               : 피클박스 테니스포레(bce170db-4c85-441a-a5d3-9215299e2f86)
--                              자동 등록 행, is_active=false · pending_review=true 라 서비스에 노출된 적 없음
--   3) poi_views 1행         : 사용자(god)의 조회 기록 6ed1eabb-29f8-496d-947a-e6ee05840ed7
--
-- 실행 전 점검(읽기 전용, 모두 통과):
--   - 위 poi 를 참조하는 custody_events / poi_blocks / poi_drops / poi_views / user_activity_badges /
--     user_checkin_badge_earns 행은 0건
--   - 같은 시간대에 위 3개 격자가 아닌 poi_search_cache 행은 0건
--   - 삭제 건수는 24 / 1 / 1 이어야 한다. 다르면 이 파일을 적용하지 않는다.

with c as (
  delete from public.poi_search_cache
  where grid_key in ('37.548_127.045', '37.546_127.043', '37.538_126.816')
    and searched_at >= '2026-10-10 10:00:00+00'
  returning 1
), v as (
  delete from public.poi_views
  where id = '6ed1eabb-29f8-496d-947a-e6ee05840ed7'
    and user_id = '3649ed39-2be2-402e-82ae-41e0cd328105'
  returning 1
), p as (
  delete from public.poi
  where id = 'bce170db-4c85-441a-a5d3-9215299e2f86'
    and name = '피클박스 테니스포레'
    and created_at >= '2026-10-10 10:00:00+00'
    and is_active = false
  returning 1
)
select (select count(*) from c) as cache_deleted,
       (select count(*) from v) as views_deleted,
       (select count(*) from p) as poi_deleted;

-- 되돌림 SQL
-- poi_search_cache 는 서비스가 지도를 열 때 자동으로 다시 채우는 캐시라 복원하지 않는다.
-- insert into public.poi (id, name, osm_id, category, latitude, naver_id, poi_tier, is_active, longitude, created_at, naver_keyword, radius_meters, naver_category, pending_review, linked_badge_id)
-- values ('bce170db-4c85-441a-a5d3-9215299e2f86', '피클박스 테니스포레', null, 'stadium', 37.5457261, 'syn:피클박스 테니스포레_37.54573_127.04233', 2, false, 127.0423333, '2026-10-10T10:55:27.100834+00:00', '경기장', 500, '스포츠,오락>스포츠시설', true, null);
-- insert into public.poi_views (id, poi_id, user_id, viewed_at, viewed_on)
-- values ('6ed1eabb-29f8-496d-947a-e6ee05840ed7', '45c552cc-60d4-466d-a1f3-d69a3853efa6', '3649ed39-2be2-402e-82ae-41e0cd328105', '2026-10-10T11:04:47.973+00:00', '2026-10-10');
