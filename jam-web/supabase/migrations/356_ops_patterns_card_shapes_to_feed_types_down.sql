-- 356 되돌림: 백업 표의 값으로 운영 패턴의 card_shapes를 되돌린다 (티켓 20261122_1100 후속)
-- 백업 표에 있는 패턴만 되돌린다. 그 사이 어드민에서 패턴의 카드 유형을 고쳤다면 그 값도 백업 값(옛 이름)으로 돌아가니 먼저 확인한다.
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션에 반영된다. 백업 표는 지우지 않는다.

BEGIN;

UPDATE public.ops_patterns p
SET card_shapes = b.card_shapes
FROM public.ops_patterns_card_shapes_backup_20261122 b
WHERE p.pattern_no = b.pattern_no;

COMMIT;
