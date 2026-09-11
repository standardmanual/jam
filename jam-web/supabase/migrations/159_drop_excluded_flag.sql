-- 159: badges·item_books에 drop_excluded 플래그 추가 (티켓 20260911_2220, 어드민 드랍 정책)
--
-- 배경:
--   어드민에서 특정 아이템배지(또는 컬렉션 전체)를 드랍 후보에서만 제외할 수 있는 기능이
--   없었다. 기존 제외 메커니즘은 `badges.deleted_at`(소프트 삭제 — 보유자 화면·이력에서도
--   제외됨)과 `item_books.is_active`(컬렉션 전체 화면 노출 자체를 끄는 더 강력한 개념)뿐이라,
--   "화면 노출·기존 보유는 그대로 두고 신규 드랍 후보에서만 뺀다"는 좁은 의미의 플래그가
--   필요했다.
--
--   `item_books.is_active`를 재사용하지 않고 별도 컬럼을 신설한 이유(사용자 확정):
--   `is_active=false`는 컬렉션 자체를 화면에서 숨기는 강한 동작이라, 드랍만 잠시 막고
--   나머지는 그대로 노출하고 싶은 운영 시나리오(예: 밸런스 조정 중 임시 드랍 중단)를
--   표현할 수 없다.
--
-- 영향:
--   드랍엔진(`src/lib/drop-engine/index.ts`)의 아이템배지 후보 조회 쿼리에
--   `item_books.drop_excluded = false AND badges.drop_excluded = false` 조건이 추가된다
--   (컬렉션이 true면 소속 배지 전체가, 배지 개별 true면 그 배지 하나만 후보에서 제외).
--   기본값 false이므로 기존 드랍 동작에는 영향이 없다.

alter table public.badges
  add column if not exists drop_excluded boolean not null default false;

alter table public.item_books
  add column if not exists drop_excluded boolean not null default false;

comment on column public.badges.drop_excluded is
  '드랍 후보에서만 제외(좁은 의미). deleted_at(소프트 삭제)·item_books.is_active(컬렉션 전체 노출 차단)와 별개 — 기존 노출/보유는 유지한 채 신규 드랍 후보에서만 뺀다.';

comment on column public.item_books.drop_excluded is
  '컬렉션 소속 배지 전체를 드랍 후보에서만 제외(좁은 의미). is_active(화면 노출 자체 차단)와 별개 — 화면 노출은 유지한 채 신규 드랍 후보에서만 뺀다.';
