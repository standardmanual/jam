---
id: "20261108_1647"
category: UI
priority: P3
status: CLOSED
created: 2026-11-08
closed: 2026-11-08
parent: "20261106_1750"
specs: []
---

# [UI] 픽업 행의 disabled={!isActive}는 도달하지 않는 분기라 지운다

## 핵심 요약

- 요구사항: `PoiCarouselModal.tsx`의 픽업 목록 `ItemRow`에 넘기는 `disabled={!isActive}`(1025줄 근처)를 걷는다. 본문이 `!isActive ? null : …`(916줄)이라 비활성 카드에서는 행이 그려지지 않고, 이 분기는 한 번도 참이 되지 않는다.
- 구현 계획: `disabled={!isActive}` 한 줄을 지우고, `ItemRowProps`의 `disabled`를 다른 곳이 쓰는지 확인해 안 쓰면 props에서도 걷는다. `PoiCarouselModal.test.tsx`의 `disabled` 단정은 의미가 바뀌는지 본다.
- 관련 파일: `jam-web/src/components/PoiCarouselModal.tsx`(916줄, 1025줄, `ItemRowProps`), `jam-web/src/components/PoiCarouselModal.test.tsx`.
- 담당 에이전트: 카리나(경미 수정 판정), 필요하면 아현.

## 배경 / 문제 정의

목록 행 5-3(`20261108_1625`)에서 `ItemRow`를 `ListRow`로 옮기면서 채원 사전 판정과 아현·민지가 함께 확인했다. `ListRow disabled`는 행을 흐리게 하지만 이 경로는 화면에 나올 수 없어 5-3 범위에서는 지우지 않고 남겼다. 죽은 분기가 남아 있으면 읽는 사람이 «픽업이 막힌 상태가 화면에 있다»고 오해한다.

## 완료 조건

- `disabled={!isActive}`가 없고 픽업 목록이 그대로 동작한다.
- `ItemRowProps.disabled`를 쓰는 곳이 없으면 props에서도 걷는다.
- 변경 파일이 `scripts/verify.sh`를 통과한다.

---
## 완료 기록

### 구현 내용 요약

- `PoiCarouselModal.tsx`의 픽업 목록 `ItemRow`에 넘기던 `disabled={!isActive}`(1025줄)를 걷었다. 본문이 `!isActive ? null : …`(916줄)이라 비활성 카드에서는 행이 그려지지 않아 이 값은 한 번도 참이 되지 않았다. 그 뒤 `ItemRow`에 `disabled`를 넘기는 호출부가 없어 `ItemRowProps.disabled`, 함수 인자, `ListRow`로 넘기던 `disabled={disabled}`도 함께 걷었다.
- 시험 `dropButtonDisabled`는 드랍 확인 버튼을 보는 것이라 이 변경과 무관하다.

### 변경된 파일
```
jam-web/src/components/PoiCarouselModal.tsx (5줄)
```

### 테스트 결과
- `PoiCarouselModal.test.tsx` 21건 통과, eslint 통과, `tsc --noEmit` 오류 없음.

### 주요 의사결정 / 핵심 메모
- 시작 전 `grep`으로 `disabled`를 넘기는 곳이 이 한 줄뿐임을 확인했다. 경미 수정(코드 5줄, 파일 1개)이라 직접 처리했다.

### 잔여 이슈
- 없음.

### 실행 지표

에이전트 0(경미 수정 판정, 카리나 직접 처리). 별도 토큰 집계 없음.
