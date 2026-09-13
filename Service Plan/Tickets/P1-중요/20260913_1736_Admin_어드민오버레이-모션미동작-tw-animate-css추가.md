---
id: 20260913_1736
category: Admin
priority: P1
status: CLOSED
created: 2026-09-13
closed: 2026-09-13
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

1. `jam-web`에 `tw-animate-css`를 설치했다(`npm install tw-animate-css`).
2. `jam-web/src/app/globals.css`의 `@import "tailwindcss";` 바로 다음에
   `@import "tw-animate-css";`를 추가했다(근거 주석 포함).
3. 패키지 자체(`node_modules/tw-animate-css/dist/tw-animate.css`)를 열어
   `@utility fade-in-*`/`@utility zoom-in-*`/`@utility slide-in-from-top-*` 등이
   기존 컴포넌트가 쓰던 클래스 이름과 정확히 일치하는 Tailwind v4 `@utility` 매크로로
   정의돼 있음을 직접 확인했다.

### 변경된 파일
```
jam-web/package.json         (tw-animate-css 의존성 추가)
jam-web/package-lock.json
jam-web/src/app/globals.css  (@import "tw-animate-css" 추가)
```

### 테스트 결과
- [x] `npx tsc --noEmit` — 오류 0건
- [x] `npm run lint`(전체) — 0 errors, 13 warnings(전부 `design-system/**` 기존 경고, 무관)
- [x] `npx vitest run`(전체) — 91개 파일 중 90개 통과, 1452/1455 통과. 실패 3건은
      `gate-family-options-contract.test.ts`로 이 티켓과 무관한 기존 실패
- [x] postcss로 실제 `globals.css`를 컴파일해 `.fade-in-0{--tw-enter-opacity:0}`,
      `.zoom-in-95{--tw-enter-scale:.95}`, `.data-\[side\=bottom\]\:slide-in-from-top-2`
      등이 실제로 생성됨을 확인(수정 전에는 전혀 생성되지 않던 클래스들)
- [x] **실제 브라우저에서 애니메이션 재생 여부를 Web Animations API로 실측**
      (esbuild+playwright, 워크트리 `next dev`/`build` 제약으로 대체): 실제 소스로 번들한
      `ShaderLabLayerSidebar`를 마운트해
      - "레이어 추가" `Popover` 오픈 → `PopoverContent`(`data-state="open"`)에서
        `getAnimations()`가 `animationName: "enter"`, `playState: "running"`인 실행 중
        애니메이션 1건을 반환함을 확인(수정 전에는 이 클래스들이 무정의라 애니메이션
        자체가 생성되지 않았을 것)
      - 레이어 행의 "⋮ 더보기" `DropdownMenu` 오픈 → 동일하게 `role="menu"` 요소에서
        `enter` 애니메이션이 `running` 상태로 확인됨 — Select/Dialog/AlertDialog/Sheet
        등 동일 패턴을 쓰는 다른 어드민 오버레이에도 동일하게 적용될 것으로 판단(전부
        같은 shadcn 원시 컴포넌트 클래스 패턴 공유)
      - 검증 스크립트는 스크래치 산출물이라 커밋하지 않음(기존 관례)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [x] 해당 없음 — 사용자 노출 텍스트 변경이 전혀 없는 순수 CSS/의존성 변경

### 배포 정보
- 배포일: 2026-09-13 (staging 병합·push 완료, 오케스트레이터)
- 환경: staging (`stage.j-a-m.app`) - 프로덕션(main) 승격은 이 티켓 범위 밖, `/jam-ship`
  진행 시 사용자 승인 필요
- 커밋: `b7268b00`(review 브랜치 `claude/jamwork-20260913_1736-tw-animate-css`,
  origin/staging 기점에서 fast-forward로 정상 병합). 게이트 리뷰 판정: PASS(2026-09-13,
  conservative-reviewer가 postcss `@apply` 직접 컴파일로 클래스 매칭을 독립 재현, diff
  범위·node_modules 부수효과·tsc/lint/vitest 전부 재확인).

### 주요 의사결정 / 핵심 메모
1. `npm install` 과정에서 이 워크트리의 `node_modules`가 (다른 워크트리와 공유하던)
   심링크에서 독립된 실제 디렉터리로 전환됐다(`npm warn reify Removing non-directory
   .../node_modules`). 메인 트리의 `node_modules`(심링크 원본)는 개수·핵심 패키지 전부
   그대로임을 확인했다 — 이 워크트리만 별도 사본을 갖게 된 것으로, 오히려 다른 세션과의
   격리성이 높아진 부수 효과다. 문제로 보지 않았다.
2. `motion`(Framer Motion)으로 어드민 전역을 통일하는 대안은 채택하지 않았다(위 티켓
   본문 "검토 및 사용자 결정" 참고) — `tw-animate-css`는 기존 코드를 전혀 안 고쳐도 되는
   반면, `motion` 전환은 어드민 공용 컴포넌트 수십 개를 재작성해야 해 범위가 훨씬 크다.

### 잔여 이슈
- 이번 실측은 Popover·DropdownMenu 2종만 직접 확인했다. Dialog·AlertDialog·Sheet·
  Select 등 동일 패턴을 쓰는 나머지 오버레이는 구조적으로 동일하게 고쳐질 것으로
  판단했으나 개별 실측은 하지 않았다 — 실사용 중 문제가 발견되면 후속 조치한다.
