-- Phase 16: POI 배지 타입 추가
-- badge_type ENUM에 값 추가는 트랜잭션 내 다른 DDL과 함께 실행 불가(Postgres 제약)라
-- user_poi_badge_earns 테이블 생성과 별도 파일로 분리한다.

ALTER TYPE public.badge_type ADD VALUE IF NOT EXISTS 'poi';
