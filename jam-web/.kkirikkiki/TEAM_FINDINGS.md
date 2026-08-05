# 발견 사항 & 공유 자료

## Phase 1 기본 정보

**shadcn/ui 설치 상태:**
- ✅ shadcn 초기화 완료
- ✅ Button, Input, Select, Checkbox, Textarea, Dialog, Sheet, Table, Card, Alert, Tabs 모두 설치
- ✅ 위치: `jam-web/src/components/ui/`
- ✅ Radix UI 기반

**개발 환경:**
- Node.js v25.9.0
- npm 11.12.1
- TypeScript ✅
- Tailwind CSS ✅
- Next.js ✅

**key 파일/문서:**
- ADMIN_UI_PROJECT_SPEC_20260805.md — 코드 규칙 (필독!)
- ADMIN_UI_REDESIGN_20260805.md — 화면 설계
- jam-web/src/app/admin/ — 기존 어드민 경로

---

## 코드 규칙 체크리스트 (팀원이 참조)

```
✅ 모바일 우선: className="block md:hidden"
✅ shadcn/ui만: Button, Input, Select 등만 사용
✅ 터치 타겟: h-11 이상 (44px)
✅ 폼: <label htmlFor=""> 필수
✅ 다크 모드: 자동 (shadcn/ui 기본)
✅ 커밋: "feat: 설명" 형식
```

---

## [업데이트 기록]

### 2026-08-05 14:30 — FrontDev-3
**POI/ItemBook 구현 완료**
- Card/Table/List/Detail 패턴으로 통일 (Badge와 동일)
- MapPreview는 Leaflet 없이 외부 지도 링크로 구현 (향후 확장 가능)
- shadcn/ui `<Card>`, `<Table>`, `<Button>`, `<Badge>` 사용
- 모바일 우선: `className="block md:hidden"` (카드), `className="hidden md:block"` (테이블)
- 터치 타겟 ≥ 44px (shadcn/ui 기본값 준수)

---

## 2026-08-05 19:00 — Tester 코드 리뷰: AdminLayout

### AdminLayout 반응형 설계 평가: ✅ PASS (개선사항 포함)

**대상:**
- src/app/admin/layout.tsx
- src/components/admin/AdminHeader.tsx
- src/components/admin/AdminSidebar.tsx
- src/components/admin/AdminNav.tsx

**결과:**
- 반응형 설계: ✅ 모바일 / 태블릿 / 데스크탑 OK
- 다크 모드: ✅ OK
- 코드 구조: ✅ 우수

**⚠️ 권장 개선사항 (선택사항)**

1. **AdminHeader 터치 타겟 크기**
   - 현재: h-10 w-10 (40×40px)
   - 권장: h-11 w-11 (44×44px) — iOS/Android 표준
   - 파일: src/components/admin/AdminHeader.tsx line 29

2. **AdminHeader 텍스트 크기**
   - 현재: text-xs (12px)
   - 권장: text-sm (14px) — 모바일 가독성
   - 파일: src/components/admin/AdminHeader.tsx line 38

**❌ 발견된 버그:**
- 없음 ✅

**다음 단계:**
- FrontDev-1: 개선사항 검토 후 반영 여부 결정
- Tester: FrontDev-2/3 완료 시 반응형 테스트 시작

---

# DEAD_ENDS (하지 말 것)

## 2026-08-05: 피해야 할 패턴

### ❌ 커스텀 버튼 만들기
- 시도: `<button className="bg-blue px-4">` 직접 작성
- 결과: 스타일 일관성 깨짐, 다크 모드 안 됨
- 근거: ADMIN_UI_PROJECT_SPEC § 4-2
- **해결:** shadcn/ui `<Button>` 사용

### ❌ 데스크탑 우선 설계
- 시도: `className="hidden sm:block"`
- 결과: 모바일에서 보이지 않음
- 근거: ADMIN_UI_PROJECT_SPEC § 4-1 "모바일 우선 원칙"
- **해결:** `className="block md:hidden"` 또는 반대로

### ❌ 파일 300줄 초과
- 시도: BadgeForm.tsx에 모든 필드 + 로직 다 넣기
- 결과: 유지보수 어려움, 테스트 불가
- 근거: ADMIN_UI_PROJECT_SPEC § 3-2 "파일 크기 제한"
- **해결:** 컴포넌트 분리 (BadgeConditionBuilder 따로, BadgeForm은 최소한의 필드만)

### ❌ 에러/로딩 상태 무시
- 시도: API 호출만 하고 loading/error state 안 만듦
- 결과: 사용자가 상황을 모름 (네트워크 느릴 때 특히 문제)
- 근거: ADMIN_UI_PROJECT_SPEC § 4-6 "로딩/에러 상태 처리"
- **해결:** 항상 3가지 상태 구현 (로딩, 에러, 성공)

---

