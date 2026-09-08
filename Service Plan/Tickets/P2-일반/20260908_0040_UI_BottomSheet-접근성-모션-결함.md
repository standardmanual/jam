---
id: 20260908_0040
category: UI
priority: P2
status: OPEN
created: 2026-09-08
closed:
---

# [UI] BottomSheet의 접근성·모션 결함 — 13개 화면 공용

## 배경 / 문제 정의

티켓 [20260907_2059](20260907_2059_UI_아이템배지-개체별-상세라우팅-및-장착개체-선택.md)와
[20260907_2221](20260907_2221_UI_장착개체-선택시트-ListRowCard-재구성.md)의 인터랙션 리뷰에서
반복해서 지적된 항목을 모았다. 두 티켓 모두 `BottomSheet` 무변경이 전제라 손대지 않았다.

`src/components/ui/BottomSheet.tsx`는 서비스 **13개 화면**이 쓰는 공용 오버레이다. 고치면 전
사용처가 함께 이득을 본다.

### 결함 4건

1. **다이얼로그로 announce되지 않는다** — `role="dialog"`·`aria-modal`·`aria-labelledby`가 없다.
   보조기술 사용자에게는 그냥 페이지에 내용이 늘어난 것으로 읽힌다.
   (참고: DS 쪽 `design-system/components/navigation/BottomSheet.jsx:79`는 `aria-labelledby`를
   이미 쓴다 — 병존 구현 사이에 격차가 있다.)
2. **포커스 트랩·포커스 복귀가 없다.** 시트가 `document.body` 포털이라 DOM 맨 뒤에 붙는데,
   여는 버튼에서 Tab을 누르면 **페이지 전체를 지나야** 시트 내용에 닿는다. 닫은 뒤 포커스가
   갈 곳을 잃는 경우도 있다(예: 장착 성공 후 「추가」 버튼이 「해제」로 교체되며 사라짐).
   20260907_2221이 "행 전체가 유일한 액션"인 구조로 바꾸면서 이 문제의 체감이 커졌다.
3. **Escape로 닫히지 않는다.**
4. **`prefers-reduced-motion`에서 350ms 동안 화면이 잠긴다.** `.t-panel-slide`·`.t-panel-backdrop`은
   `transition: none !important`로 가드되지만 `--panel-close-dur: 350ms`(`globals.css:328`)는
   축소되지 않는다. 시트는 즉시 사라진 것처럼 보이는데, 루트의 `fixed inset-0 z-50`
   (`BottomSheet.tsx:251`, 투명하지만 `pointer-events` 기본값 auto)이 350ms 더 화면을 덮어
   **뒷화면 탭이 그동안 먹힌다.**
5. **배경 스크롤 락이 참조 카운팅 없이 덮어쓴다** — 티켓
   [20260908_0223](20260908_0223_UI_POI픽업목록도-동일이름-그룹핑-및-개체선택시트.md) 인터랙션
   리뷰가 발견(2026-09-08). `BottomSheet.tsx:184-192`의 배경 스크롤 락 effect는 `lingering`일
   때 `main`의 `overflow`를 캡처해 `hidden`으로 바꾸고, 언마운트 시 캡처해둔 이전 값으로
   되돌린다 — **인스턴스 하나만 열려 있다는 전제**다. 20260908_0223에서 처음으로 "시트 →
   시트" 전환(개체 선택 시트를 닫으며 동시에 상세 시트를 여는 흐름)이 생기면서, 닫히는
   시트가 여전히 `''`(락 걸리기 전 값)로 캡처해둔 `overflow`를 350ms 뒤 복원해버려, 새로 연
   시트가 떠 있는 동안 **배경 스크롤이 풀리는 창**이 생긴다. 같은 350ms 동안 두 시트의
   backdrop이 겹쳐 그려지는 경미한 이중 렌더도 같은 원인이다. `detent="full"`이라 대부분
   가려지지만 상단 peek 여백에서 노출될 수 있다.

## 결함 5의 재현 경로

POI 픽업 목록에서 같은 배지를 2명 이상이 드랍해 개체 선택 시트가 뜬 상태 → 개체 하나를
고르면 `setSelectedDrop(drop)`과 `setPickupCandidateGroup(null)`이 같은 배치에서 호출돼
개체 선택 시트가 닫히는 동시에 상세 시트(`BadgeDetailSheet`)가 열린다. 컬렉션 장착·POI
드랍 쪽은 선택 후 확인 UI가 시트가 아니라 카드 인라인 렌더라 이 경합 자체가 없었다 —
POI 픽업이 처음으로 이 갭을 드러낸 경로다.

## 상세 요구사항

### 서비스/코드베이스 관점
- 1~3번: `role="dialog"` + `aria-modal="true"` + `aria-labelledby`(title이 있을 때), 열릴 때
  시트 안으로 포커스 이동, 닫힐 때 여는 요소로 복귀, Tab 순환 트랩, Escape 닫기
- 4번: 루트에 `pointer-events-none`을 주고 시트 본체·백드롭에만 `auto`를 주거나,
  모션 축소 시 lingering을 0ms로 만든다
- 5번: 배경 스크롤 락을 참조 카운팅 방식으로 바꾼다(모듈 전역 카운터 또는 컨텍스트) — 열린
  `BottomSheet` 인스턴스 수를 세어 0에서 1이 될 때만 `overflow: hidden`을 걸고, 1에서 0이
  될 때만 복원한다. 개별 인스턴스가 자기만의 `prevOverflow`를 캡처/복원하는 현재 구조를
  버려야 한다

### 주의
- **13개 화면 공용이므로 회귀 표면이 넓다.** 사용처를 전수 확인할 것:
  `grep -rn "components/ui/BottomSheet" src/`
- 특히 **드래그-투-클로즈**(서비스 구현의 고유 기능)와 포커스 트랩이 충돌하지 않아야 한다
- `BottomSheet`는 DS(`design-system/components/navigation/BottomSheet.jsx`)와 **병존 구현**이다.
  어느 쪽을 정본으로 삼을지 함께 판단하고, 서비스 쪽만 고친다면 그 이유를 완료 기록에 남긴다
  (`/jam-work` 1.6절의 병존 구현 8종 규칙)

## 구현 계획
`src/components/ui/BottomSheet.tsx`를 직접 수정한다(오케스트레이터 UI 재사용 판정 — 아래
"주요 의사결정" 참조). 13개 사용처(정확히는 직접 import 8개 파일, 화면 기준 13개 진입점)를
전수 확인하고, 드래그-투-클로즈(포인터 핸들러)와 포커스 트랩(키보드 핸들러)이 서로 다른
이벤트 축이라 충돌 없음을 확인한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
1. **role="dialog" + aria-modal + aria-labelledby** — 시트 본체(`sheetRef`)에 `role="dialog"`,
   `aria-modal="true"`를 항상 붙이고, `title`이 있을 때만 `useId()`로 생성한 `titleId`를
   `aria-labelledby`/`<h2 id>`에 연결한다. `title`이 없는 시트(BadgeShareButton·ItemEarnHistory·
   PoiEarnHistory·BadgeDetailSheet·BadgeUnlockSheet)는 티켓 문구("title이 있을 때") 그대로
   레이블 없이 둔다.
2. **포커스 트랩·복귀** — `open`이 true가 되는 순간(이미 DOM에 붙어 있는 시점) 열기 전
   `document.activeElement`를 캡처하고, 시트 내부의 첫 포커스 가능 요소(없으면 시트 자체,
   `tabIndex={-1}`)로 포커스를 옮긴다. `keydown` 리스너로 Tab을 시트 내부에 순환시키고
   (Shift+Tab 포함, 활성 요소가 시트 밖으로 나가면 강제로 되돌림), 닫힐 때(effect cleanup)
   캡처해둔 요소로 복귀한다. 그 요소가 그새 DOM에서 사라졌으면(장착 성공 후 버튼 텍스트
   교체 등) `document.contains` 체크로 건너뛰어 존재하지 않는 요소에 `.focus()`를 호출하지
   않는다. `onClose`는 대부분 호출부가 인라인 화살표로 넘기므로 매 렌더 아이덴티티가
   바뀐다 — effect 의존성에 `onClose`를 직접 넣으면 시트가 열려 있는 동안 부모가 리렌더될
   때마다 포커스를 되채가는 회귀가 생겨, `onCloseRef`로 최신값만 참조하고 effect는 `[open]`
   에만 의존하도록 분리했다.
3. **Escape 닫기** — 같은 `keydown` 리스너에서 `Escape` 시 `onCloseRef.current()` 호출.
4. **reduced-motion 350ms 뒷화면 탭 먹힘** — 원인은 두 겹이었다. (a) 백드롭(`.t-panel-backdrop`)
   에 `pointer-events` 규칙 자체가 없어 기본값 `auto`로 opacity 0 상태에서도 클릭을 계속
   가로챘다(패널 본체 `.t-panel-slide`는 이미 `data-open` 연동 `pointer-events: none/auto`를
   쓰고 있었는데 백드롭만 빠져 있었다). (b) 루트 `fixed inset-0 z-50` 자체도 투명하지만
   `pointer-events: auto` 기본값이라 화면 전체를 계속 덮었다. `transitions.css`의 "프로젝트
   확장" 섹션(원본 스니펫 블록은 건드리지 않는 관례)에 `.t-panel-backdrop`/
   `.t-panel-backdrop[data-open='true']`용 pointer-events 규칙을 추가하고, 루트 div에
   `pointer-events-none`을 줘 백드롭·시트 본체만 각자 `data-open`에 따라 클릭을 받게 했다.
   `t-panel-backdrop`은 FeedSection·PoiCarouselModal도 공유하는 클래스라 이 수정은 그
   쪽도 함께 고친다(같은 잠재 버그였을 가능성 — alerts 참조).
5. **배경 스크롤 락 참조 카운팅** — `src/lib/uiOverlay.ts`에 `pushMainScrollLock()`을
   추가했다. 기존 `pushTabBarHidden()`과 동일한 모듈 전역 카운터 패턴(0→1일 때만 잠그고
   1→0일 때만 푼다, 해제 함수는 idempotent). `BottomSheet.tsx`의 `lingering` 기준 스크롤
   락 effect가 각자 `prevOverflow`를 캡처/복원하던 기존 코드를 `pushMainScrollLock()`
   호출로 교체 — "닫히는 시트 → 열리는 시트" 전환(같은 배치에서 `setSelectedDrop`/
   `setPickupCandidateGroup(null)`이 함께 호출되는 POI 픽업 흐름, `PoiCarouselModal.tsx`)
   에서 두 인스턴스의 `lingering` 구간이 겹쳐도 카운트가 0에 닿기 전까지는 풀리지 않는다.

### 13개 화면 전수 확인
`grep -rn "components/ui/BottomSheet" src/` — 직접 import 8개 파일 확인, 화면별 props(title
유무·footer 유무·detent) 파악 후 각각 시나리오 검토:
- `src/app/(main)/badges/[id]/BadgeShareButton.tsx` (title 없음, detent=full, contentScrollable=false)
- `src/app/(main)/badges/[id]/ItemEarnHistory.tsx` (title 없음)
- `src/app/(main)/badges/[id]/PoiEarnHistory.tsx` (title 없음)
- `src/app/(main)/drops/BadgeDetailSheet.tsx` (title 없음, detent=full) — `PoiCarouselModal`에서
  `selectedDrop`으로 열림, 결함 5의 재현 경로 당사자
- `src/app/(main)/inventory/[itemId]/InventoryItemHistorySheet.tsx` (title 있음)
- `src/components/badges/BadgeUnlockSheet.tsx` (title 없음, footer 있음)
- `src/components/inventory/ItemCandidateSheet.tsx` (title 있음) — `PoiCarouselModal`에서
  드랍 개체 선택(`pickupCandidateGroup`)과 컬렉션/POI 장착 개체 선택 두 곳에서 재사용,
  결함 5의 재현 경로 당사자
- `SlotGrid.tsx`·`BadgeRevealOverlay.tsx`·`PoiCarouselModal.tsx`·`use-mobile.tsx`는
  `BottomSheet` 문자열이 주석(다른 티켓 참조·설계 메모)에만 등장 — 실제 import 아님, 확인 후 제외

드래그-투-클로즈와의 충돌: 포인터 이벤트(핸들 `onPointerDown/Move/Up`)와 포커스 트랩의
키보드 이벤트(`document`의 `keydown`)는 서로 다른 이벤트 축이라 겹치지 않는다. 핸들 자체는
`tabIndex` 없는 `div`라 `FOCUSABLE_SELECTOR`에 잡히지 않으므로 Tab 순환에도 끼지 않는다.

### 변경된 파일
```
jam-web/src/components/ui/BottomSheet.tsx
jam-web/src/lib/uiOverlay.ts
jam-web/src/components/transitions.css
```

### 테스트 결과
- [x] `cd jam-web && npm run lint` 전체 실행 — 0 errors, 13 warnings(모두 기존 `design-system/`
  파일의 사전 존재 경고, 이번 변경 파일과 무관)
- [x] `grep -rn "components/ui/BottomSheet" src/`로 8개 직접 import 파일 전수 확인, 각 props
  조합(title 유무·footer 유무·detent) 검토
- [ ] 실기기/스크린리더(VoiceOver 등) 수동 확인은 미실시 — 코드 레벨 검증(role/aria 속성,
  포커스 이동 로직, 이벤트 리스너 등록/해제)까지만 진행. staging 병합 후 실제 화면에서
  Tab/Shift+Tab/Escape 키보드 조작으로 재확인 필요

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- [x] 텍스트 변경이 없으면 해당 없음

### 배포 정보
- 배포일: (미배포 — review 브랜치 push까지만 수행)
- 환경:
- 커밋:

### 주요 의사결정 / 핵심 메모
- **DS(`design-system/components/navigation/BottomSheet.jsx`)로 전면 교체하지 않고 서비스
  구현(`src/components/ui/BottomSheet.tsx`)을 직접 고쳤다** — 오케스트레이터 0.5단계 판정을
  그대로 따름. 두 컴포넌트는 API가 다르고(DS는 드래그-투-클로즈 미구현, `footerBottomInset`
  일부 값 매핑 방식도 다름) 13개 호출부 전부를 마이그레이션하는 일은 이번 접근성 버그
  수정 범위를 크게 벗어난다. 다만 DS 쪽 구현이 이미 이번에 서비스 쪽에 적용한 것과 거의
  동일한 포커스 트랩·Escape·`aria-labelledby` 패턴을 갖고 있어(`useId`, 캐시된 focusable
  목록, cleanup에서 `prev?.focus()`) 이번 구현의 참고 기준으로 삼았다. 병존 구현 두 쪽의
  접근성 정책이 이제 사실상 동일한 패턴으로 수렴했다.
- **결함 4는 백드롭 CSS(`t-panel-backdrop`)와 루트 div 두 겹의 pointer-events 문제였다.**
  `transitions.css` 상단 원본 스니펫 블록은 손대지 않고, 파일 하단 "프로젝트 확장" 섹션에
  규칙을 추가하는 기존 관례를 따랐다.
- **결함 5는 `pushTabBarHidden()`과 동일한 참조 카운팅 패턴**(`uiOverlay.ts`)으로 풀었다 —
  새 컨텍스트나 별도 상태관리 라이브러리를 끌어오지 않고 기존 모듈 전역 카운터 관례를 재사용.
- **`onClose` ref 분리**는 티켓에 명시된 요구사항은 아니지만, 인라인 화살표로 넘기는 호출부가
  대부분이라(`onClose={() => setOpen(false)}`) effect 의존성에 직접 넣으면 열려 있는 동안
  부모 리렌더마다 포커스를 되채가는 새 회귀가 생길 것이 확실해 구현 중 판단으로 추가했다.

### 잔여 이슈
- 스크린리더 실기기 검증 미실시 (테스트 결과 항목 참조)
- `FeedSection.tsx`·`MissionDetailClient.tsx`·`SlotGrid.tsx`·`PoiCarouselModal.tsx`가 쓰는
  `.t-panel-backdrop`/`.t-panel-slide` 기반의 다른 패널(바텀시트 아닌 것 포함)도 이번
  pointer-events 수정의 수혜를 받았을 가능성이 높다 — 이번 티켓 범위 밖이라 그쪽의 role/
  aria/포커스트랩까지는 손대지 않았다(alerts 참조)
