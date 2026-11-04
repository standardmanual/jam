-- 319 되돌림: 미션 6개와 홈피드 카드 6건의 문구를 백업 표의 옛 값으로 복원한다 (티켓 20261104_2314 3-C)
-- 갱신한 칸(미션 설명·달성 조건 문장·조건 데이터, 카드 설명)만 되돌린다. 그 밖의 칸은 건드리지 않는다.
-- 어드민에서 그 뒤에 고친 문구도 옛 값으로 덮이므로, 실행 전에 현재 값을 확인한다.

BEGIN;

UPDATE public.missions m
   SET description = b.snapshot->>'description',
       condition_text = b.snapshot->>'condition_text',
       condition_json = b.snapshot->'condition_json'
  FROM public.mission_copy_backup_20261104 b
 WHERE b.kind = 'mission' AND b.row_id = m.id;

UPDATE public.today_cards c
   SET description = b.snapshot->>'description'
  FROM public.mission_copy_backup_20261104 b
 WHERE b.kind = 'today_card' AND b.row_id = c.id;

COMMIT;

-- 문제가 없다고 확인된 뒤에만 백업 표를 지운다.
-- DROP TABLE public.mission_copy_backup_20261104;
