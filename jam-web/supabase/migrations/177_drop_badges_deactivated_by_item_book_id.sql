-- [상태: 2026-09-21 작성, DB 미적용] 적용은 티켓 20260914_1751의 「남은 작업」 1번을 따른다.
-- 177: badges.deactivated_by_item_book_id 컬럼 삭제 (티켓 20260914_1751)
--
-- 배경:
--   마이그레이션 146이 추가한 이 컬럼은 컬렉션 캐스케이드 비활성화·재활성화 로직이 "이 컬렉션이
--   죽인 배지"를 구분하려고 쓰던 값이다. 티켓 20260914_1729에서 그 캐스케이드 로직을 완전히
--   제거하면서 값을 채우는 코드 경로가 사라져 죽은 컬럼이 됐다.
--
-- 삭제 전 확인(2026-09-21, jam-prod 읽기 전용 조회):
--   - 값이 채워진 행: 0건 (badges 3,386행 중)
--   - 이 컬럼을 참조하는 함수·뷰·RLS 정책·트리거: 0건
--   - 이 컬럼에 걸린 인덱스: idx_badges_deactivated_by_item_book_id 하나(컬럼과 함께 사라진다)
--
-- 이 마이그레이션이 하는 일:
--   badges.deactivated_by_item_book_id 컬럼을 삭제한다. 외래키(badges_deactivated_by_item_book_id_fkey)와
--   부분 인덱스는 컬럼 삭제와 함께 제거된다.
--
-- ⚠️ Supabase는 staging·프로덕션 공용 단일 DB라 실행 즉시 프로덕션에 반영된다.
--    컬럼 삭제는 되돌릴 수 없다(값이 0건이라 잃는 데이터는 없다). 되살리려면 146을 다시 적용한다.

drop index if exists public.idx_badges_deactivated_by_item_book_id;

alter table public.badges
  drop column if exists deactivated_by_item_book_id;
