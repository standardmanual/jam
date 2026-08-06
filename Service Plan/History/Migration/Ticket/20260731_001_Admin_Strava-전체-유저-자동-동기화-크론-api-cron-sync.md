---
id: 20260731_001
category: Admin
status: CLOSED
created: 2026-07-31
closed: 2026-07-31
---

# [Admin] Strava 전체 유저 자동 동기화 크론(`/api/cron/sync`, 매일 21:00 KST) 폐지 —

## 배경 / 문제 정의
SERVICE_OPERATIONS_20260731_0220 문서 기반 작업 (Specs/ 폴더에서 이전).

## 상세 요구사항

### 서비스/코드베이스 관점
Strava 전체 유저 자동 동기화 크론(`/api/cron/sync`, 매일 21:00 KST) 폐지 — 이제 Strava 동기화는 유저가 `/api/strava/sync`(수동 버튼)로 직접 실행해야만 발생. 남은 크론 4종은 Vercel Hobby 플랜 제약(하루 1회 초과 시 배포 자체 거부) 하에서 부하가 몰리지 않도록 6시간 간격으로 재분산.

## 구현 계획
이전 버전을 기준으로 개선.

---
## 완료 기록

### 구현 내용 요약
Strava 전체 유저 자동 동기화 크론(`/api/cron/sync`, 매일 21:00 KST) 폐지 — 이제 Strava 동기화는 유저가 `/api/strava/sync`(수동 버튼)로 직접 실행해야만 발생. 남은 크론 4종은 Vercel Hobby 플랜 제약(하루 1회 초과 시 배포 자체 거부) 하에서 부하가 몰리지 않도록 6시간 간격으로 재분산.

### 변경된 파일
```
SERVICE_OPERATIONS 문서 참조
```

### 테스트 결과
- 문서에 명시된 사항 참고

### 배포 정보
- 배포일: 2026-07-31
- 환경: production
- 원본 문서: SERVICE_OPERATIONS_20260731_0220.md (Specs → History/Operations 아카이브 이동)

### 주요 의사결정 / 핵심 메모
> 상세 내용은 Service Plan/History/Operations/SERVICE_OPERATIONS_20260731_0220.md 참조

### 잔여 이슈
> 문서에 명시된 내용 참고

