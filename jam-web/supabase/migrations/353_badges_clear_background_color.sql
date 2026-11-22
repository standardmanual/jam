-- 353: 배경색이 지정된 아이템 배지 10개의 background_color를 지운다 (티켓 20261122_1221, 사용자 지시 2026-11-22)
-- 배지 상세가 티켓 디자인으로 바뀌면서 전체 화면 배경 테마 레이어를 그리지 않는다. 배경색 값이 남아 있으면
-- 다른 화면(드랍 시트·잠긴 개체 상세 등)에서 배경 테마로 읽히므로 값 자체를 지운다.
-- 되돌림은 353_badges_clear_background_color_down.sql(지우기 전 값 10건을 그대로 적어 두었다).
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다.

BEGIN;

UPDATE public.badges
SET background_color = NULL
WHERE background_color IS NOT NULL
  AND deleted_at IS NULL
  AND id IN (
    'a4b93ede-0c88-4b7c-b80d-a42454b05a1b', -- 강풍에 찢긴 깃발
    '89588aa8-f6d7-46a5-90dc-cac54e4ba38f', -- 고요한 태풍의 눈
    '730a9ad1-163a-40b6-a8cc-d26c1abaf2e9', -- 꺾인 나뭇가지
    '3238df42-af16-4945-a3fa-7c37ca20c942', -- 돌풍의 파동
    '8ce783b3-7356-4b5e-bdb0-5001ba14d952', -- 뒤집힌 우산 살대
    'dcbdb3c6-1e2d-4801-885a-3fd8bd4460e8', -- 바람에 날아온 신문지
    'ec08641f-508a-409a-a152-641c6f035ebd', -- 비바람에 꺾인 우비
    '960d2a4e-caab-4cfd-a0f6-46e2fc9ade35', -- 짠 내 나는 비구름
    'bc4cf4de-40f3-4ea2-917b-a5a8a6833cc0', -- 태풍 경보 재난문자
    'eef99a08-1b86-4d3a-90ea-36e2634acdb7'  -- 훔쳐간 핫도그 소시지
  );

COMMIT;
