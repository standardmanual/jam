---
id: 20260913_1736
category: Admin
priority: P1
status: OPEN
created: 2026-09-13
---

# [Admin] 어드민 오버레이 전반 모션 미동작 — tw-animate-css 추가

## 배경 / 문제 정의

쉐이더 랩 UI 개선 작업(티켓 20260913_1707) 검증 과정에서 사용자가 "대부분의 모션이
동작하지 않는다"고 지적했다. 조사 결과 이건 쉐이더 랩에 국한된 문제가 아니라 **JAM!
어드민 전체가 공유하는 shadcn 원시 컴포넌트의 기존 결함**이다.

`jam-web/src/components/admin/ui/`의 `select.tsx`·`dropdown-menu.tsx`·`popover.tsx`·
`dialog.tsx`·`alert-dialog.tsx`·`sheet.tsx`·`command.tsx`(CommandDialog) 등이 전부
`data-[state=open]:animate-in data-[state=closed]:animate-out fade-in-0 fade-out-0
zoom-in-95 zoom-out-95 slide-in-from-*` 클래스로 열기/닫기 모션을 넣도록 짜여 있는데,
이 클래스들을 실제로 정의하는 애니메이션 플러그인이 **프로젝트에 전혀 설치돼 있지
않다**(`package.json`·`node_modules`·`globals.css` 전수 확인, `tailwindcss-animate`도
Tailwind v4용 후속 패키지 `tw-animate-css`도 없음, `@plugin` 지시어나 keyframes
정의도 없음). Tailwind가 이 클래스들을 전부 "정의되지 않은 클래스"로 무시해, 어드민의
거의 모든 오버레이가 열고 닫힐 때 애니메이션 없이 즉시 나타났다 사라지는 상태였다.

## 검토 및 사용자 결정

원본 저장소(`basementstudio/shader-lab`, `gh api`로 `package.json` 직접 조회)는
`tailwindcss-animate` 계열이 아니라 `motion`(옛 Framer Motion)을 쓴다. 하지만
문제가 되는 컴포넌트들은 원본 shader-lab 앱의 코드가 아니라 JAM! 자체의 기존 shadcn
프리미티브(배지 폼·미션 관리 등 수십 개 다른 어드민 화면이 공유)라서, "원본이 뭘
쓰는지"가 이 버그의 수정 방법을 직접 정하지는 않는다고 판단했다. JAM!에는 `motion`도
`tailwindcss-animate` 계열도 둘 다 설치돼 있지 않아 어느 쪽이든 신규 설치가
필요한데, 다음 이유로 `tw-animate-css`를 선택했다(**사용자 승인**, 2026-09-13):

- `tw-animate-css`는 CSS 유틸리티 한 줄 추가(`@import`)로 끝나고 기존 코드(수십 개
  어드민 컴포넌트)를 전혀 안 고쳐도 된다.
- `motion`으로 통일하려면 어드민 전역 오버레이 컴포넌트를 전부
  `AnimatePresence`/`motion.div` 기반으로 재작성해야 해 범위와 회귀 위험이 훨씬 크다.

## 상세 요구사항

### 서비스/코드베이스 관점

1. `tw-animate-css`를 `jam-web`에 devDependency 또는 dependency로 설치한다(빌드 타임
   CSS만 생성, 런타임 JS 로직 없음 — 어느 쪽이든 무방, 기존 관례 확인 후 결정).
2. `jam-web/src/app/globals.css` 최상단(다른 `@import` 문 근처)에
   `@import "tw-animate-css";`를 추가한다.
3. 실제로 `fade-in-0`/`zoom-in-95`/`slide-in-from-top-2` 등 기존 컴포넌트가 이미 쓰고
   있는 클래스 이름과 `tw-animate-css`가 생성하는 유틸리티 이름이 정확히 일치하는지
   확인한다(패키지 자체를 열어보거나 컴파일된 CSS에 해당 규칙이 실제로 생기는지 확인).

### UI/UX 관점

- 코드 변경 없이 기존에 이미 작성된 애니메이션 클래스가 살아나는 것이 목표이므로, 특정
  화면 하나만이 아니라 최소 2~3개의 서로 다른 어드민 화면(예: 쉐이더 랩의 Popover+Command,
  배지 폼의 Select, 아무 Dialog 화면)에서 모션이 실제로 재생되는지 확인한다.

## 구현 계획

1. `npm install tw-animate-css` (jam-web).
2. `globals.css`에 import 추가.
3. postcss로 실제 컴파일해 `fade-in-0`/`zoom-in-95`/`animate-in` 등 유틸리티가 생성되는지
   직접 확인.
4. esbuild+playwright로 실제 컴포넌트(Select 또는 Popover) 열기 시 `data-[state=open]`
   전환과 함께 opacity/transform 애니메이션이 실제로 재생되는지(getAnimations() API 등으로)
   실측 확인.
5. `npx tsc --noEmit`, `npm run lint`, `npx vitest run` 재확인(패키지 추가가 기존 빌드에
   영향 없는지).

## 유예된 판단

- `motion`(Framer Motion)으로 어드민 전역을 통일하는 것은 이번 범위 밖(위 "검토 및 사용자
  결정" 참고, 필요성이 확인되면 별도 티켓).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

### 잔여 이슈
-
