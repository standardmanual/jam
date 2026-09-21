-- 티켓 20260921_2129: 트라이브 "JAM! 레벨 0" 삭제
--
-- 배경: 티켓 20260911_2119에서 만든 예외 트라이브다. 삭제 시점에 DB를 조회하니 같은 이름의
-- 컬렉션(item_books)은 이미 없었고, 이 트라이브를 참조하는 유저·드랍 상태·인접 관계도 0건이었다.
-- 배지는 6건(희귀 4·에픽 2)만 남아 있었으며 전부 item_book_id가 NULL이었다.
--
-- 영향: badges.tribe_id는 ON DELETE SET NULL이라 남은 배지 6건의 tribe_id가 NULL이 된다.
-- 배지 행 자체는 지우지 않는다(이번 범위는 트라이브만이다).
--
-- 삭제 대상 배지 6건의 id (롤백 시 tribe_id 복원용)
--   5c08d83d-6c81-4bd0-91d6-da9f66cbb46b  5일 연속 습관 런
--   2d087fdc-4e42-436c-ad62-b8d94a980524  5일 연속 출석 워킹
--   65b17cb6-92b3-4f30-8ca9-9d55e2cdde7f  더블 데일리 런
--   8a5ec2d0-d2e2-4130-95f2-f49f19075b4b  모닝 & 이브닝
--   2f120cff-8b7a-49e6-b532-4fdad3ce3d9d  주간 5일 꾸준 러너
--   8887d669-8f47-4e02-b46a-0148a3ba67ab  주간 꾸준함 마스터
--
-- 2026-09-21 사용자 지시("트라이브를 삭제해") 후 오케스트레이터가 Supabase(jam-prod, project_id
-- ceehnkzdbecxwzxrhhns)에 직접 실행했다. staging·프로덕션 공용 단일 DB라 즉시 양쪽에 반영된다.

BEGIN;

DELETE FROM public.tribes
WHERE id = '187a57e5-4b7c-4eef-934a-78804cb31582'
  AND name = 'JAM! 레벨 0';

COMMIT;

-- ── 검증 쿼리 ───────────────────────────────────────────────────────────────
-- SELECT count(*) FROM public.tribes WHERE name = 'JAM! 레벨 0';   -- 0
-- SELECT count(*) FROM public.tribes;                              -- 10
-- SELECT count(*) FROM public.badges
--  WHERE id IN ('5c08d83d-6c81-4bd0-91d6-da9f66cbb46b','2d087fdc-4e42-436c-ad62-b8d94a980524',
--               '65b17cb6-92b3-4f30-8ca9-9d55e2cdde7f','8a5ec2d0-d2e2-4130-95f2-f49f19075b4b',
--               '2f120cff-8b7a-49e6-b532-4fdad3ce3d9d','8887d669-8f47-4e02-b46a-0148a3ba67ab')
--    AND tribe_id IS NULL;                                         -- 6

-- ↩️ 롤백 (삭제 직전 원본 행을 그대로 복원)
--    INSERT INTO public.tribes (id, name, description, drop_weight, is_active, sort_order, created_at)
--    VALUES ('187a57e5-4b7c-4eef-934a-78804cb31582', 'JAM! 레벨 0', 'JAM! 비밀의 시작. 레벨 0',
--            1, true, 11, '2026-09-11T12:49:18.093645+00:00');
--    UPDATE public.badges SET tribe_id = '187a57e5-4b7c-4eef-934a-78804cb31582'
--     WHERE id IN ('5c08d83d-6c81-4bd0-91d6-da9f66cbb46b','2d087fdc-4e42-436c-ad62-b8d94a980524',
--                  '65b17cb6-92b3-4f30-8ca9-9d55e2cdde7f','8a5ec2d0-d2e2-4130-95f2-f49f19075b4b',
--                  '2f120cff-8b7a-49e6-b532-4fdad3ce3d9d','8887d669-8f47-4e02-b46a-0148a3ba67ab');
