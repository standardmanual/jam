-- 336 되돌림: 제약에 'individual'을 다시 허용한다 (데이터는 바뀌지 않았으므로 원상 복구는 제약만이다)
ALTER TABLE public.missions DROP CONSTRAINT IF EXISTS missions_status_display_type_check;
ALTER TABLE public.missions
  ADD CONSTRAINT missions_status_display_type_check
  CHECK (status_display_type IN ('ranking', 'achievement', 'individual'));
