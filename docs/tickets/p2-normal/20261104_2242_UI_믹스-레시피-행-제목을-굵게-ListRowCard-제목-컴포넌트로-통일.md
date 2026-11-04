---
id: "20261104_2242"
category: UI
priority: P2
status: CLOSED
created: 2026-11-04
closed: 2026-11-04
---

# [UI] 믹스(/combine) 레시피 행 제목을 굵게 하고, ListRowCard의 제목 컴포넌트 한 곳에서 받는다

## 핵심 요약

- 요구사항(사용자 지시 2026-11-04): /combine 레시피 목록의 제목을 bold로 한다. ListRow 컴포넌트를 통합으로 써서 항상 동일하게 표시되도록 하고, 기준은 미션 페이지의 미션 목록이다.
- 구현 계획: `ListRowCard.tsx`에 제목 컴포넌트 `ListRowCardTitle`(16px·700·`--foreground`·한 줄 말줄임, 미션 목록 제목과 같은 모양)을 더하고, `RecipeRewardRow.tsx`가 손으로 쓰던 제목 span 대신 이것을 쓴다.
- 관련 파일: `jam-web/src/components/ui/ListRowCard.tsx`(`ListRowCard` 위에 `ListRowCardTitle` 추가), `jam-web/src/app/(main)/combine/RecipeRewardRow.tsx`(제목 `<span>` 약 122~127줄), `jam-web/src/app/(main)/combine/CombineClient.test.tsx`(시험 1건 추가)

## 배경 / 문제 정의

미션 목록 카드의 제목은 16px·700이다(`MissionsListClient.tsx` 약 456줄). 레시피 행은 `ListRowCard`의 `children`으로 제목 옆에 슬롯 개수를 붙이려고 제목 `<span>`을 직접 그려서 보통 굵기였다. 목록 행(탐색 목록)과 믹서 상단 요약바는 같은 `RecipeRewardRow`를 쓰므로 둘 다 같이 바뀐다.

## 완료 조건

- /combine의 레시피 행(탐색 목록과 믹서 상단 요약바) 제목이 16px·700이고, 슬롯 개수 원은 굵지 않다. (로컬 실측: 제목 700·16px·`rgb(23,23,23)`)
- 제목 모양은 `ListRowCardTitle` 한 곳에서만 정의한다. 관련 시험·lint·typecheck 통과.

---
## 완료 기록

### 구현 내용 요약
- `ListRowCardTitle`을 `ListRowCard.tsx`에 export하고 `RecipeRewardRow`가 사용한다. `children`으로 텍스트 영역을 직접 그리는 행은 이 컴포넌트로 제목을 그리면 굵기가 같아진다.
- `ListRowCard`의 `title` prop 경로(보통 굵기)는 바꾸지 않았다. 그 경로를 쓰는 다른 화면(알림·포인트·팔로우 목록 등)까지 굵게 할지는 별도 결정이다.
- 경미 수정(코드 약 15줄)이라 카리나가 직접 처리했고 게이트 리뷰는 거치지 않았다.

### 변경된 파일
```
jam-web/src/components/ui/ListRowCard.tsx
jam-web/src/app/(main)/combine/RecipeRewardRow.tsx
jam-web/src/app/(main)/combine/CombineClient.test.tsx
```

### 테스트 결과
- [x] `combine`·`components/ui` 시험 22파일 412건, eslint, `npm run typecheck` 통과.
- [x] 로컬 /combine 실렌더: 레시피 제목 font-weight 700, 16px.

### 잔여 이슈
- 믹스 첫 줄 «등급 올리기» 행(`CombineClient.tsx` 약 1034줄)의 제목은 레시피가 아니라서 보통 굵기로 두었다. 같은 화면에서 굵기가 다르게 보이면 `ListRowCardTitle`로 맞출 수 있다.
