-- ============================================================
-- Phase 9: username 온보딩 + 아바타 스토리지
-- ============================================================

BEGIN;

-- 1. display_name → username rename
ALTER TABLE users RENAME COLUMN display_name TO username;

-- 2. NULL 허용 (기존 유저가 온보딩 전 상태가 될 수 있음)
ALTER TABLE users ALTER COLUMN username DROP NOT NULL;

-- 3. 소문자 변환 (기존 데이터)
UPDATE users SET username = lower(username) WHERE username IS NOT NULL;

-- 4. 특수문자 치환 (기존 구글 이름에 허용 외 문자가 있을 경우 NULL 처리)
UPDATE users
SET username = NULL
WHERE username IS NOT NULL
  AND username !~ '^[a-z0-9._]+$';

-- 5. UNIQUE 제약
ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);

-- 6. 형식 CHECK 제약
ALTER TABLE users ADD CONSTRAINT users_username_format CHECK (
  username IS NULL OR (
    length(username) BETWEEN 1 AND 30
    AND username ~ '^[a-z0-9._]+$'
    AND username NOT LIKE '.%'
    AND username NOT LIKE '%.'
    AND username NOT LIKE '%..%'
  )
);

-- 7. avatars 버킷 생성
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 8. Storage RLS 정책
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

COMMIT;
