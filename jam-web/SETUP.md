# JAM! 개발자 설정 가이드

Phase 1 배포 전 환경변수를 채우고 Supabase DB를 초기화하는 단계별 절차입니다.

---

## 1. Supabase 프로젝트 생성

1. [https://supabase.com](https://supabase.com) 로그인 후 **New project** 클릭
2. 프로젝트 이름 입력 (예: `jam-prod`) → 리전 선택 (Northeast Asia — Seoul 권장)
3. 프로젝트 생성 완료 후 **Settings → API** 이동
4. 아래 값을 복사하여 `.env.local`에 입력:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

---

## 2. Supabase DB 마이그레이션

스키마 파일 위치: `supabase/migrations/001_initial_schema.sql`

### 방법 A — Supabase CLI (권장)

```bash
# CLI 설치 (미설치 시)
brew install supabase/tap/supabase

# 프로젝트 연결
supabase link --project-ref <project-ref>

# 마이그레이션 실행
supabase db push
```

### 방법 B — 대시보드 SQL 에디터

1. Supabase 대시보드 → **SQL Editor** 클릭
2. `supabase/migrations/001_initial_schema.sql` 파일 전체 복사
3. SQL 에디터에 붙여넣기 → **Run** 클릭

---

## 3. Google OAuth 설정

### GCP Console

1. [https://console.cloud.google.com](https://console.cloud.google.com) 접속 → 프로젝트 생성 또는 선택
2. **API 및 서비스 → OAuth 동의 화면** → 외부 선택 → 저장
3. **사용자 인증 정보 → + 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
4. 애플리케이션 유형: **웹 애플리케이션**
5. 승인된 리디렉션 URI 추가:
   - 로컬: `http://localhost:3000/auth/callback`
   - 프로덕션: `https://<your-domain>/auth/callback`
   - Supabase 콜백: `https://<project-ref>.supabase.co/auth/v1/callback`

### Supabase에 Google OAuth 등록

1. Supabase 대시보드 → **Authentication → Providers → Google**
2. **Client ID**와 **Client Secret** 입력 (GCP에서 발급한 값)
3. **Save** 클릭

---

## 4. Strava API 앱 등록

1. [https://www.strava.com/settings/api](https://www.strava.com/settings/api) 접속
2. **Create & Manage Your App** → 신규 앱 생성:
   - Application Name: `JAM!`
   - Category: Social
   - Website: 배포 도메인 (예: `https://jam.yourdomain.com`)
   - Authorization Callback Domain: 배포 도메인 (예: `jam.yourdomain.com`)
3. 생성 후 **Client ID**와 **Client Secret** 확인
4. `.env.local`에 입력:

```
STRAVA_CLIENT_ID=<Client ID>
STRAVA_CLIENT_SECRET=<Client Secret>
STRAVA_REDIRECT_URI=https://<your-domain>/api/strava/callback
```

로컬 개발 시:
```
STRAVA_REDIRECT_URI=http://localhost:3000/api/strava/callback
```

---

## 5. ENCRYPTION_KEY 생성

Strava 토큰을 AES-256-CBC로 암호화할 키입니다.

```bash
openssl rand -hex 32
```

출력된 64자리 hex 문자열을 `.env.local`에 입력:

```
ENCRYPTION_KEY=<64자리 hex 문자열>
```

**주의**: 이 키를 잃어버리면 DB에 저장된 모든 Strava 토큰을 복호화할 수 없습니다. 안전한 비밀 관리 도구(1Password, AWS Secrets Manager 등)에 백업하세요.

---

## 6. Vercel Cron Secret 설정

Vercel Cron이 `/api/cron/sync`를 호출할 때 인증에 사용합니다.

```bash
openssl rand -hex 32
```

`.env.local`에 입력:

```
CRON_SECRET=<랜덤 문자열>
```

---

## 7. 전체 .env.local 예시

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Strava
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=abc123...
STRAVA_REDIRECT_URI=https://jam.yourdomain.com/api/strava/callback

# Security
ENCRYPTION_KEY=a1b2c3d4e5f6...  # 64자리 hex
CRON_SECRET=f9e8d7c6...          # 랜덤 문자열
```

---

## 8. Vercel 배포

### 8-1. 프로젝트 연결

```bash
npm i -g vercel
vercel link
```

### 8-2. 환경변수 등록

Vercel 대시보드 → 프로젝트 → **Settings → Environment Variables**에서
위 `.env.local`의 모든 값을 **Production / Preview / Development** 환경에 등록합니다.

또는 CLI로 일괄 등록:

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production
# (각 변수 반복)
```

### 8-3. 배포

```bash
vercel --prod
```

---

## 9. Vercel Cron 확인

`vercel.json`에 이미 설정되어 있습니다:

```json
{
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "0 12 * * *"
    }
  ]
}
```

- 실행 시각: 매일 12:00 UTC = **21:00 KST**
- Vercel 대시보드 → 프로젝트 → **Cron Jobs** 탭에서 실행 로그 확인 가능
- `CRON_SECRET`이 Vercel 환경변수에 등록되어 있어야 인증 통과

---

## 10. Supabase Auth Redirect URL 추가

Supabase 대시보드 → **Authentication → URL Configuration**:

- Site URL: `https://<your-domain>`
- Redirect URLs에 추가:
  - `https://<your-domain>/auth/callback`
  - `http://localhost:3000/auth/callback` (로컬 개발용)

---

## 로컬 개발 실행

```bash
npm install
cp .env.example .env.local
# .env.local 값 채우기 (위 가이드 참고)
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속
