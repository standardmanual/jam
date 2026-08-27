---
id: 20260827_011
category: Admin
status: CLOSED
created: 2026-08-27
closed: 2026-08-27
---

# [Admin] shadcn 어드민 테마 컨테이너 조회 패턴의 `react-hooks/set-state-in-effect` 린트 오류 수정

## 배경 / 문제 정의
`FactionsTable.tsx`(56~63행 부근)의 `themeContainer` state를 초기화하는 `useEffect`에서
`react-hooks/set-state-in-effect` ESLint 에러가 발생한다. 이펙트 본문에서 `setState`를
동기 호출하는 패턴이 원인이다.

```ts
const [themeContainer, setThemeContainer] = useState<HTMLElement | null>(null)
useEffect(() => {
  setThemeContainer(document.querySelector<HTMLElement>('[data-admin-theme]'))
}, [])
```

이 패턴은 티켓 20260827_002(어드민 shadcn 전환 4단계d)에서 AlertDialog(Radix Portal) 포털
컨테이너를 `[data-admin-theme]` 스코프 노드로 지정하기 위해 도입됐다. 이번 티켓
20260827_005(세계관 PUT API 부분 body 버그 수정) 게이트 리뷰 중 재확인됐으나, 그 작업
범위는 아니었으므로 별도 티켓으로 분리한다.

동일 패턴이 다른 어드민 화면·컴포넌트에도 반복 사용되고 있어 함께 점검한다. 전수 조사 결과
아래 17개 파일에서 동일한 3줄 패턴이 발견됐다:

```
src/app/admin/today/TodayCardTable.tsx
src/app/admin/itembooks/ItemBookForm.tsx
src/app/admin/ambient-drop/AmbientDropForm.tsx
src/app/admin/poi/PoiForm.tsx
src/app/admin/poi/CategoryManager.tsx
src/app/admin/simulator/page.tsx
src/app/admin/factions/FactionsTable.tsx
src/app/admin/factions/FactionForm.tsx
src/app/admin/abusing/AbusingClient.tsx
src/app/admin/abusing/PoiBlockTable.tsx
src/app/admin/abusing/BanTable.tsx
src/app/admin/badges/BadgeForm.tsx
src/components/admin/ui/sidebar.tsx
src/components/admin/itembooks/ItemBookActiveToggleButton.tsx
src/components/admin/itembooks/ItemBookTable.tsx
src/components/admin/badges/BadgesTable.tsx
src/components/admin/badges/BadgeActiveToggleButton.tsx
```

## 상세 요구사항

### 서비스/코드베이스 관점
- 17개 파일 전체에서 `useState(null) + useEffect(() => setState(document.querySelector(...)))`
  패턴을 동일한 방식으로 일관되게 수정한다 (파일마다 다르게 고치지 않는다).
- `src/app/admin/layout.tsx`에서 `[data-admin-theme]` div는 어드민 루트에서 서버 렌더링되는
  wrapper이므로, 이 패턴을 쓰는 모든 하위 클라이언트 컴포넌트가 하이드레이션 시점에는 이미
  해당 DOM 노드가 문서에 존재한다. 즉 `useEffect` 없이 `useState`의 lazy initializer로
  마운트 시점에 한 번만 조회해도 동일하게 동작한다 (동작 변경 없음, 렌더 타이밍만 이펙트 이후
  → 최초 클라이언트 렌더 시점으로 당겨짐).
- SSR 시 `document`가 없으므로 `typeof document === 'undefined'` 가드를 포함해야 한다.
- 컨테이너가 없는 경우(포털 대상 미발견) 동작이 기존과 동일해야 한다 (여전히 `null` 유지).
- `sidebar.tsx`는 `React.useState`/`React.useEffect` 네임스페이스 호출 스타일을 쓰므로 그
  파일의 기존 스타일(네임스페이스 접근)을 유지한 채 수정한다.
- 로직 변경이 아니므로 각 파일의 나머지 코드(포털 대상으로 `themeContainer`를 사용하는
  AlertDialog/Sheet/Dialog 등)는 손대지 않는다.

### UI/UX 관점 (해당 시)
- 해당 없음 (동작 변경 없음, 린트 규칙 준수만을 위한 리팩터링)

### 컨텐츠 관점 (해당 시)
- 해당 없음

## 구현 계획
각 파일에서:
```ts
const [themeContainer] = useState<HTMLElement | null>(() =>
  typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
)
```
형태로 교체하고, 더 이상 쓰이지 않는 `setThemeContainer`·`useEffect` import를 정리한다
(단, 해당 파일에서 `useEffect`를 다른 용도로도 쓰고 있다면 import는 유지).
수정 후 `npm run lint`로 `react-hooks/set-state-in-effect` 에러가 17개 파일 모두에서
사라졌는지, 새 에러가 생기지 않았는지 확인한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
17개 파일 전체에서 `useState(null) + useEffect(() => setState(document.querySelector(...)))`
패턴을 `useState<HTMLElement | null>(() => typeof document === 'undefined' ? null : document.querySelector(...))`
lazy initializer 형태로 교체했다. `sidebar.tsx`는 `React.useState` 네임스페이스 스타일을 유지한 채
동일하게 수정했다. 더 이상 `useEffect`를 이 용도로 쓰지 않게 된 15개 파일에서는 `useEffect` import를
제거했다(`useEffect`를 다른 용도로도 쓰는 `src/app/admin/badges/BadgeForm.tsx`와, 네임스페이스
스타일이라 import 정리 대상이 아닌 `sidebar.tsx`는 제외). 로직·JSX·동작은 변경하지 않았다.

### 변경된 파일
```
src/app/admin/today/TodayCardTable.tsx
src/app/admin/itembooks/ItemBookForm.tsx
src/app/admin/ambient-drop/AmbientDropForm.tsx
src/app/admin/poi/PoiForm.tsx
src/app/admin/poi/CategoryManager.tsx
src/app/admin/simulator/page.tsx
src/app/admin/factions/FactionsTable.tsx
src/app/admin/factions/FactionForm.tsx
src/app/admin/abusing/AbusingClient.tsx
src/app/admin/abusing/PoiBlockTable.tsx
src/app/admin/abusing/BanTable.tsx
src/app/admin/badges/BadgeForm.tsx
src/components/admin/ui/sidebar.tsx
src/components/admin/itembooks/ItemBookActiveToggleButton.tsx
src/components/admin/itembooks/ItemBookTable.tsx
src/components/admin/badges/BadgesTable.tsx
src/components/admin/badges/BadgeActiveToggleButton.tsx
```

### 테스트 결과
- [x] `npm run lint` 실행 — 17개 파일 모두에서 `[data-admin-theme]` 조회 관련
      `react-hooks/set-state-in-effect` 에러가 사라짐을 확인
- [x] `CategoryManager.tsx`(수정 전 린트가 못 잡던 파일)도 동일 패턴으로 수정 완료,
      수정 후에도 새 에러 없음
- [x] `src/app/admin/badges/BadgeForm.tsx`의 두 번째(별개) `set-state-in-effect` 발생과
      `src/components/admin/ui/sidebar.tsx`의 `Math.random` impure function 에러는 이번
      티켓 범위가 아니므로 그대로 남아 있음을 확인(둘 다 티켓의 "범위 밖" 목록과 일치)
- [x] `setThemeContainer` 참조가 코드베이스에 더 이상 남아 있지 않음을 grep으로 확인

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조
- [x] 해당 없음 (사용자 노출 텍스트 변경 없음, 순수 리팩터링)

### 배포 정보
- 배포일: staging 2026-08-27 (프로덕션 반영은 `/jam-ship`으로 별도 진행)
- 환경: staging
- 커밋: 82934d05 (staging 머지 커밋)

### 주요 의사결정 / 핵심 메모
- 티켓 지시대로 17개 파일 모두 동일한 방식으로 통일해 수정했다(파일마다 다르게 고치지 않음).
- `useEffect`를 다른 용도로 겸용하는 `BadgeForm.tsx`는 import를 유지했다.

### 잔여 이슈
- 범위 밖으로 명시된 6개 파일(`BadgeShareButton.tsx`, `InventoryItemHistorySheet.tsx`,
  `BadgeForm.tsx` 157행 부근 두 번째 발생, `BottomSheet.tsx`, `use-mobile.tsx`,
  `dotmatrix-hooks.ts`)의 `react-hooks/set-state-in-effect` 에러는 이번 티켓에서 다루지
  않았다(티켓 지시에 따름).
