---
id: 20260723_004
category: Admin
status: CLOSED
created: 2026-07-23
closed: 2026-07-23
---

# [Admin] 배포가 안 되던 근본 원인(Vercel Hobby 플랜 cron 빈도 제한) 해결 — `ambient-dro

## 배경 / 문제 정의
SERVICE_OPERATIONS_20260723_1435 문서 기반 작업.

## 상세 요구사항

### 서비스/코드베이스 관점
배포가 안 되던 근본 원인(Vercel Hobby 플랜 cron 빈도 제한) 해결 — `ambient-drop-monitor`를 매시간에서 매일 05:00으로 하향. 부수적으로 `wandering` 크론의 stale한 "매시간" 주석/문서 표기를 실제 스케줄(매일 03:00)에 맞게 정정.

## 구현 계획
이전 버전: SERVICE_OPERATIONS_20260723_1435를 기준으로 개선.

---
## 완료 기록

### 구현 내용 요약
배포가 안 되던 근본 원인(Vercel Hobby 플랜 cron 빈도 제한) 해결 — `ambient-drop-monitor`를 매시간에서 매일 05:00으로 하향. 부수적으로 `wandering` 크론의 stale한 "매시간" 주석/문서 표기를 실제 스케줄(매일 03:00)에 맞게 정정.

### 변경된 파일
```
SERVICE_OPERATIONS 문서 참조
```

### 테스트 결과
- 문서에 명시된 사항 참고

### 배포 정보
- 배포일: 2026-07-23
- 환경: production
- 원본 문서: SERVICE_OPERATIONS_20260723_1435.md

### 주요 의사결정 / 핵심 메모
> 상세 내용은 Service Plan/Archive/Operations/SERVICE_OPERATIONS_20260723_1435.md 참조

### 잔여 이슈
> 문서에 명시된 내용 참고

