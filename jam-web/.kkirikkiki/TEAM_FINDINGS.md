# 발견 사항 & 공유 자료

## 🚨 2026-08-05 20:00 — [긴급 수정 완료] 프로덕션 전면 장애 & 근본 원인

**증상:** Vercel 빌드가 전면 실패, 서비스 전체(홈/프로필/배지/미션/드랍/인벤토리 등) 다운.

**근본 원인:**
macOS는 파일시스템이 **대소문자를 구분하지 않음**(case-insensitive, case-preserving).
shadcn CLI(`npx shadcn add button/card`)가 `button.tsx`, `card.tsx`를 생성하려 했을 때,
실제로는 기존 `Button.tsx`, `Card.tsx`(원본 서비스 컴포넌트, default export)를
**같은 파일로 인식하고 내용을 덮어썼음**. git엔 여전히 `Button.tsx`라는 이름으로
추적되지만 내용은 shadcn 버전(named export)으로 바뀜.

추가로 어떤 자동화 과정(정확한 원인 미상 — 아마 IDE 자동완성이나 코드 어시스턴트가
소문자 shadcn 파일명을 보고 전역 import 경로를 소문자로 "정리"한 것으로 추정)에서
**서비스 전역 50개 파일**의 `@/components/ui/Xxx` import가 전부 소문자로 바뀌었음
(Button, Card, Badge, TopNav, SlidingTabs, Toast, BottomSheet, Footer, LoadingSpinner,
PopInNumber, SwapText, TabBar, WanderingEyesLoader — 총 13개 컴포넌트 영향).

로컬 macOS에서는 대소문자 구분을 안 해서 정상 동작하는 것처럼 보였지만,
Vercel은 Linux(대소문자 구분)라서 배포 시 전부 빌드 실패.

**수정 내용 (커밋 4ea53ec):**
1. `Button.tsx`, `Card.tsx` 원본 콘텐츠 복원
2. 실제 디스크 파일명 대소문자 강제 복구 (`mv a tmp && mv tmp A` 방식)
3. 서비스 전역 50개 파일의 import 경로를 원래 대문자로 복원
4. shadcn 전용 Button/Card/Badge는 **충돌 없는 새 경로**로 분리:
   - `src/components/ui/shadcn-button.tsx`
   - `src/components/ui/shadcn-card.tsx`
   - `src/components/ui/shadcn-badge.tsx`
5. 어드민 코드만 `shadcn-*` 경로를 참조하도록 재조정
6. 로컬 `npm run build` 성공 확인 후 push 완료

**⚠️ 팀원 전원 필독 — 앞으로 지켜야 할 규칙:**
- `@/components/ui/Button`, `@/components/ui/Card`, `@/components/ui/Badge`는
  **서비스 전역 컴포넌트** (default export, SuperHi Plus 디자인). 어드민에서 건드리지 말 것.
- 어드민에서 shadcn 컴포넌트가 필요하면 반드시 **`shadcn-` 접두사가 붙은 파일**을 사용:
  `@/components/ui/shadcn-button`, `@/components/ui/shadcn-card`, `@/components/ui/shadcn-badge`
- 새 shadcn 컴포넌트를 추가로 설치해야 한다면(`npx shadcn add X`), 설치 전에 반드시
  `src/components/ui/`에 같은 이름(대소문자 무관)의 기존 파일이 있는지 확인할 것.
  있으면 설치 후 파일명을 `shadcn-X.tsx`로 즉시 rename.
- input/select/checkbox/textarea/dialog/sheet/table/alert/tabs는 원래 충돌이 없어서
  그대로 사용해도 안전함 (이미 검증됨).
- 코드 수정 후에는 **로컬에서 반드시 `npm run build`를 실행**해서 확인할 것.
  `npm run dev`만으로는 이런 대소문자 문제를 못 잡음 (Turbopack dev 모드가 더 관대함).

---

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

## 2026-08-05: 🚨 최우선 — 프로덕션 전면 장애를 일으킨 패턴

### ❌ 기존 컴포넌트와 같은 이름(대소문자만 다른)으로 shadcn 컴포넌트 설치
- 시도: `npx shadcn add button/card`를 프로젝트 루트에서 그냥 실행
- 결과: macOS 대소문자 미구분 파일시스템 때문에 기존 `Button.tsx`, `Card.tsx`(서비스
  전역 컴포넌트)가 shadcn 버전으로 덮어써짐 → Vercel(Linux) 빌드 전면 실패 → 프로덕션 다운
- 근거: TEAM_FINDINGS.md 2026-08-05 20:00 섹션 (커밋 4ea53ec으로 수정)
- **해결:** shadcn 컴포넌트를 설치하기 전, `src/components/ui/`에 대소문자만 다른
  동일 이름 파일이 있는지 먼저 확인. 있으면 설치 직후 `shadcn-이름.tsx`로 즉시 rename.
  또는 애초에 `--path` 옵션이나 별도 디렉토리로 설치.

### ❌ import 경로 케이스를 "정리"랍시고 일괄 소문자로 바꾸기
- 시도: (정확한 트리거 불명) 어딘가에서 `@/components/ui/Xxx` import를 전부 소문자로 변경
- 결과: 서비스 전역 50개 파일이 오염되어 로컬(대소문자 무관)에서는 멀쩡해 보이지만
  Vercel(대소문자 구분)에서 전부 "Module not found" / "export default 없음" 에러
- **해결:** import 경로의 대소문자는 절대 임의로 바꾸지 말 것. 실제 파일명과 정확히
  일치해야 함. 확신이 없으면 `git show HEAD:<경로>`로 원본 확인 후 진행.

### ❌ `npm run dev`만으로 배포 전 검증 끝냈다고 판단하기
- 결과: Turbopack dev 서버는 대소문자 불일치에 관대해서 로컬에서는 문제가 안 보임.
  `npm run build`(프로덕션 빌드)를 반드시 별도로 돌려야 이런 문제를 잡을 수 있음.

---

## 2026-08-05 (기존): 피해야 할 패턴

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

