---
id: 20260725_006
category: Infra
status: CLOSED
created: 2026-07-25
closed: 2026-07-25
---

# [Infra] POI 픽업 시 `cannot_pickup_own_drop` 오류 재발 수정 — `pickup_drop()`

## 배경 / 문제 정의
SERVICE_OPERATIONS_20260725_1948 문서 기반 작업.

## 상세 요구사항

### 서비스/코드베이스 관점
POI 픽업 시 `cannot_pickup_own_drop` 오류 재발 수정 — `pickup_drop()` RPC에서 본인 드랍 픽업 제한 재제거.

## 구현 계획
이전 버전: SERVICE_OPERATIONS_20260725_1948를 기준으로 개선.

---
## 완료 기록

### 구현 내용 요약
POI 픽업 시 `cannot_pickup_own_drop` 오류 재발 수정 — `pickup_drop()` RPC에서 본인 드랍 픽업 제한 재제거.

### 변경된 파일
```
**수정**: `047_reallow_pickup_own_drop.sql`에서 `pickup_drop()`을 다시 `CREATE OR REPLACE` — 044의 `drop_id` 기록 로직(일련번호 트리거용)은 그대로 유지하고, `cannot_pickup_own_drop` 체크만 제거.
```

### 테스트 결과
- 문서에 명시된 사항 참고

### 배포 정보
- 배포일: 2026-07-25
- 환경: production
- 원본 문서: SERVICE_OPERATIONS_20260725_1948.md

### 주요 의사결정 / 핵심 메모
> 상세 내용은 Service Plan/Archive/Operations/SERVICE_OPERATIONS_20260725_1948.md 참조

### 잔여 이슈
> 문서에 명시된 내용 참고

