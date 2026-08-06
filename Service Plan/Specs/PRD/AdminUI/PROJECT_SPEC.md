# JAM! 어드민 UI 리디자인 — 프로젝트 스펙

> **생성일:** 2026-08-05  
> **목적:** Claude Code가 따를 개발 규칙, 코드 스타일, 결정 기준

---

## 1. 프로젝트 목표 (재확인)

**한 줄 요약:** 기존 어드민 기능(배지/POI/아이템북/시뮬레이터 CRUD)을 **모바일 우선 shadcn/ui**로 리디자인

**주요 지표:**
- 모바일(375px) 수평 스크롤 0%
- 데스크탑(1024px+) 효율성 +30% (더 많은 데이터 한 화면에)
- Lighthouse Mobile Score ≥ 80 (Phase 1), ≥ 90 (Phase 3)

---

## 2. 기술 스택 (확정)

| 계층 | 도구 | 버전 | 비고 |
|-----|------|------|------|
| **프레임워크** | Next.js | 15.x | 기존 유지 |
| **언어** | TypeScript | 5.x | 기존 유지 |
| **스타일** | Tailwind CSS | 3.x + shadcn/ui | 신규 추가 |
| **UI 컴포넌트** | shadcn/ui | latest | 신규 도입 |
| **상태 관리** | React Hooks + URL Query | - | Redux 불필요 |
| **폼 검증** | React Hook Form + Zod | - | 필요시 도입 |
| **데이터 페칭** | React Query (SWR) | - | Phase 3에서 고려 |
| **테스트** | Vitest + React Testing Library | - | 선택사항 |

### 자동 설치할 shadcn/ui 컴포넌트
```bash
# 필수
npx shadcn-ui@latest add button input select checkbox textarea
npx shadcn-ui@latest add dialog sheet table card alert tabs

# 추가 (필요시)
npx shadcn-ui@latest add form dropdown-menu scroll-area
npx shadcn-ui@latest add toast tooltip popover
```

---

## 3. 코드 구조 (필수)

### 3-1. 디렉토리 구조 (고정)
```
jam-web/src/
├── app/
│   ├── admin/
│   │   ├── layout.tsx                    ← 공통 레이아웃
│   │   ├── page.tsx                      ← 대시보드 (기존)
│   │   ├── badges/
│   │   │   ├── page.tsx                  ← 배지 목록
│   │   │   └── [id]/page.tsx             ← 배지 상세
│   │   ├── poi/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── itembooks/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── simulator/
│   │   │   └── page.tsx                  ← 시뮬레이터 (리디자인)
│   │   └── users/                        ← P1
│   │       ├── page.tsx
│   │       └── [id]/page.tsx
│   └── ...
├── components/
│   ├── admin/                            ← 신규
│   │   ├── AdminLayout.tsx
│   │   ├── AdminHeader.tsx
│   │   ├── AdminSidebar.tsx
│   │   ├── AdminNav.tsx
│   │   ├── badges/
│   │   │   ├── BadgesList.tsx
│   │   │   ├── BadgeCard.tsx
│   │   │   ├── BadgesTable.tsx
│   │   │   ├── BadgeDetail.tsx
│   │   │   └── BadgeForm.tsx
│   │   ├── poi/
│   │   │   ├── PoiList.tsx
│   │   │   ├── PoiCard.tsx
│   │   │   ├── PoiTable.tsx
│   │   │   ├── PoiDetail.tsx
│   │   │   └── PoiForm.tsx
│   │   ├── itembooks/
│   │   │   ├── ItemBooksList.tsx
│   │   │   ├── ItemBookCard.tsx
│   │   │   ├── ItemBooksTable.tsx
│   │   │   ├── ItemBookDetail.tsx
│   │   │   └── ItemBookForm.tsx
│   │   ├── simulator/
│   │   │   ├── SimulatorForm.tsx
│   │   │   └── SimulatorResult.tsx
│   │   └── users/
│   │       ├── UsersList.tsx
│   │       ├── UserCard.tsx
│   │       ├── UsersTable.tsx
│   │       └── UserDetail.tsx
│   ├── ui/                               ← shadcn/ui 컴포넌트 (자동 생성)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   └── ...
│   └── ...
├── lib/
│   ├── admin/                            ← 신규 (어드민 유틸)
│   │   ├── utils.ts                      ← 포맷팅, 검증 함수
│   │   └── constants.ts                  ← 상수 (rarity, category 등)
│   ├── ...
└── ...
```

### 3-2. 파일 크기 제한
```
- 페이지 컴포넌트 (page.tsx): < 300줄
- 독립 컴포넌트: < 200줄
  → 초과 시 하위 컴포넌트로 분리

- 예외: 폼 컴포넌트는 필드 많아서 300줄 허용
```

### 3-3. 컴포넌트 네이밍
```
✅ 추천
- BadgeCard.tsx (Badge 엔티티 + UI 타입)
- BadgeForm.tsx
- BadgeDetail.tsx
- PoiTable.tsx
- AdminLayout.tsx

❌ 피할 것
- badge-card.tsx (파일명은 PascalCase)
- Card.tsx (모호함)
- ListPage.tsx (너무 일반적)
```

---

## 4. 개발 규칙 (절대 준수)

### 4-1. 모바일 우선 원칙
```tsx
// ✅ 추천 (모바일 우선)
className="block md:hidden"   // 모바일에서 block, 데스크탑에서 hidden
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"

// ❌ 피할 것 (데스크탑 우선)
className="hidden sm:block"
```

### 4-2. shadcn/ui 컴포넌트 필수 사용
```tsx
// ✅ 추천
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

<Button variant="outline" size="sm">삭제</Button>
<Input placeholder="검색..." />

// ❌ 피할 것 (커스텀 버튼)
<button className="bg-blue-500 px-4 py-2">삭제</button>
```

### 4-3. Tailwind Breakpoint 활용
```typescript
// 프로젝트 기준
const breakpoints = {
  sm: 640,   // 모바일 (기본)
  md: 768,   // 태블릿
  lg: 1024,  // 데스크탑
  xl: 1280,  // 와이드 데스크탑
};

// 사용 예
<div className="
  p-4 md:p-6 lg:p-8
  text-sm md:text-base lg:text-lg
  grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3
">
  ...
</div>
```

### 4-4. 터치 타겟 최소 크기 (44×44px)
```tsx
// ✅ 권장
<Button className="h-11 px-4">클릭</Button>  // h-11 = 44px

// ❌ 피할 것 (너무 작음)
<button className="h-6 px-2 text-xs">클릭</button>
```

### 4-5. 폼 필드 규칙
```tsx
// 모든 입력 필드는 레이블 필수
<label htmlFor="badge-name" className="block text-sm font-medium">
  배지 이름 *
</label>
<Input id="badge-name" required placeholder="예: 한강 라이더" />

// 필수 필드는 별도 표시 (*)
// 도움말 텍스트는 작은 회색 텍스트
<p className="text-xs text-gray-500 mt-1">최대 100자</p>
```

### 4-6. 로딩/에러 상태 처리
```tsx
// ✅ 필수
- 로딩 중: 스피너 + "로딩 중..."
- 에러: Alert 컴포넌트 + 재시도 버튼
- 빈 상태: 아이콘 + 설명 텍스트

// ❌ 피할 것
- 아무것도 표시 안 함 (사용자 혼란)
- 에러 무시 (콘솔에만 출력)
```

### 4-7. 다크 모드 지원 (필수)
```tsx
// shadcn/ui는 기본적으로 다크 모드 지원
// CSS 클래스: dark:bg-gray-900, dark:text-gray-100

// ✅ 권장 (shadcn/ui 기본)
<div className="bg-white dark:bg-slate-950">

// ❌ 피할 것 (수동 다크 모드 설정)
<div className={isDark ? "bg-black" : "bg-white"}>
```

---

## 5. 네이밍 컨벤션 (일관성)

### 5-1. TypeScript 타입/인터페이스
```typescript
// ✅ 추천
type Badge = { id: string; name: string; ... };
type BadgeListItem = { id: string; name: string; rarity: string; };
interface BadgeFormProps { onSubmit: (badge: Badge) => void; }

// ❌ 피할 것
type IBadge = { ... };          // I 접두어 불필요 (Java 관습)
type badge_list_item = { ... }; // snake_case
type BadgeProps { ... };        // Props는 interface로
```

### 5-2. 함수/변수 네이밍
```typescript
// ✅ 추천
const handleBadgeSubmit = () => {};
const fetchBadgeList = async () => {};
const formatRarity = (rarity: string) => {};
const isBadgeValid = (badge: Badge) => {};

const [badges, setBadges] = useState([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

// ❌ 피할 것
const handleBadgeFormSubmit = () => {};  // 너무 길음
const getBadges = () => {};               // fetch는 async 함수, get은 동기
const badgeList = () => {};               // 동사 없음
const bd = [];                            // 축약
```

### 5-3. 클래스명 / Tailwind
```typescript
// ✅ 추천
className="flex items-center justify-between gap-4 p-4 border rounded-lg"
className="grid grid-cols-1 md:grid-cols-2 gap-4"
className="text-sm font-semibold text-gray-700 dark:text-gray-300"

// ❌ 피할 것
className="flex justify-between border p-4"  // gap 없음
className="p-2 md:p-8"                        // 지나친 점프 (4 → 32)
className="bg-opacity-50"                     // 색상 + opacity 조합
```

---

## 6. Git 커밋 규칙

### 6-1. 커밋 메시지 형식
```
Type: 한국어 제목 (50자 이내)

본문 (필요시):
- 변경 내용 설명
- 왜 이렇게 했는지
- 영향받는 범위
```

### 6-2. 타입 구분
| 타입 | 설명 | 예시 |
|-----|------|------|
| `feat` | 새 기능 | `feat: 배지 목록 모바일 UI 추가` |
| `fix` | 버그 수정 | `fix: POI 상세 페이지 수정 폼 버그` |
| `refactor` | 리팩토링 | `refactor: BadgeForm 컴포넌트 분리` |
| `style` | 스타일만 변경 | `style: 어드민 네비게이션 색상 조정` |
| `docs` | 문서 변경 | (기존 규칙 유지) |
| `chore` | 의존성/설정 | `chore: shadcn/ui 컴포넌트 추가` |

### 6-3. 커밋 원칙
```
- 한 커밋 = 한 기능 또는 한 버그 수정
- 예: "배지 목록 + 배지 상세" → 2개 커밋
- 모바일 UI + 데스크탑 UI 분리 가능 (하지만 한 커밋 권장)
```

---

## 7. 테스트 전략

### 7-1. 필수 테스트 (모든 화면)
```
- ✅ 모바일 (375px, 480px, 600px) — 레이아웃 확인
- ✅ 태블릿 (768px) — 테이블 vs 카드 전환 확인
- ✅ 데스크탑 (1024px, 1440px) — 사이드바 + 콘텐츠 확인
- ✅ 다크 모드 — 색상 대비 확인
- ✅ 터치 타겟 크기 — 44×44px 이상 확인
- ✅ 로딩/에러 상태 — 모두 표시되는지 확인
```

### 7-2. 성능 테스트 (Phase 3)
```
- Lighthouse Mobile Score ≥ 80
- Lighthouse Desktop Score ≥ 90
- FCP (First Contentful Paint) < 1.5s
- LCP (Largest Contentful Paint) < 2.5s
- CLS (Cumulative Layout Shift) < 0.1
```

### 7-3. 기능 회귀 테스트 (매 배포 전)
```
배지:
- [ ] 목록 조회 (필터, 검색)
- [ ] 생성 (모든 필드)
- [ ] 수정 (조건 빌더 포함)
- [ ] 삭제

POI:
- [ ] 목록 조회
- [ ] 생성 + 배지 링크
- [ ] 수정 (지도 미리보기)
- [ ] 삭제

시뮬레이터:
- [ ] GPX 업로드 + 파싱
- [ ] Dry Run vs Apply
- [ ] 결과 리포트 표시

유저:
- [ ] 목록 + 검색
- [ ] 상세 정보
```

---

## 8. 로깅 및 에러 처리

### 8-1. 에러 처리 원칙
```typescript
// ✅ 권장
try {
  const result = await fetchBadges();
  setBadges(result);
} catch (error) {
  const message = error instanceof Error ? error.message : "알 수 없는 에러";
  setError(`배지 로드 실패: ${message}`);
  console.error("fetchBadges error:", error);
}

// ❌ 피할 것
try { ... } catch (e) { console.log(e); }  // 무시
try { ... } catch (e) { /* 빈 블록 */ }    // 아무것도 안 함
```

### 8-2. 사용자에게 표시할 메시지
```typescript
// ✅ 사용자 친화적
"배지 저장 실패. 다시 시도해주세요."
"네트워크 연결을 확인해주세요."

// ❌ 기술적 과다 정보
"Error: ENOTFOUND api.example.com"
"TypeError: Cannot read property 'name' of undefined"
```

### 8-3. 콘솔 로그
```typescript
// Phase 1 개발 중
console.debug("BadgeForm:mounted", { id, initialData });
console.error("API error:", { status, message });

// 배포 후 (production)
- console.debug() 제거 또는 조건부 실행
- console.error()는 Sentry로 전송
```

---

## 9. 성능 최적화 가이드 (Progressive)

### Phase 1 (필수 아님, 하지만 염두에)
```
- shadcn/ui 컴포넌트 기본 스타일 유지 (불필요한 커스터마이징 금지)
- 이미지 src 명시 (다음에 Image 최적화 가능하도록)
```

### Phase 3 (필수)
```
- 다음.js Image 컴포넌트 사용 (배지 썸네일)
- 동적 import로 무거운 컴포넌트 분리 (시뮬레이터 리포트)
- useMemo/useCallback (불필요한 리렌더 방지)
```

---

## 10. 절대 하지 말 것 (Do NOT)

```
❌ 이 항목들은 절대로 하지 마세요:

1. shadcn/ui 컴포넌트를 무시하고 직접 만들기
   - 도입 이유가 일관성 + 접근성 + 빠른 개발
   - 필요하면 shadcn/ui 커스터마이징 (variant 추가)

2. Tailwind CSS 외 다른 CSS 프레임워크 도입
   - 기존 프로젝트와 일관성 깨짐

3. 반응형 없이 고정 너비로 디자인
   - 모바일 우선 원칙 위배

4. 다크 모드 무시
   - shadcn/ui 기본이므로 자동 지원 필수

5. 폼 필드에 레이블 빼먹기
   - 접근성 + UX 저하

6. 에러/로딩 상태 무시
   - 사용자 혼란 유발

7. 큰 파일 (300줄 이상) 만들기
   - 유지보수 어려움

8. 하드코딩 (상수 아닌)
   - lib/admin/constants.ts에서 관리

9. 커밋 없이 바로 배포
   - git history 정리 필수 (이전 버전 추적 가능하게)

10. 사용자 데이터를 URL에 노출
    - 민감한 정보는 서버 세션에 저장
```

---

## 11. 리뷰 체크리스트

**각 PR 머지 전:**

```
코드 품질
- [ ] TypeScript 타입 완전성
- [ ] 함수/변수 네이밍 일관성
- [ ] 파일 크기 < 300줄 (폼 제외)

디자인/UX
- [ ] 모바일 (375px) 테스트 (수평 스크롤 없음)
- [ ] 데스크탑 (1024px) 테스트
- [ ] 다크 모드 확인
- [ ] 터치 타겟 ≥ 44×44px

기능
- [ ] 기존 기능 회귀 없음
- [ ] 에러/로딩 상태 표시
- [ ] 폼 유효성 검사

성능
- [ ] Lighthouse Mobile Score (목표: Phase 1 ≥ 80)
- [ ] 번들 사이즈 증가 < 50KB

문서
- [ ] 커밋 메시지 명확함
- [ ] 복잡한 로직에 주석 있음 (1줄)
```

---

## 12. [NEEDS CLARIFICATION]

확인 필요한 사항:
- [ ] **프로젝트 리더:** 누가 최종 검토 권한?
- [ ] **배포 담당자:** Vercel 푸시 권한?
- [ ] **테스트 환경:** Staging URL?
- [ ] **모니터링:** Sentry 프로젝트 이름?
- [ ] **긴급 대응:** 프로덕션 버그 시 연락처?

---

## 다음 단계

1. **이 문서 검토** (사용자 확인)
2. **shadcn/ui 설치** (부록 A 참고)
3. **Phase 1 시작** → AdminLayout 생성
4. **매주 피드백 루프** (수요일 리뷰)

---

**수립자:** Claude Code AI  
**수립일:** 2026-08-05  
**최종 검토:** [대기중]  
**배포 일정:** Phase 1 (2주), Phase 2 (1주), Phase 3 (1주)

