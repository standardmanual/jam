-- 333: user_follows 읽기 정책을 로그인 사용자로 좁힌다 (티켓 20261008_1355)
-- 이전: "Anyone can view follows" (모든 역할, USING true) → 비로그인(anon)도 전체 팔로우 관계를 나열할 수 있었다.
-- 이후: 로그인한 사용자(authenticated)만 읽는다. 팔로워·팔로잉 목록 화면이 다른 유저의 행을 읽으므로 «본인 관련 행»으로는 좁히지 않는다.
-- 확인: SELECT policyname, roles FROM pg_policies WHERE tablename = 'user_follows';
--       → "Authenticated can view follows" {authenticated}
DROP POLICY IF EXISTS "Anyone can view follows" ON user_follows;
CREATE POLICY "Authenticated can view follows"
  ON user_follows FOR SELECT
  TO authenticated
  USING (true);
