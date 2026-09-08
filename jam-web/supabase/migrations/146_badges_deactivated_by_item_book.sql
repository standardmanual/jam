-- 146: badges.deactivated_by_item_book_id 추가 (티켓 20260908_2129 2차)
--
-- 배경:
--   컬렉션(item_books) 비활성화 시 소속 아이템배지를 연쇄로 소프트삭제한다
--   (cascadeDeactivateItemBookBadges, 20260823_004). 그런데 컬렉션을 다시 활성화할 때는
--   "어떤 배지가 이 컬렉션 때문에 죽었는지"와 "개별 사유로 이미 죽어 있었는지"를 구분할 방법이
--   없어 재활성화 캐스케이드를 의도적으로 넣지 않았다. 사용자가 "자동 활성화 해"로 캐스케이드
--   활성화를 확정하면서(티켓 20260908_2129 2차), 그 구분을 이 컬럼으로 기록해 해소한다.
--
-- 이 마이그레이션이 하는 일:
--   badges 테이블에 deactivated_by_item_book_id(uuid, nullable, item_books(id) 참조) 추가.
--   - 컬렉션 캐스케이드 비활성화가 이 배지를 죽였으면 그 컬렉션 id를 기록.
--   - 개별 사유로 비활성화됐거나 애초에 활성 상태면 NULL.
--   - 컬렉션이 삭제되면(하드 삭제) 이 컬럼도 함께 NULL로 정리한다(ON DELETE SET NULL) — 이미
--     비활성화된 배지의 deleted_at 자체는 건드리지 않고, 되돌릴 대상 추적 값만 정리한다.
--
-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라
--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.

alter table public.badges
  add column deactivated_by_item_book_id uuid null references public.item_books(id) on delete set null;

comment on column public.badges.deactivated_by_item_book_id is
  '컬렉션(item_books) 캐스케이드 비활성화로 이 배지가 소프트삭제됐다면 그 컬렉션 id. 개별 사유로
   비활성화됐거나 활성 상태면 NULL. 컬렉션 재활성화 캐스케이드가 "이 컬렉션이 죽인 배지만" 되살릴
   때 판별 기준으로 쓴다(티켓 20260908_2129 2차).';

create index if not exists idx_badges_deactivated_by_item_book_id
  on public.badges (deactivated_by_item_book_id)
  where deactivated_by_item_book_id is not null;
