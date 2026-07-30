# JAM! Phase 9 프로젝트 스펙 — AI 코딩 규칙

> 작성일: 2026-07-14  
> 이 문서는 Claude Code가 Phase 9 구현 시 반드시 따라야 할 행동 규칙이다.

---

## 기술 스택 (Phase 8에서 이어짐)

| 항목 | 기술 |
|------|------|
| 프레임워크 | Next.js 15 App Router (`jam-web/`) |
| DB | Supabase (PostgreSQL) |
| 인증 | Supabase Auth (Google OAuth) |
| 스토리지 | Supabase Storage (`avatars` 버킷) |
| 스타일 | Tailwind CSS (JAM! 디자인 시스템) |
| 언어 | TypeScript (strict) |

---

## 절대 하지 마 (금지 목록)

1. **`display_name` 남기기 금지** — Phase 9 완료 후 코드베이스 어디에도 `display_name` 참조 남기지 말 것. TypeScript 타입, API 응답, 쿼리 전부 `username`으로 교체.

2. **`username`에 `@` 저장 금지** — DB에는 `@` 없이 저장. UI에서 `@` 접두사는 표시용으로만 사용.

3. **대소문자 혼용 저장 금지** — username은 반드시 `toLowerCase()` 후 저장. DB CHECK 제약도 소문자만 허용하도록 설정됨.

4. **구글 프로필 이미지 강제 갱신 금지** — 유저가 이미 커스텀 사진을 업로드한 경우 로그인 때마다 구글 사진으로 덮어쓰면 안 됨. `avatar_url`이 `googleusercontent` URL일 때만 갱신.

5. **온보딩 우회 금지** — `/onboarding`은 `username = NULL` 유저만 접근. 이미 username 있는 유저가 `/onboarding`에 접근하면 `/`로 리다이렉트.

6. **클라이언트 유효성만 믿기 금지** — username 포맷 검증은 클라이언트(실시간 피드백용)와 서버(저장 시 재검증) 양쪽 모두에서 수행.

7. **service client로 onboarding API 처리 금지** — `/api/onboarding/complete`는 반드시 인증된 유저(JWT)만 호출 가능. 익명 접근 허용 금지.

8. **파일 업로드 제한 없이 받기 금지** — 아바타 업로드 시 파일 타입(JPEG/PNG/WebP)과 크기(5MB)를 서버에서 반드시 검증.

---

## 해야 할 것 (필수 규칙)

### username 중복 체크 시 자기 자신 제외
프로필 편집 화면에서 유저가 자신의 현재 username을 그대로 유지하면 중복 에러가 나면 안 됨.
중복 체크 API 또는 로직에서 현재 로그인한 유저의 username은 제외:
```sql
SELECT COUNT(*) FROM users
WHERE username = $1 AND id != $currentUserId
```

### debounce 적용
username 입력 필드에서 API 호출 시 500ms debounce 적용. 매 keystroke마다 호출 금지.

### 에러 상태 초기화
username 입력 값이 바뀌면 이전 유효성 상태(사용가능/불가) 즉시 초기화. 구형 결과가 잠시 보이는 것 방지.

### 아바타 업로드 후 즉시 반영
업로드 완료 응답(`avatar_url`)을 받으면 프로필 이미지를 즉시 업데이트. 페이지 새로고침 불필요.

### 마이그레이션 단독 실행 가능 형태
`020_username_onboarding.sql`은 BEGIN/COMMIT 트랜잭션으로 감싸서 실패 시 롤백되도록 작성.

---

## 컴포넌트 가이드

### 서버 컴포넌트 vs 클라이언트 컴포넌트

| 컴포넌트 | 타입 | 이유 |
|----------|------|------|
| `/onboarding/page.tsx` | `'use client'` | 실시간 입력 상태, API 호출 |
| `/profile/edit/page.tsx` | `'use client'` | 입력 상태, 파일 업로드, API 호출 |
| `/profile/page.tsx` | Server Component | 정적 데이터 표시 |

### JAM! 디자인 시스템 색상 (Tailwind)

```
bg-jam-ink       (#161616) — 검정
bg-jam-cream     (#F5F0E8) — 크림
bg-jam-yellow    (#FFE500) — 노랑 (강조)
bg-jam-lime      (#CAFF4C) — 라임 (성공/CTA)
bg-jam-teal      (#4CFFDE) — 틸 (보조)
bg-jam-purple    (#8B5CF6) — 퍼플 (레전더리)
text-jam-ink     — 기본 텍스트
```

### 버튼 스타일 기준

```tsx
// Primary CTA (생성하기/저장)
className="w-full bg-jam-lime text-jam-ink font-black py-4 rounded-2xl border-[3px] border-jam-ink shadow-[4px_4px_0_0_#161616] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed"

// 입력 필드 기본
className="w-full bg-white/10 border-[2px] border-jam-ink/30 rounded-xl px-4 py-3 text-white font-semibold focus:border-jam-lime focus:outline-none"

// 입력 필드 — 에러 상태
className="... border-red-500"

// 입력 필드 — 성공 상태
className="... border-jam-lime"
```

---

## API 라우트 규칙

```typescript
// 인증이 필요한 API는 반드시 이 패턴 사용
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
```

```typescript
// 서비스 클라이언트 (RLS 우회) — 관리자 작업에만
const service = createServiceClient()
// username check API는 인증 없이 service client 사용 가능 (공개 조회)
```

---

## 테스트 체크리스트

Phase 9 배포 전 수동 테스트:

**온보딩 흐름**
- [ ] 신규 구글 로그인 → `/onboarding` 리다이렉트 확인
- [ ] 구글 프로필 사진이 온보딩 화면에 표시됨
- [ ] 유효하지 않은 포맷 입력 → 에러 메시지 즉시 표시
- [ ] 이미 사용 중인 username 입력 → 중복 에러 메시지
- [ ] `@`를 포함한 입력 → 에러 처리
- [ ] 유효한 username 입력 → "사용 가능" 메시지 + [생성하기] 활성화
- [ ] [생성하기] 클릭 → DB 저장 → 홈 이동
- [ ] 기존 유저 재로그인 → 온보딩 없이 홈 이동

**프로필 편집**
- [ ] 프로필 사진 변경 → Storage 업로드 → 즉시 반영
- [ ] username 변경 → 저장 → 프로필에 반영
- [ ] 자신의 현재 username 그대로 저장 → 에러 없음
- [ ] 타인이 사용 중인 username으로 변경 → 에러 메시지

**엣지 케이스**
- [ ] 5MB 초과 이미지 업로드 → 업로드 거부 메시지
- [ ] JPEG/PNG/WebP 외 파일 업로드 → 거부 메시지
- [ ] 점으로 시작하는 username → 에러
- [ ] 연속된 점 username (`a..b`) → 에러
- [ ] 30자 초과 username → 에러
