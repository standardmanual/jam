# JAM! 어드민 UI 리디자인 — 문서 가이드

> **작성일:** 2026-08-05  
> **이전 버전:** `ADMIN_PRD.md` (기존 어드민 기능 명세)

---

## 📚 문서 구성

이 폴더에는 어드민 UI 리디자인을 위한 4개의 설계 문서가 있습니다.

### 1️⃣ **ADMIN_UI_REDESIGN_20260805.md** (메인 PRD)
**읽을 순서: 1번째 (필독)**

**담당 내용:**
- 📋 제품 개요 (목표, 해결할 문제)
- 👤 사용자 프로필 (개발자 vs 운영자)
- 🎨 핵심 설계 원칙 (모바일 우선, 페이지 전환 기반)
- 📱 화면 구조 및 상세 설계 (목록 → 상세 → 수정 흐름)
- 🔧 기술 스펙 (shadcn/ui 설치, Tailwind 설정)
- ⚙️ 기능 유지 사항 (CRUD, 시뮬레이터)

**한 줄 요약:** 어떤 화면을 만들고, 왜 그렇게 만드는지, 어떻게 동작하는지

**읽는 시간:** ~30분

---

### 2️⃣ **ADMIN_UI_DATA_MODEL_20260805.md** (데이터 모델)
**읽을 순서: 2번째 (개발 시작 전 필독)**

**담당 내용:**
- 📊 엔티티 다이어그램 (Badge, POI, ItemBook 관계)
- 🔄 데이터 흐름 (목록 → 상세 → 수정 프로세스)
- 💾 각 화면의 데이터 구조 (TypeScript 타입)
- 🔌 API 엔드포인트 (GET, POST, PATCH, DELETE)
- ✅ 유효성 검사 (클라이언트 + 서버)
- ⚡ 성능 고려사항 (캐싱, 페이지네이션)
- 🔒 데이터 보안 (어드민 인증, 민감 정보)

**한 줄 요약:** 데이터가 어떻게 저장되고 흐르고 검증되는지

**읽는 시간:** ~20분

---

### 3️⃣ **ADMIN_UI_PHASES_20260805.md** (Phase 분리 계획)
**읽을 순서: 3번째 (프로젝트 일정 확인용)**

**담당 내용:**
- 📅 3단계 Phase 분리 (각 기간, 범위, 완료 기준)
- 🎯 **Phase 1 (1-2주):** 배지/POI/아이템북 CRUD 모바일 UI
- 🎯 **Phase 2 (1주):** 시뮬레이터 + 유저 조회
- 🎯 **Phase 3 (~1주):** 성능 최적화 + 고도화 (다크 모드, A11y)
- ⚠️ 리스크 관리 (shadcn/ui 버그, 모바일 성능 등)
- 🔗 의존성 및 전제조건

**한 줄 요약:** 누가 언제 뭘 만드는지, 얼마나 걸리는지

**읽는 시간:** ~15분

---

### 4️⃣ **ADMIN_UI_PROJECT_SPEC_20260805.md** (프로젝트 스펙)
**읽을 순서: 개발 시작할 때 (계속 참조)**

**담당 내용:**
- 🛠️ 기술 스택 확정 (Next.js, TypeScript, Tailwind, shadcn/ui)
- 📁 디렉토리 구조 (고정, 변경 금지)
- 📝 코드 작성 규칙 (모바일 우선, 터치 타겟, 폼 필드)
- 🎨 네이밍 컨벤션 (타입, 함수, 변수, Tailwind)
- 💾 Git 커밋 규칙 (메시지 형식, 타입)
- 🧪 테스트 전략 (필수 테스트 체크리스트)
- 🐛 에러 처리 원칙
- ⚡ 성능 최적화 가이드
- ❌ **절대 하지 말 것** (10가지 금지 사항)
- ✅ 리뷰 체크리스트

**한 줄 요약:** Claude Code가 개발할 때 따라야 할 모든 규칙

**읽는 시간:** ~25분 (필요할 때마다 참조)

---

## 🗂️ 기존 문서와의 관계

| 기존 문서 | 새 문서 | 관계 |
|----------|--------|------|
| `ADMIN_PRD.md` | `ADMIN_UI_REDESIGN_20260805.md` | **강화**: 기능 유지 + UI 리디자인 추가 |
| (없음) | `ADMIN_UI_DATA_MODEL_20260805.md` | **신규**: UI 개발에 필요한 데이터 구조 |
| (없음) | `ADMIN_UI_PHASES_20260805.md` | **신규**: 개발 일정 계획 |
| (없음) | `ADMIN_UI_PROJECT_SPEC_20260805.md` | **신규**: 코드 작성 규칙 |

**기존 문서 유지:**
- ✅ `SERVICE_OPERATIONS.md` (계속 유지)
- ✅ `01_PRD.md`, `02_DATA_MODEL.md`, `03_PHASES.md` (계속 참조)
- ✅ `04_PROJECT_SPEC.md` (프로젝트 전체 규칙)

---

## 🚀 빠른 시작 (개발자용)

### 이미 기존 어드민 기능을 알고 있다면?

**1단계:** `ADMIN_UI_REDESIGN_20260805.md` 읽기 (화면 설계 이해)
```
→ 어떤 UI 변경이 되는지 파악
→ 기존 기능은 모두 유지된다는 것 확인
```

**2단계:** `ADMIN_UI_PROJECT_SPEC_20260805.md` "절대 하지 말 것" 섹션 읽기
```
→ 피해야 할 패턴 파악
→ shadcn/ui 필수 사용 이해
```

**3단계:** 개발 시작
```
→ ADMIN_UI_PROJECT_SPEC_20260805.md의 "코드 구조" 섹션 참고
→ ADMIN_UI_PHASES_20260805.md의 "Phase 1" 범위 확인
→ 첫 컴포넌트: AdminLayout.tsx 또는 BadgeCard.tsx
```

---

## 📋 체크리스트

### Phase 1 시작 전 (준비)
```
- [ ] 이 4개 문서 모두 읽었다
- [ ] ADMIN_UI_PROJECT_SPEC_20260805.md의 "절대 하지 말 것" 이해함
- [ ] shadcn/ui 설치 준비됨 (터미널 명령어 준비됨)
- [ ] 기존 어드민 기능 이해함 (배지/POI/아이템북 CRUD)
```

### Phase 1 개발 중 (매일)
```
- [ ] ADMIN_UI_PROJECT_SPEC_20260805.md 의 "코드 구조" 따름
- [ ] 모바일 우선 원칙 지킴
- [ ] shadcn/ui 컴포넌트만 사용 (커스텀 금지)
- [ ] 터치 타겟 44×44px 이상 확인
- [ ] 다크 모드 자동 작동 확인
```

### Phase 1 종료 전 (배포 전)
```
- [ ] ADMIN_UI_PHASES_20260805.md의 "Phase 1 완료 기준" 모두 충족
- [ ] ADMIN_UI_PROJECT_SPEC_20260805.md의 "리뷰 체크리스트" 확인
- [ ] 모바일 (375px, 480px) 테스트 완료
- [ ] 데스크탑 (1024px, 1440px) 테스트 완료
- [ ] 다크 모드 테스트 완료
- [ ] 기존 기능 회귀 테스트 완료
- [ ] Lighthouse Mobile Score ≥ 80 확인
```

---

## 💡 주요 개념 요약

### 모바일 우선 (Mobile-First)
```
❌ 옛날 방식: 데스크탑 설계 → 모바일은 축소
✅ 신방식:   모바일 설계 → 데스크탑은 확장

예시:
className="block md:hidden"   // 모바일: block, 데스크탑: hidden
className="grid grid-cols-1 md:grid-cols-2"  // 모바일: 1열, 데스크탑: 2열
```

### 페이지 전환 기반 상세 화면
```
목록 화면
  ↓ 항목 클릭
상세 화면 (읽기)
  ↓ [수정] 버튼 클릭
상세 화면 (수정 폼 활성화) 또는 /edit 페이지로 이동
  ↓ [저장] 클릭
목록 화면으로 돌아옴
```

### shadcn/ui 의존
```
버튼: <Button> (직접 <button>이 아님)
입력: <Input> (직접 <input> 아님)
선택: <Select> (직접 <select> 아님)
테이블: <Table> (직접 <table> 아님)

장점:
- 일관된 스타일
- 접근성 자동 처리
- 다크 모드 자동 지원
```

---

## 🔗 문서 내 링크

각 문서 내에서 다른 문서로 가는 링크:

- **ADMIN_UI_REDESIGN_20260805.md**
  - → "부록 A" → ADMIN_UI_PROJECT_SPEC_20260805.md의 shadcn/ui 설치
  - → "다음 단계" → ADMIN_UI_PHASES_20260805.md의 Phase 1

- **ADMIN_UI_DATA_MODEL_20260805.md**
  - → "API 엔드포인트" → 기존 ADMIN_PRD.md의 API 스펙 참고
  - → "[NEEDS CLARIFICATION]" → 의견 필요

- **ADMIN_UI_PHASES_20260805.md**
  - → "Phase 1" → ADMIN_UI_PROJECT_SPEC_20260805.md의 코드 구조
  - → "완료 기준" → ADMIN_UI_PROJECT_SPEC_20260805.md의 리뷰 체크리스트

- **ADMIN_UI_PROJECT_SPEC_20260805.md**
  - → "코드 구조" → 정확한 디렉토리 구조
  - → "개발 규칙" → 모바일 우선 + shadcn/ui
  - → "절대 하지 말 것" → 금지 사항 10가지

---

## ❓ FAQ

### Q1. 기존 어드민 기능은 모두 유지되나요?
**A:** 네, 100% 유지됩니다. UI만 리디자인합니다.
- 배지 CRUD ✅
- POI CRUD ✅
- 아이템북 CRUD ✅
- 시뮬레이터 ✅
- 유저 조회 (P1) ✅

### Q2. 언제부터 shadcn/ui를 설치하나요?
**A:** Phase 1 시작 직전.
- 터미널: `npx shadcn-ui@latest init`
- 상세 명령어: ADMIN_UI_REDESIGN_20260805.md 부록 A 참고

### Q3. 모바일 앱이 필요한가요?
**A:** 아니오. 웹 모바일 최적화(반응형)로 충분합니다.

### Q4. Phase 1은 얼마나 걸리나요?
**A:** 1-2주 (배지/POI/아이템북 CRUD)
- 환경 준비: 3-4일
- 배지 CRUD: 5-7일
- POI/아이템북 CRUD: 5-7일
- 테스트/배포: 2-3일

### Q5. 언제 첫 배포가 되나요?
**A:** 2026년 8월 중순 (Phase 1 완료 후)

### Q6. 다크 모드는 어떻게 되나요?
**A:** shadcn/ui가 기본 지원합니다. 추가 작업 없음.

### Q7. 기존 사이드바는 어떻게 되나요?
**A:** 모바일에서는 바텀 시트 또는 드로어, 데스크탑에서는 기존처럼 유지.

### Q8. 어떤 브라우저를 지원하나요?
**A:** 최신 브라우저들 (Chrome, Safari, Firefox, Edge)
- IE 11은 지원 안 함 (Next.js 15.x)

### Q9. SEO가 필요한가요?
**A:** 아니오. 어드민(로그인 필수)은 SEO 불필요.

### Q10. 모니터링을 어떻게 하나요?
**A:** 기존 Sentry 유지. Phase 3에서 Vercel Analytics 추가.

---

## 📞 문의 및 피드백

### 문서가 명확하지 않으면?
- 해당 문서의 "[NEEDS CLARIFICATION]" 섹션 확인
- 또는 이슈 작성

### 새로운 아이디어가 있으면?
- Phase 3 후에 별도 이슈로 제안
- 현재 Phase 1은 리디자인에 집중

### 기술적 질문?
- ADMIN_UI_PROJECT_SPEC_20260805.md의 해당 섹션 확인
- 또는 코드 리뷰 시 문의

---

## 📚 참고 자료

### 외부 문서
- [shadcn/ui 공식 문서](https://ui.shadcn.com/)
- [Next.js 공식 문서](https://nextjs.org/docs)
- [Tailwind CSS 공식 문서](https://tailwindcss.com/docs)

### 프로젝트 내 참고
- `jam-web/src/app/api/admin/` — 기존 API
- `jam-web/src/lib/badge-engine.ts` — 배지 로직
- `jam-web/src/lib/simulator.ts` — 시뮬레이터 로직

### 배지 시스템 이해
- `Service Plan/Specs/PRD/01_PRD.md` — 배지 전체 개념
- `Service Plan/Specs/PRD/02_DATA_MODEL.md` — 데이터 구조
- `Service Plan/Specs/PRD/PointSystem/OBJECT_MODEL.md` — 포인트 + 배지 상호작용
- `Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md` — 배지·드랍 엔진 로직
- `Service Plan/Specs/Content/ACTIVITY_BADGES.md`, `Content/ITEMBOOKS.xlsx` — 배지 컨텐츠 목록

---

## ✅ 문서 버전 관리

| 버전 | 생성일 | 주요 변경사항 | 상태 |
|------|--------|-------------|------|
| 1.0 | 2026-08-05 | 초판 (4개 문서) | ✅ 완성 |
| (예정) | TBD | Phase 1 피드백 반영 | 📋 준비중 |

---

## 🎯 최종 목표

```
2026년 9월 1일: 모바일 최적화 어드민 정식 출시

배포 후 상태:
✅ 모바일 375px ~ 데스크탑 1440px 완벽 지원
✅ Lighthouse Mobile ≥ 90, Desktop ≥ 95
✅ 다크 모드 자동 지원
✅ 기존 기능 100% 유지
✅ 개발자·운영자 모두 쾌적하게 사용 가능
```

---

**문서 작성자:** Claude Code AI  
**작성일:** 2026-08-05  
**마지막 수정:** -  
**상태:** ✅ 완성 대기 (사용자 최종 검토 예정)

