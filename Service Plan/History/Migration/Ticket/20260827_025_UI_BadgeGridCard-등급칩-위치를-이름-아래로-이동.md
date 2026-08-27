---
id: 20260827_025
category: UI
status: OPEN
created: 2026-08-27
closed:
---

# [UI] BadgeGridCard — 등급칩 위치를 이름 아래로 이동, 고정 예약 높이 제거

## 배경 / 문제 정의
티켓 [20260827_024](20260827_024_UI_배지등급칩-Common-미표시-정책-도입.md)에서 common 등급 배지는
등급칩(RarityBadge)을 아예 표시하지 않도록 정책을 바꿨다. 그런데 `BadgeGridCard` 패턴은 칩이 없을 때도
"썸네일 → [칩 자리로 예약된 고정 높이 박스] → 이름" 순서를 그대로 유지하고 있어, 실제 화면(스테이징
확인 스크린샷)에서 썸네일과 이름 사이에 부자연스러운 빈 간격이 생겼다.

원인은 두 가지가 겹쳐 있다:
1. 칩 자리로 예약해둔 높이(`design-system` 카탈로그본 `minHeight: 24`, 서비스 컴포넌트 Tailwind `h-6`
   = 24px)가, 이전 세션에 칩 자체를 8px 폰트·4px/9px 패딩(실제 높이 ~16px)으로 줄일 때 함께 줄지
   않았다.
2. 예약 위치 자체가 "이미지 바로 아래"라, 칩이 없을 때 시선이 가장 먼저 어색함을 느끼는 자리에 빈
   공간이 생긴다.

## 상세 요구사항

### 서비스/코드베이스 관점
- **BadgeGridCard 패턴에서만** 순서를 `썸네일 → 이름 → 칩(있을 때만)`으로 변경한다 (다른 패턴은
  손대지 않는다 — CollectionGridCard의 칩은 썸네일 위 오버레이 배지라 이 문제와 무관).
- 칩 자리의 고정 높이 예약(`minHeight: 24` / `h-6`)을 제거한다. 실제 서비스 호출부를 전수 확인한
  결과 `BadgeGridCard`는 예외 없이 `grid grid-cols-3` 안에서만 쓰이므로(`BadgesClient`,
  `ProfileClient`, `CombineClient`, `SlotGrid`, `InventoryGrid`), 같은 행(row) 안 카드 높이 정렬은
  CSS Grid의 기본 `align-items: stretch`에 맡긴다 — 칩이 있는 카드가 더 길어지는 만큼의 차이는
  카드 맨 아래 여백으로 조용히 흡수되며, 이미지-이름 사이의 부자연스러운 빈틈보다 훨씬 눈에 덜 띈다.
- **병존 구현 양쪽 모두 수정 필수** (1.6절): `design-system/components/patterns/BadgeGridCard.jsx`
  (모듈러 카탈로그본, Storybook이 이걸 렌더링)와 `src/components/ui/BadgeGridCard.tsx`(실서비스
  컴포넌트)는 서로 독립 구현이라 값을 수동으로 동기화해야 한다. 하나만 고치면 다른 쪽은 그대로 남는다.
- `design-system/components/patterns/BadgeGridCard.stories.tsx`는 코드 변경만으로 별도 수정이
  필요 없을 가능성이 높지만(레이아웃 순서만 바뀌고 props/스토리 구성은 동일), 실제로 스토리북에서
  확인해 이상 없는지 점검한다.
- `BadgeGridCard.jsx`/`.tsx`의 JSDoc 주석("레이아웃 (위→아래): 썸네일 → 등급 pill → 이름")도 새
  순서에 맞게 갱신한다.

### UI/UX 관점 (해당 시)
- 칩이 있는 카드와 없는 카드가 같은 행에 섞여도 카드 배경(어두운 회색 surface) 높이가 행 안에서
  깔끔히 맞아야 한다 (Storybook "그리드 레이아웃 (4×2)" 스토리로 확인).
- 이미지와 이름 사이 간격은 칩 유무와 무관하게 항상 동일해야 한다.

### 컨텐츠 관점 (해당 시)
- 해당 없음

## 구현 계획
1. `design-system/components/patterns/BadgeGridCard.jsx`: JSX 순서를 썸네일 → 이름 → (조건부) 칩으로
   재배치. 칩을 감싸던 `minHeight: 24` wrapper div 제거, 칩이 있을 때만 최소한의 `marginTop`(간격
   토큰)만 적용
2. `src/components/ui/BadgeGridCard.tsx`: 동일한 순서·구조 변경 (Tailwind `h-6` 제거)
3. 두 파일의 JSDoc/주석 갱신
4. Storybook에서 "그리드 레이아웃 (4×2)" 스토리로 시각 확인 (common/rare/legend/mythic 섞인 행의
   카드 높이 정렬, 이미지-이름 간격)
5. 실서비스는 로컬 dev 서버 또는 staging에서 `/badges`, `/profile`, `/collections/[id]`,
   인벤토리 등 `grid grid-cols-3` 호출부 중 최소 1곳 확인

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
BadgeGridCard 패턴(모듈러 카탈로그본 + 서비스 병존 구현) 양쪽에서 JSX/DOM 순서를
`썸네일 → 이름 → (조건부) 등급 pill`로 재배치하고, 칩 자리를 위해 예약해뒀던 고정 높이
wrapper(`minHeight: 24` / `h-6`)를 완전히 제거했다. 칩은 `!undiscovered` 조건에서만
렌더링되며, 부모 flex column의 기존 `gap: var(--spacing-4)`가 칩이 실제로 렌더링될 때만
이름-칩 간격을 만들어주므로 별도 marginTop 추가는 불필요했다(칩이 없으면 flex gap도
적용되지 않음). common 등급은 `RarityBadge`가 이미 `null`을 반환하도록 되어 있어(티켓
20260827_024) 이번 변경으로 이미지-이름 사이의 빈 간격이 사라진다.
카드 높이 고정 예약을 없앤 결과 같은 행(`grid grid-cols-3`) 안에서 칩 유무가 섞인 카드의
높이 차이는 CSS Grid 기본 `align-items: stretch`에 맡긴다(실서비스 호출부인
BadgesClient/ProfileClient/CombineClient/SlotGrid/InventoryGrid 전수 확인, 전부
`grid grid-cols-3` 안에서만 사용됨). Storybook 스토리(`BadgeGridCard.stories.tsx`)는
props/스토리 구성 변경 없이 컴포넌트 코드 변경만으로 새 순서가 반영되며, meta의 레이아웃
설명 문구만 새 순서에 맞게 갱신했다. 두 컴포넌트 JSDoc의 레이아웃 순서 주석도 갱신했다.
CollectionGridCard, RarityBadge 자체는 이번 범위에서 손대지 않았다.

### 변경된 파일
```
jam-web/design-system/components/patterns/BadgeGridCard.jsx
jam-web/design-system/components/patterns/BadgeGridCard.stories.tsx
jam-web/src/components/ui/BadgeGridCard.tsx
```

### 테스트 결과
- [x] `npm run lint` 전체 실행 — 0 errors, 26 warnings (기존 baseline과 동일, 이번 변경으로
  추가된 신규 warning/error 없음; BadgeGridCard.jsx의 `<img>` LCP warning은 이번 변경 이전부터
  존재하던 것으로 이번 수정과 무관)
- [x] Storybook 로컬 서버(:6006)에서 `modular-patterns-badgegridcard--*` 스토리 인덱스가
  정상 등록되어 있음을 확인(컴파일 에러 없음)
- [ ] Storybook UI를 사람이 직접 열어 "그리드 레이아웃 (4×2)" 스토리에서 common/rare/legend/mythic
  섞인 행의 카드 높이 정렬·이미지-이름 간격을 시각 확인 — 이번 세션에는 브라우저 스크린샷 도구가
  없어 코드/스토리 인덱스 레벨 검증까지만 수행함. 사용자가 Storybook에서 직접 확인 필요
- [ ] 실서비스(`/badges`, `/profile`, `/collections/[id]`, 인벤토리)는 이 브랜치가 아직 staging에
  병합되지 않아 `jam-stage.vercel.app`에 반영되지 않은 상태 — staging 병합 후 확인 필요

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- [x] 해당 없음 (레이아웃 변경만, 텍스트 변경 없음)

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
> `/impeccable layout` 상담으로 방향을 먼저 확정했다: 칩을 옮기기만 하고 고정 예약을 유지하면
> 빈 공간이 자리만 옮길 뿐 사라지지 않는다는 판단으로, 예약 자체를 제거하고 그리드 기본 stretch에
> 맡기는 쪽으로 결정. 이 정렬 방식은 실제 호출부가 전부 `grid grid-cols-3`임을 확인한 뒤 내린 결정.

### 잔여 이슈
-
