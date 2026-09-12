-- 전국 지하철/기차역 체크인 배지(이미지 경로 /poi/metro/) 유효기간 일괄 설정
--
-- 배경: category='train_subway'로 태그된 18건만 이전에 2026-09-24로 설정했으나,
-- 실제로는 image_url이 '/badges/poi/metro/%'인 체크인 배지가 전국 927건 존재하고
-- 이 중 909건은 category가 NULL, valid_from도 NULL(항상 활성)이라 지도에 계속
-- 노출되고 있었다. 사용자가 보고한 "기차/지하철 카테고리 배지가 계속 보인다"는
-- 문제의 실제 원인 — category 태그가 없는 909건이 필터 대상에서 누락됐던 것.
--
-- 확인 후 909건 모두 동일하게 2026-09-24부터 상시 노출로 결정(사용자 승인 완료).

update badges
set valid_from = '2026-09-24 00:00:00+00',
    valid_until = null
where type = 'checkin'
  and image_url like '%/poi/metro/%'
  and category is null
  and deleted_at is null;

-- 실행 후 검증: 927건(기존 category='train_subway' 18건 포함) 전부
-- valid_from='2026-09-24 00:00:00+00', valid_until=null 확인.
