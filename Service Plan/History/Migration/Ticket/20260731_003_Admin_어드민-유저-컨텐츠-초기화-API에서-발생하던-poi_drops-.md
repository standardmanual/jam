---
id: 20260731_003
category: Admin
status: CLOSED
created: 2026-07-31
closed: 2026-07-31
---

# [Admin] 어드민 "유저 컨텐츠 초기화" API에서 발생하던 `poi_drops` FK 위반 버그 수정, 초기화 범위에

## 배경 / 문제 정의
SERVICE_OPERATIONS_20260731_0300 문서 기반 작업 (Specs/ 폴더에서 이전).

## 상세 요구사항

### 서비스/코드베이스 관점
어드민 "유저 컨텐츠 초기화" API에서 발생하던 `poi_drops` FK 위반 버그 수정, 초기화 범위에서 팔로잉/팔로워 관계 제외.

## 구현 계획
이전 버전을 기준으로 개선.

---
## 완료 기록

### 구현 내용 요약
어드민 "유저 컨텐츠 초기화" API에서 발생하던 `poi_drops` FK 위반 버그 수정, 초기화 범위에서 팔로잉/팔로워 관계 제외.

### 변경된 파일
```
SERVICE_OPERATIONS 문서 참조
```

### 테스트 결과
- 문서에 명시된 사항 참고

### 배포 정보
- 배포일: 2026-07-31
- 환경: production
- 원본 문서: SERVICE_OPERATIONS_20260731_0300.md (Specs → History/Operations 아카이브 이동)

### 주요 의사결정 / 핵심 메모
> 상세 내용은 Service Plan/History/Operations/SERVICE_OPERATIONS_20260731_0300.md 참조

### 잔여 이슈
> 문서에 명시된 내용 참고

