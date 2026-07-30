-- strava_activities에 정규화된 활동 전체를 JSONB로 저장
-- 생성일: 2026-07-30
--
-- 배경: 배지·미션의 누적/기간 조건(주 N회, 연속 N일, 월 N km 등)이 "이번 동기화
-- 배치"만 보고 평가되던 문제를 고치기 위해, 실제 활동 이력 전체를 조회할 수 있는
-- 소스가 필요하다. distance_km 등 요약 컬럼만으론 부족해(속도·고도·시간대 등도
-- 필요) 정규화된 활동 객체 전체를 저장한다.

ALTER TABLE public.strava_activities
  ADD COLUMN IF NOT EXISTS normalized JSONB NOT NULL DEFAULT '{}'::jsonb;
