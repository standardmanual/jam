---
id: 20260907_2221
category: UI
priority: P2
status: OPEN
created: 2026-09-07
closed:
---

# [UI] 장착 개체 선택 시트를 ListRowCard 목록으로 재구성

## 배경 / 문제 정의

티켓 [20260907_2059](../P1-중요/20260907_2059_UI_아이템배지-개체별-상세라우팅-및-장착개체-선택.md)에서
장착 개체 선택 시트를 만들면서 `InventoryGrid mode="select"` + `BadgeGridCard`(1열)를 썼다.
그 티켓의 게이트 재리뷰가 남긴 지적이 그대로 확인됐다:

> 328px 폭 카드 안에 90px 썸네일만 가운데 놓이는 세로 스택이라 여백이 크다. 1열이면
> `ListRowCard`(썸네일 좌 + 이름·일련번호 우) 쪽이 문법상 자연스럽다.

**후보가 전부 같은 배지**라는 점이 문제의 핵심이다. 지금은 행마다 같은 이미지·같은 이름·같은
등급칩이 반복되고, 정작 사용자가 봐야 하는 **일련번호만 다르다.** 반복되는 정보가 화면 대부분을
차지하고 판단 근거는 작게 들어가 있다.

## 상세 요구사항

### UI/UX 관점

1. **후보 목록을 `ListRowCard`로 바꾼다** — `InventoryGrid` + `BadgeGridCard` 조합을 이 시트에서
   걷어낸다.
2. **시트 상단에는 배지 이름만 한 번 표시한다** — 어느 배지인지는 여기서 알려준다.
3. **각 행에는 등급칩과 일련번호를 세로로 쌓는다** (등급칩이 위, 일련번호가 아래).
   행 전체를 누르면 장착되며, 행 안에 별도 버튼을 두지 않는다.

> 등급칩 위치는 접수 과정에서 한 번 바뀌었다. 처음에는 시트 상단에 「등급칩 + 배지 이름」을
> 함께 두기로 했으나, 각 행의 일련번호 위로 옮기는 것으로 확정했다. 상단에는 등급칩을 두지
> 않는다 — 같은 칩이 화면에 중복해서 나오지 않게 하기 위함이다.

### 서비스/코드베이스 관점

**재사용 판정 (오케스트레이터 결정 — 이대로 따를 것)**

| 용도 | 사용할 것 | 근거 |
|---|---|---|
| 후보 행 | `src/components/ui/ListRowCard` | 서비스 13개 화면이 쓰는 표준 어휘. **`onClick`을 넘기면 `<button>`으로 렌더돼 행 전체가 눌린다**(요구사항 3에 그대로 맞음). `children`으로 텍스트 영역을 통째로 대체할 수 있어 일련번호만 넣기 쉽다. `ItemEarnHistory`가 이미 **같은 성격의 개체 목록**에 이 컴포넌트를 쓰고 있다 |
| 등급칩 | `@ds/components/cards/RarityBadge` | 연결된 컴포넌트. 배지 상세 히어로(`BadgeHeroSection.tsx:110`)와 같은 어휘. **행마다 렌더되므로 주의사항 4의 NULL 함정을 반드시 확인할 것** |
| 일련번호 | `@ds/components/patterns/ItemSerialCode` (`animate={false}`) | 20260907_2059에서 정한 대로 유지 |
| 시트 | `src/components/ui/BottomSheet` | 유지 |

**신규 MODULAR 컴포넌트를 만들지 않는다.**

**주의사항 4건**

1. **`BottomSheet`는 건드리지 않는다.** 상단이 배지 이름(문자열)뿐이라 기존
   `title?: string`(`src/components/ui/BottomSheet.tsx:19`)으로 충분하다. 등급칩을 상단에 두는
   안이었다면 `ReactNode`로 넓혀야 했지만, 그 안은 채택되지 않았다. **병존 구현(DS·서비스 양쪽에
   존재)을 불필요하게 건드리지 않는 것이 이 결정의 부수 이득이다.**
2. **`ListRowCard`에는 선택 상태 시각이 없다** (`active:scale-[0.98]`만 있음). 20260907_2059에서
   확보한 "탭 즉시 반응"이 사라지지 않도록 `className`으로 선택 톤을 준다. 요청 진행 중에는
   중복 탭이 막혀야 한다(현행 `pendingBadgeId` 가드 유지).
3. **`InventoryGrid`에 죽은 prop이 남는다.** `columns`·`serial`·`disabled`·`selectedItemId`는
   이 시트가 유일한 사용처였다. 다른 소비자가 없음을 확인한 뒤 **함께 제거한다** — 남겨두면
   다음 작업자가 쓰이는 기능으로 오해한다. (`selectedItemId`는 20260907_2059 이전부터 아무도
   넘기지 않던 prop이므로, 제거하면 그 이전 상태로 돌아가는 셈이다.)
4. **아이템배지는 현재 전부 `common` 등급이다**(36종, 레벨형 0건 — 2026-09-07 실측). 따라서
   등급칩은 당분간 항상 같은 값을 보여준다. `RarityBadge`는 rarity가 NULL이면 칩이 조용히
   사라지는 함정이 있으나(티켓 20260905_0036), 아이템배지에는 NULL이 없어 해당하지 않는다.

### 문구

시트 제목이 배지 이름으로 바뀌므로 `d.itembooks.selectItemTitle`("어느 배지를 장착할까요?")은
쓰이지 않게 된다. 안내문(`selectItemBody`)은 개수와 선택 기준을 알려주므로 유지하되, 제목이
바뀐 맥락에 맞는지 `UX_WRITING_GUIDELINE.md` 기준으로 다시 본다. 쓰이지 않게 된 키는 남기지 말고
정리한다.

## 구현 계획

**DB 변경 없음.** 장착 요청 경로(`POST /api/itembooks/{id}/slot` → `slot_item_into_book`)도
그대로다. 시트 내부 표현만 바꾼다.

예상 변경 파일:
```
jam-web/src/app/(main)/collections/[id]/SlotGrid.tsx   시트 재구성(핵심)
jam-web/src/components/inventory/InventoryGrid.tsx     죽은 prop 제거
jam-web/src/lib/i18n/ko.ts                             문구 정리
```

`BottomSheet.tsx`는 변경 대상이 아니다(주의사항 1 참고).

### 회귀 확인 포인트
- 후보 1개일 때 시트가 열리지 않고 즉시 장착되는 동작이 유지되는가
- 장착 실패가 시트 안에서 보이는가 (20260907_2059에서 확보한 동작)
- 인벤토리 목록(`/inventory`)과 드랍 바텀시트(`PoiCarouselModal`)가 `InventoryGrid` prop 제거에
  영향받지 않는가
- 시트를 닫았다 다시 열 때 선택 상태가 남지 않는가
- 등급칩이 모든 행에서 실제로 그려지는가 (rarity가 비면 조용히 사라진다 — 주의사항 4)

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

- 선택 시트의 `InventoryGrid mode="select"`(1열 `BadgeGridCard`)를 걷어내고 `ListRowCard` 목록으로
  재구성했다. 시트 제목은 `selectingSlot.badge.name`(배지 이름), 각 행은 `children`으로 텍스트
  영역을 통째로 대체해 **등급칩(위) → 일련번호(아래)** 세로 스택을 그린다.
- `ListRowCard`는 `onClick`이 있으면 `<button>`으로 렌더되므로 행 전체가 눌린다. 행 안에 별도
  버튼은 두지 않았다.
- 선택 톤은 `className`으로 프라이머리 inset 링(`shadow-[inset_0_0_0_2px_var(--color-primary)]`)을
  준다. 배경톤 대신 링을 쓴 이유는 카드 기본 배경(`bg-surface-elevated`)과 배경 유틸리티가
  경합하지 않아 결과가 CSS 규칙 순서에 좌우되지 않기 때문이다.
- `InventoryGrid`에서 이 시트만 쓰던 죽은 prop(`columns`·`serial`·`disabled`·`selectedItemId`)과
  그에 딸린 `ItemSerialCode` 분기·`SELECT_SERIAL_HEIGHT_PX` 상수를 제거했다. 남은 호출부
  2곳(`/inventory`, `PoiCarouselModal` 드랍 시트)은 애초에 이 prop들을 넘기지 않았다.
- 일련번호 높이 상수(40px)는 근거 주석과 함께 `SlotGrid.tsx`로 옮겼다(행 폭 기준으로 근거를
  다시 씀).
- `BottomSheet`는 손대지 않았다(제목이 문자열이라 기존 `title?: string`으로 충분).

### 변경된 파일
```
jam-web/src/app/(main)/collections/[id]/SlotGrid.tsx
jam-web/src/components/inventory/InventoryGrid.tsx
jam-web/src/lib/i18n/ko.ts
```

### 테스트 결과
- [x] `npm run lint` 전체: **0 errors, 13 warnings** (13건 모두 `design-system/**`의 기존 경고 —
      변경 파일에서 발생한 경고 0건)
- [x] `tsc --noEmit` 전체: 오류 0
- [x] 행 레이아웃 실측(Chromium 실렌더, `ListRowCard`+`RarityBadge`+`ItemSerialCode` 그대로 번들해
      `offsetWidth` 측정): 뷰포트 320/360/430px에서 행 콘텐츠 폭 254/294/364px, 일련번호 폭
      212px → **가장 좁은 320px에서도 넘치지 않음**
- [x] 등급칩 실렌더 확인: `rare`는 칩이 그려지고 **`common`·NULL은 그려지지 않음**(행 높이
      92px vs 72px로 확인). 아래 «잔여 이슈» 참조
- [ ] 실화면 확인: 이 브랜치가 staging에 병합되기 전이라 `jam-stage.vercel.app`에는 아직
      반영되지 않았다 — **staging 병합 후 확인 필요**

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [x] 용어 일관성: 신규 문구 없음. 안내문의 «장착»은 기존 고정 용어 그대로
- [x] 톤앤매너: 선택을 돕는 안내문 — 해요체 유지
- [x] 에러 메시지: 장착 실패 사유는 기존 문구를 그대로 시트 안에 띄운다(변경 없음)
- [x] 문장 규칙: 제목은 배지 이름(고유명사)이라 마침표 없음. 안내문 두 문장 모두 마침표 유지
- [x] 표기 규칙: 만료 임박 칩의 날짜 표기(`M/D 만료`) 기존 그대로
- 정리: 제목이 배지 이름으로 바뀌어 쓰이지 않게 된 `d.itembooks.selectItemTitle` 키 삭제.
  안내문 `selectItemBody`("장착할 수 있는 배지가 {count}개예요. 일련번호로 구분해서 골라주세요.")는
  제목이 배지 이름으로 바뀐 뒤에도 «개수 + 선택 기준»을 그대로 전달하므로 유지했다.

### 배포 정보
- 배포일: 
- 환경: 
- 커밋: 

### 주요 의사결정 / 핵심 메모

- **만료 임박 칩("곧 만료")을 일련번호 «아래»에 유지했다.** 20260907_2059가 "만료가 코앞인 개체를
  모르고 장착하는 것"을 막으려고 넣은 칩이라 이번 재구성에서 조용히 사라지면 안전장치가 사라진다.
  `ListRowCard`의 `trailing` 슬롯에 두는 안도 있었으나, 320px 뷰포트에서 일련번호(212px)와 폭을
  두고 경합해 넘칠 수 있어(잔여 폭 약 174px) 스택 아래에 뒀다 — 20260907_2059의 카드 배치
  (일련번호 아래 만료 칩)와 같은 순서다.
- 선택 상태 시각은 링으로. `ListRowCard`에는 선택 상태 표현이 없어(`active:scale-[0.98]`뿐)
  탭 즉시 반응이 사라질 수 있었다. 중복 탭 가드(`pendingBadgeId`)는 그대로다.

### 잔여 이슈
- **아이템배지가 전부 `common`인 동안 등급칩은 화면에 나오지 않는다.** `RarityBadge`는 설계상
  `common`에서 아무것도 그리지 않는다(`RarityBadge.jsx` — 그리드·리스트 노이즈 축소, 티켓
  20260827_024). 티켓 주의사항 4는 NULL 함정만 다뤘으나, 실제로 칩을 지우는 것은 NULL이 아니라
  **`common` 규칙**이다. 따라서 요구사항 3의 «등급칩 + 일련번호» 스택은 rare/epic/mystic
  아이템배지가 생기기 전까지 일련번호만 보인다. 등급칩을 지금 당장 보이게 하려면
  `RarityBadge`의 common 비렌더 규칙을 바꿔야 하고, 그건 서비스 9개 호출부에 함께 영향을 주므로
  이 티켓 범위 밖이다 — 판단 필요.
