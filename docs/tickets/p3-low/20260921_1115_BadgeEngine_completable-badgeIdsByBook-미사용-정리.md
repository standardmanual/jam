---
id: 20260921_1115
category: BadgeEngine
priority: P3
status: OPEN
created: 2026-09-21
parent: "20260921_1110"
---

# [BadgeEngine] `completable.ts`의 `badgeIdsByBook`이 분모 계산에 더 쓰이지 않는지 확인하고 정리

## 핵심 요약

- 요구사항: 티켓 20260921_1110에서 `completable.ts`의 분모를 공용 함수 `computeBookCompletion`의 `denomIds`로 바꾼 뒤, 기존 `badgeIdsByBook`이 다른 곳에서 쓰이는지 확인하고 쓰이지 않으면 지운다.
- 관련 파일: `jam-web/src/lib/itembook/completable.ts`
- 출처: 티켓 20260921_1110 게이트 리뷰(민지)의 범위 밖 발견물. lint는 통과했다고 보고됐다.

## 배경 / 문제 정의

`badgeIdsByBook`이 분모 계산에서 더 이상 쓰이지 않는 것으로 보이나, 게이트 리뷰는 확인 필요로만 남겼다. 동작에는 영향이 없는 죽은 코드 후보다.

## 완료 조건

- `badgeIdsByBook`의 잔여 사용처를 확인해, 없으면 삭제하고 `scripts/verify.sh`가 통과한다. 다른 곳에서 쓰이면 그 사유를 완료 기록에 남기고 닫는다.

---
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
