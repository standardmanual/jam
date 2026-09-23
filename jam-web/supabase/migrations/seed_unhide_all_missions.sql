-- 어드민에 생성되어 있던 숨김(hidden) 상태 미션 전체를 노출 상태로 전환한다.
-- exposure_mode='hidden' -> 'start_date'(기본값)로 변경, starts_at은 모두 과거 시각이므로 즉시 노출 조건을 만족한다.
update public.missions
set exposure_mode = 'start_date'
where exposure_mode = 'hidden';
