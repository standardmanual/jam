# JAM! Phase 9 데이터 모델 — 아이디 & 프로필 이미지

> 작성일: 2026-07-14

---

## 1. 스키마 변경 요약

| 테이블/버킷 | 변경 유형 | 상세 |
|-------------|----------|------|
| `users` | 컬럼 rename | `display_name` → `username` |
| `users` | 제약 추가 | `username` UNIQUE + 패턴 CHECK |
| `storage.buckets` | 신규 생성 | `avatars` 버킷 |

---

## 2. `users` 테이블 변경

### 변경 전

```sql
CREATE TABLE users (
  id          uuid PRIMARY KEY,
  email       text NOT NULL,
  display_name text NOT NULL,
  avatar_url  text,
  region      text,
  activity_types text[] DEFAULT '{}',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
```

### 변경 후

```sql
-- display_name → username (rename + 제약 추가)
ALTER TABLE users RENAME COLUMN display_name TO username;

-- NULL 허용 (온보딩 완료 전 유저 존재 가능)
ALTER TABLE users ALTER COLUMN username DROP NOT NULL;

-- UNIQUE 제약 (소문자 기준)
ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);

-- 형식 CHECK 제약
-- 허용: 영문 소문자, 숫자, 점, 언더스코어
-- 금지: 점으로 시작/끝, 연속된 점, 대문자(저장 시 소문자 변환으로 방지)
ALTER TABLE users ADD CONSTRAINT users_username_format CHECK (
  username IS NULL OR (
    length(username) BETWEEN 1 AND 30
    AND username ~ '^[a-z0-9._]+$'
    AND username NOT LIKE '.%'
    AND username NOT LIKE '%.'
    AND username NOT LIKE '%.._'
    AND username NOT LIKE '%..%'
  )
);
```

### TypeScript 타입 변경 (`src/types/database.ts`)

```typescript
// 변경 전
export interface UserRow {
  id: string
  email: string
  display_name: string    // ← 제거
  avatar_url: string | null
  ...
}

// 변경 후
export interface UserRow {
  id: string
  email: string
  username: string | null   // NULL 허용 (온보딩 전)
  avatar_url: string | null
  region: string
  activity_types: ActivityType[]
  created_at: string
  updated_at: string
}
```

---

## 3. Supabase Storage — `avatars` 버킷

### 버킷 설정

```sql
-- 버킷 생성
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- RLS: 본인 폴더에만 업로드 가능
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- RLS: 본인 파일만 삭제 가능
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- RLS: 모든 인증 유저가 조회 가능 (public = true라서 사실 불필요하나 명시)
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');
```

### 파일 경로 규칙

```
avatars/{user_id}/{timestamp}.{ext}

예시:
avatars/abc123/1720944000000.jpg
avatars/abc123/1720944001234.webp
```

- 업로드 시 기존 파일 먼저 삭제 후 새 파일 저장 (덮어쓰기 방식)
- 공개 URL: `{SUPABASE_URL}/storage/v1/object/public/avatars/{user_id}/{filename}`

---

## 4. 마이그레이션 SQL 전문 (`020_username_onboarding.sql`)

```sql
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
```

---

## 5. 인증 흐름에서 username 처리

### `auth/callback/route.ts` 신규 로직

```typescript
// 구글에서 받은 프로필 정보
const googleAvatarUrl = user.user_metadata?.avatar_url ?? null

// users 테이블 upsert
await serviceClient.from('users').upsert({
  id: user.id,
  email: user.email!,
  avatar_url: googleAvatarUrl,   // 첫 로그인 시 구글 사진 저장
  // username은 건드리지 않음 (NULL 유지)
}, { onConflict: 'id', ignoreDuplicates: false })

// username 존재 여부 확인
const { data: profile } = await serviceClient
  .from('users')
  .select('username')
  .eq('id', user.id)
  .single()

const needsOnboarding = !profile?.username

if (needsOnboarding) {
  redirect('/onboarding')
} else {
  redirect('/')
}
```

**주의**: `avatar_url` upsert는 `ON CONFLICT DO UPDATE`에서 `avatar_url = EXCLUDED.avatar_url` 방식으로 하되, 유저가 이미 커스텀 사진을 업로드한 경우 덮어쓰지 않도록 조건 추가 필요:

```sql
-- avatar_url이 구글 URL(accounts.google.com 포함)인 경우만 갱신
ON CONFLICT (id) DO UPDATE SET
  avatar_url = CASE
    WHEN users.avatar_url IS NULL THEN EXCLUDED.avatar_url
    WHEN users.avatar_url LIKE '%googleusercontent%' THEN EXCLUDED.avatar_url
    ELSE users.avatar_url  -- 커스텀 업로드 사진은 유지
  END
```
