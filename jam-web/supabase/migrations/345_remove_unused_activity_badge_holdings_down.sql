-- 345 되돌림: 백업 표(user_activity_badges_backup_20261116)의 행을 user_activity_badges로 되살린다.
-- 티켓 20261116_2321. 백업 표가 있을 때만 쓴다. 이미 같은 id의 행이 있으면 건너뛴다.

BEGIN;

INSERT INTO public.user_activity_badges
  SELECT * FROM public.user_activity_badges_backup_20261116
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- 검증: SELECT count(*) FROM public.user_activity_badges;  -- 299가 되어야 정상
