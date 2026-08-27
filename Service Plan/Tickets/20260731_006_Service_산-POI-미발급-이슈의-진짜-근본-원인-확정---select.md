---
id: 20260731_006
category: Service
status: CLOSED
created: 2026-07-31
closed: 2026-07-31
---

# [Service] 산 POI 미발급 이슈의 진짜 근본 원인 확정 — `select('*')` 전체조회가 PostgREST 기본

## 배경 / 문제 정의
SERVICE_OPERATIONS_20260731_1130 문서 기반 작업 (Specs/ 폴더에서 이전).

## 상세 요구사항

### 서비스/코드베이스 관점
산 POI 미발급 이슈의 진짜 근본 원인 확정 — `select('*')` 전체조회가 PostgREST 기본 max-rows(1,000행) 제한에 걸려 POI 응답이 잘리던 문제 수정.

## 구현 계획
이전 버전을 기준으로 개선.

---
## 완료 기록

### 구현 내용 요약
산 POI 미발급 이슈의 진짜 근본 원인 확정 — `select('*')` 전체조회가 PostgREST 기본 max-rows(1,000행) 제한에 걸려 POI 응답이 잘리던 문제 수정.

### 변경된 파일
```
SERVICE_OPERATIONS 문서 참조
```

### 테스트 결과
- 문서에 명시된 사항 참고

### 배포 정보
- 배포일: 2026-07-31
- 환경: production
- 원본 문서: SERVICE_OPERATIONS_20260731_1130.md (Specs → Archive/Operations 아카이브 이동)

### 주요 의사결정 / 핵심 메모
> 상세 내용은 Service Plan/Archive/Operations/SERVICE_OPERATIONS_20260731_1130.md 참조

### 잔여 이슈
> 문서에 명시된 내용 참고

