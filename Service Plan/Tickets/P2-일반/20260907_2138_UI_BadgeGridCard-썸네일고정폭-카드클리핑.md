---
id: 20260907_2138
category: UI
priority: P2
status: OPEN
created: 2026-09-07
closed:
---

# [UI] BadgeGridCard 썸네일이 고정 90px이라 좁은 화면에서 좌우가 잘린다

## 배경 / 문제 정의

티켓 [20260907_2059](20260907_2059_UI_아이템배지-개체별-상세라우팅-및-장착개체-선택.md)
게이트 리뷰·인터랙션 리뷰에서 함께 발견된 범위 밖 항목이다.

`BadgeGridCard`의 썸네일이 `w-[90px] h-[90px]` **고정**인데, `grid-cols-3` 배치에서 카드 콘텐츠
폭은 360px 뷰포트 기준 약 80px이다. 카드가 `overflow-hidden`이라 썸네일 좌우가 각 5px씩 잘린다.

**이번 변경으로 생긴 문제가 아니라 기존 동작**이며, `/inventory` 목록과 드랍 바텀시트에서도
동일하게 나타난다. 20260907_2059에서 선택 시트라는 새 사용처가 늘어나며 다시 관측됐다.

인터랙션 리뷰가 덧붙인 지적: 이 고정폭 때문에 "카드 콘텐츠 폭 = 80px"이라는 전제로 내부 요소
크기를 역산하면 틀린 값이 나온다. 실제 클리핑 경계는 패딩 박스(약 104px)다. 즉 이 카드 안에
무언가를 넣을 때 **폭 예산을 추정으로 잡으면 안 되는 상태**라는 점이 더 실질적인 위험이다.

## 상세 요구사항

### UI/UX 관점
- 썸네일을 컨테이너 폭에 반응하도록 바꾼다 (예: `w-full aspect-square` + `max-w-[90px]`)
- 인벤토리 목록·드랍 바텀시트·장착 선택 시트 세 사용처에서 모두 확인한다
- 360px / 390px / 430px 뷰포트에서 실렌더로 검증할 것 — 계산으로 갈음하지 않는다
  (`DESIGN_RENEWAL_SPEC.md`의 "기하값은 `offsetHeight`로 실측" 원칙)

## 구현 계획
`BadgeGridCard`가 인벤토리 목록·드랍 바텀시트(`InventoryGrid.tsx`)·장착 선택 시트(`SlotGrid.tsx`,
`badges/[id]/page.tsx`) 세 곳에서 공유되므로, 컴포넌트 한 곳만 고치면 세 사용처 모두 반영된다.
썸네일 wrapper를 `w-[90px] h-[90px]` 고정에서 `w-full aspect-square max-w-[90px]`로 바꾸고,
내부 `next/image`를 `width/height` 고정 방식에서 `fill`(+ `sizes="90px"`)로 전환한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`src/components/ui/BadgeGridCard.tsx`의 썸네일 wrapper 클래스를
`w-[90px] h-[90px]` → `relative w-full aspect-square max-w-[90px]`로 변경했다. `w-full`이 카드
콘텐츠 폭(`grid-cols-3`에서 좁아지는 실제 폭)을 그대로 따라가고, `aspect-square`로 정사각형을
유지하며, `max-w-[90px]`는 넓은 화면에서 과도하게 커지는 것만 막는다. 내부 `next/image`는 고정
`width={90} height={90}`이 부모 크기 변화를 따라가지 못하므로 `fill`(`sizes="90px"`)로 전환했다.

이 컴포넌트는 인벤토리 목록·드랍 바텀시트·장착 선택 시트(컬렉션 슬롯, 아이템배지 개체 선택)
세 사용처 모두에서 공유되므로 컴포넌트 1곳 수정으로 세 화면에 동일하게 반영된다.

### 변경된 파일
```
jam-web/src/components/ui/BadgeGridCard.tsx
```

### 테스트 결과
- [x] `npm run lint` 전체 실행 — 0 errors, 14 warnings (모두 이번 변경과 무관한 기존 warning:
  design-system stories/foundations의 미사용 변수·`<img>` 사용 경고 등)
- [ ] 360px/390px/430px 실렌더 확인 — 이 작업 환경(격리 워크트리, 브라우저/스크린샷 도구 미제공)에서
  수행하지 못함. staging 배포 후 실기기/브라우저 뷰포트로 확인 필요 (아래 잔여 이슈 참조)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- [x] 해당 없음 (텍스트 변경 없음)

### 배포 정보
- 배포일: 
- 환경: 
- 커밋: 

### 주요 의사결정 / 핵심 메모
- `w-full aspect-square max-w-[90px]`는 티켓이 제시한 예시안을 그대로 채택했다. `next/image`를
  `fill` 모드로 바꾼 이유: 기존 `width={90} height={90}`는 브라우저가 실제 렌더 크기를 CSS로
  결정하더라도 Next.js Image의 intrinsic size 힌트로 남아있어 반응형 wrapper와 크기가 어긋날 수
  있다 — `fill`이 부모(`relative` wrapper)를 그대로 채우는 표준 패턴이다.

### 잔여 이슈
- 이번 세션은 실렌더 스크린샷 도구가 없는 격리 워크트리라 360/390/430px 실측 검증을
  수행하지 못했다. 오케스트레이터 또는 리뷰 단계에서 staging 배포 후
  (또는 로컬 `npm run dev` + 실제 브라우저) 세 사용처(인벤토리 목록, 드랍 바텀시트,
  장착 선택 시트)를 실제 뷰포트에서 확인해야 티켓의 "계산으로 갈음하지 않는다" 요구를
  완전히 충족한다.
