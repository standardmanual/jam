---
id: 20260908_0544
category: Service
priority: P1
status: IN_PROGRESS
created: 2026-09-08
---

# [Service] eye loader(WanderingEyesLoader) 과다 노출 및 NavigationLoader 고착 수정

## 배경 / 문제 정의
선행 조사 티켓 `20260908_0529`(디바운스 없는 사용처 4곳)와 `20260908_0536`(컬렉션
장착/해제 시 NavigationLoader capture 리스너 오작동으로 최대 8초 고착)에서 발견된
문제를 실제로 수정한다.

## 상세 요구사항

### 서비스/코드베이스 관점
1. `NavigationLoader.tsx`의 `document.addEventListener('click', handleClick, true)`를
   capture(`true`)에서 bubble(기본값)로 변경한다. 클릭 핸들러 진입 시
   `e.defaultPrevented`를 확인해, 이미 다른 핸들러가 `preventDefault()`로 막은
   클릭이면 `pending` 진입 자체를 취소한다.
2. `NavigationLoader`의 `SHOW_DELAY_MS(1000)`/`MIN_VISIBLE_MS(400)`/
   `MAX_VISIBLE_MS(8000)` 디바운스 정책을 재사용 가능한 훅으로 추출하고,
   `MissionStatusClient.tsx`·`BadgeShareButton.tsx`·`StravaConnectReveal.tsx`의
   로딩 상태 표시에도 적용한다 — 빠르게 끝나는 요청에는 로더가 아예 뜨지 않도록.

## 구현 계획
- `NavigationLoader.tsx`에서 클릭 리스너 등록을 bubble로 변경 + `defaultPrevented`
  가드 추가.
- 디바운스 로직(`SHOW_DELAY_MS`/`MIN_VISIBLE_MS`/`MAX_VISIBLE_MS`)을 공용 훅
  (`useDebouncedLoading` 등)으로 추출.
- 대상 3개 컴포넌트의 로딩 상태 판정에 훅을 적용.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
1. `NavigationLoader.tsx`의 document 클릭 리스너를 capture(`true`)에서 bubble(기본값)로
   변경했다. 카드 안에 중첩된 장착/해제·팔로우 버튼의 `stopPropagation()`이 리스너보다
   먼저 실행되도록 순서를 바로잡은 것. 추가로 핸들러 진입 시 `e.defaultPrevented`를
   확인해, 이미 다른 핸들러가 `preventDefault()`로 막은 클릭이면 `pending` 진입 자체를
   취소하는 방어 로직을 넣었다 — bubble 전환만으로는 "버튼이 stopPropagation을 안 하고
   preventDefault만 하는" 경우까지는 못 막기 때문에 이중 방어.
2. `NavigationLoader`의 `SHOW_DELAY_MS(1000)`/`MIN_VISIBLE_MS(400)`/`MAX_VISIBLE_MS(8000)`
   디바운스 정책을 `useDebouncedLoading` 훅(`src/hooks/useDebouncedLoading.ts`)으로
   추출했다. 입력은 `isLoading: boolean` 하나, 출력은 "지금 로더를 보여줘야 하는가"
   하나뿐인 범용 형태로 만들어 3개 컴포넌트에 적용했다:
   - `MissionStatusClient.tsx`: 기존 `loading` state를 그대로 훅에 넘기고, 렌더 조건만
     `loading` → `showLoader`(훅 반환값)로 교체.
   - `BadgeShareButton.tsx`: `effectiveState.kind === 'loading'`을 훅에 넘겨
     `showShareLoader`를 얻었다. 렌더 분기 순서를 `ready → error → showShareLoader`로
     바꿔, 실제 결과(성공/실패)가 이미 나왔으면 `minVisibleMs`와 무관하게 즉시 그 결과를
     보여주고, 훅의 디바운스는 오직 "아직 아무 결과도 없는 대기 구간"에만 적용되게 했다.
   - `StravaConnectReveal.tsx`: `phase === 'loading'`을 훅에 넘겨 `showLoadingOverlay`를
     얻었다. `BadgeRevealOverlay`의 `open` prop을 `phase === 'open' || showLoadingOverlay`로
     바꿔, 배지가 있어 `phase`가 곧장 `'open'`으로 넘어가는 경우엔 대기 화면 자체를 아예
     띄우지 않고 캐러셀로 직행하게 했다.

### 변경된 파일
```
jam-web/src/hooks/useDebouncedLoading.ts (신규)
jam-web/src/components/NavigationLoader.tsx
jam-web/src/app/(main)/missions/[id]/status/MissionStatusClient.tsx
jam-web/src/app/(main)/badges/[id]/BadgeShareButton.tsx
jam-web/src/components/StravaConnectReveal.tsx
```

### 테스트 결과
- [x] `npm run lint` 전체 실행 — 에러 0건, 경고 13건(모두 이번 변경과 무관한
  design-system 기존 경고, 그대로 유지)
- [x] `npx tsc --noEmit -p tsconfig.json` — 오류 0건
- [ ] 실기기/실렌더 확인은 하지 않음 — 이 브랜치가 아직 staging에 병합되지 않아
  `jam-stage.vercel.app`에 반영되지 않은 상태(로그인 제약이 아니라 병합 전이라 반영이
  안 된 것). 워크트리 환경 제약(`project_worktree_vitest_blocked`)으로 `next dev` 로컬
  실렌더도 이 세션에서는 불가능해 코드 리뷰(lint/tsc)로만 검증했다.

### 주요 의사결정 / 핵심 메모
- `useDebouncedLoading`의 계약을 "로더를 보여줘야 하는가"라는 단일 boolean으로 좁혔다.
  `NavigationLoader` 자체는 pathname/searchParams 변화 감지·fade-out 애니메이션 등 이
  훅만으로 대체할 수 없는 고유 로직이 많아, 이번 티켓 범위에서는 NavigationLoader를 훅
  사용처로 리팩터링하지 않고 3개 신규 대상에만 적용했다(티켓 상세 요구사항도 "정책을
  훅으로 추출해 3곳에 적용"이라고 명시해 이 범위와 일치).
- `BadgeShareButton`·`StravaConnectReveal`에서는 훅 반환값을 렌더 조건의 최우선이 아니라
  "실제 결과가 없을 때만" 참조하도록 배치했다 — 그렇지 않으면 `minVisibleMs`가 이미
  준비된 진짜 콘텐츠(이미지·캐러셀)의 노출을 인위적으로 늦추는 역효과가 난다.
- `defaultPrevented` 가드는 bubble 전환과 별개로 추가했다 — bubble만으로는 자식이
  `preventDefault()`만 하고 `stopPropagation()`을 안 하는 경우(이벤트가 document까지
  계속 버블링됨)를 못 막기 때문에, 두 방어가 서로 보완한다.

### 잔여 이슈
- `20260908_0536` 조사에서 지적된 `ProfileClient.tsx:444`의 팔로우/언팔로우 버튼도
  동일한 `<Link>` 중첩 버튼 구조라 같은 8초 고착 위험이 있었다 — 이번 NavigationLoader
  수정(bubble + defaultPrevented 가드)으로 함께 해결됐을 것으로 판단되나, 실기기 실렌더
  확인은 하지 않았다. staging 병합 후 실렌더 확인 권장.
- 대상 3개 컴포넌트 외에도 `BadgeRevealOverlay`를 호출하는 다른 지점(`SyncButton.tsx`
  등)이 있다면 동일 디바운스 적용 여지가 있으나, 이번 티켓 범위(명시된 3곳)를 벗어나
  손대지 않았다.
