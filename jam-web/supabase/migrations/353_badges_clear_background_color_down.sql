-- 353 되돌림: 지운 배경색 10건을 지우기 전 값으로 되돌린다 (티켓 20261122_1221)
-- 값은 2026-11-22 실행 직전에 읽은 그대로다.
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다.

BEGIN;

UPDATE public.badges AS b
SET background_color = v.color
FROM (VALUES
  ('a4b93ede-0c88-4b7c-b80d-a42454b05a1b'::uuid, '#1a1a1a'), -- 강풍에 찢긴 깃발
  ('89588aa8-f6d7-46a5-90dc-cac54e4ba38f'::uuid, '#1a1a1a'), -- 고요한 태풍의 눈
  ('730a9ad1-163a-40b6-a8cc-d26c1abaf2e9'::uuid, '#1a1a1a'), -- 꺾인 나뭇가지
  ('3238df42-af16-4945-a3fa-7c37ca20c942'::uuid, '#1a1a1a'), -- 돌풍의 파동
  ('8ce783b3-7356-4b5e-bdb0-5001ba14d952'::uuid, '#1a1a1a'), -- 뒤집힌 우산 살대
  ('dcbdb3c6-1e2d-4801-885a-3fd8bd4460e8'::uuid, '#1a1a1a'), -- 바람에 날아온 신문지
  ('ec08641f-508a-409a-a152-641c6f035ebd'::uuid, '#b3aaa4'), -- 비바람에 꺾인 우비
  ('960d2a4e-caab-4cfd-a0f6-46e2fc9ade35'::uuid, '#1a1a1a'), -- 짠 내 나는 비구름
  ('bc4cf4de-40f3-4ea2-917b-a5a8a6833cc0'::uuid, '#1a1a1a'), -- 태풍 경보 재난문자
  ('eef99a08-1b86-4d3a-90ea-36e2634acdb7'::uuid, '#ebd7c6')  -- 훔쳐간 핫도그 소시지
) AS v(id, color)
WHERE b.id = v.id;

COMMIT;
