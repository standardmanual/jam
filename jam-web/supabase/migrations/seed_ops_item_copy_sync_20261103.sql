-- 티켓 20261103_1446: 예약됨 항목의 문안 수정 양식이 오늘 문구에서 시작하도록 상황판 항목의 수정본(edited.copy)을 맞춘다.
-- 2026-11-03에 today_cards·missions의 문구를 SQL로 고쳤지만 ops_bundle_items는 제출 당시 문구(original)를 그대로 보여 준다.
-- 제출 원본(original)은 건드리지 않고, 게재 중·예약됨인 카드·미션 항목의 edited.copy에 행의 현재 문구를 채운다.
-- 원본 copy에 있는 키만 채운다(카드: title·subtitle·description, 미션: title·description·condition_text).
-- 대상은 edited.copy가 아직 없고 행의 문구가 원본과 다른 항목 20건이다. 되돌림은 _down.sql.
do $$
declare
  n int;
begin
  with t as (
    select i.id,
      (case when i.kind = 'home_feed_card' then
        (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
           from (values ('title', c.title), ('subtitle', c.subtitle), ('description', c.description)) x(k, v)
          where i.original->'copy' ? k and v is not null)
      else
        (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
           from (values ('title', m.title), ('description', m.description), ('condition_text', m.condition_text)) x(k, v)
          where i.original->'copy' ? k and v is not null)
      end) as row_copy
    from ops_bundle_items i
    left join today_cards c on i.kind = 'home_feed_card' and c.id = (i.created_resource->>'today_card_id')::uuid
    left join missions m on i.kind = 'mission' and m.id = (i.created_resource->>'mission_id')::uuid
    where i.status in ('scheduled', 'live')
      and i.kind in ('home_feed_card', 'mission')
      and not (coalesce(i.edited, '{}'::jsonb) ? 'copy')
  )
  update ops_bundle_items i
     set edited = coalesce(i.edited, '{}'::jsonb) || jsonb_build_object('copy', (i.original->'copy') || t.row_copy)
    from t
   where t.id = i.id
     and ((i.original->'copy') || t.row_copy) is distinct from (i.original->'copy');
  get diagnostics n = row_count;
  if n <> 20 then
    raise exception '대상이 20건이 아니에요: %건', n;
  end if;
end $$;
