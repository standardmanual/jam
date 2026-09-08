---
id: 20260908_1002
category: UI
priority: P3
status: OPEN
created: 2026-09-08
closed:
---

# [UI] `BadgeFamilyRow.tsx`의 `gates` 계산이 이제 `BadgeStageRail`에서 무시된다

## 배경 / 문제 정의

티켓 `20260906_2333`에서 `BadgeStageRail.jsx`의 게이트(자물쇠) 버튼을 완전히
제거했다(2026-09-08 사용자 확정 — 게이트 존재는 눈금 이미지 자체의 마커로만
표시하고, 게이트별 세부(미션/교차 종류·통과 여부)는 화면에 노출하지 않기로 함).

그런데 호출부 `src/components/badges/BadgeFamilyRow.tsx:160`은 여전히 이 값을
계산해서 넘긴다:

```ts
gates: stage.gateGroups.map((g) => ({ kind: g.kind, met: g.fulfilled })),
```

`BadgeStageRail`이 이제 `stop.gates`를 완전히 무시하므로, 이 계산(`stage.gateGroups`
자체와 그걸 만드는 상위 로직까지)이 죽은 코드일 가능성이 높다 — 다만 `gateGroups`가
다른 곳(예: 펼친 목록·다른 컴포넌트)에서도 쓰이는지는 확인이 안 된 상태다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `stage.gateGroups`가 `BadgeFamilyRow.tsx` 안에서 이 `gates` 매핑 말고 다른 용도로도
  쓰이는지 확인한다
- 다른 용도가 없다면: `gates:` 매핑과 `gateGroups`를 만드는 상위 계산(어디서
  `gateGroups`가 만들어지는지 추적)까지 정리해 죽은 코드를 걷어낸다
- 다른 용도가 있다면(예: 다른 화면이 같은 데이터를 쓴다면): 이 티켓은 "해당 없음"으로
  닫고 근거만 기록한다

## 구현 계획
1. `gateGroups` 정의·전체 사용처 추적 (`grep -rn "gateGroups"`)
2. 죽은 코드로 확인되면 `BadgeFamilyRow.tsx`의 `gates:` 필드와 관련 계산 제거
3. `BadgeStageRail`의 `stop.gates` prop 타입 선언(`.d.ts`) 자체를 없앨지도 이 시점에
   함께 판단 — 호출부가 아무도 안 넘기게 되면 타입도 정리하는 게 일관적이다

## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보
- 배포일:
- 환경:
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
