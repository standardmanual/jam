-- 333 되돌림: 모든 역할이 읽는 옛 정책으로 되돌린다
DROP POLICY IF EXISTS "Authenticated can view follows" ON user_follows;
CREATE POLICY "Anyone can view follows"
  ON user_follows FOR SELECT
  USING (true);
