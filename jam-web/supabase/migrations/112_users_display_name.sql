-- ============================================================
-- Migration 112: 유저 프로필 표시 이름(display_name) 도입
--
-- 티켓: 20260830_0113
--
-- 배경(요약 — 티켓 문서 참고):
--   현재 유저를 화면에 노출할 때 쓰는 유일한 텍스트는 username(아이디, 온보딩에서
--   정한 @handle 형식)이다. 아이디 외에 자유 형식의 "이름"을 별도로 입력할 수 있게
--   하고, 이름이 설정된 유저는 화면에서 아이디 대신 이름이 보이도록 한다.
--
-- 이 마이그레이션이 하는 일:
--   users 테이블에 nullable 컬럼 display_name 추가. username과 달리 형식 제한
--   (허용 문자·중복 검사·금칙어)은 없다 — 인스타그램 "이름" 필드 정책과 동일하게
--   최대 30자만 강제한다. 공백·이모지·특수문자·대소문자 모두 허용.
--   NULL이면 "이름 없음" 상태로 취급해 화면 렌더 시점에 username으로 폴백한다
--   (표시 전용 폴백 — DB에 username을 복사해 채우지 않는다).
-- ============================================================

ALTER TABLE users ADD COLUMN display_name text;

ALTER TABLE users ADD CONSTRAINT users_display_name_length CHECK (
  display_name IS NULL OR length(display_name) BETWEEN 1 AND 30
);
