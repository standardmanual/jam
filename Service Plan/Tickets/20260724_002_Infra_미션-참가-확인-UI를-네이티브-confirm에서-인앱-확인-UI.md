---
id: 20260724_002
category: Infra
status: CLOSED
created: 2026-07-24
closed: 2026-07-24
---

# [Infra] 미션 참가 확인 UI를 네이티브 `confirm()`에서 인앱 확인 UI로 교체 — 모바일/PWA에서 짧은

## 배경 / 문제 정의
SERVICE_OPERATIONS_20260724_1954 문서 기반 작업.

## 상세 요구사항

### 서비스/코드베이스 관점
미션 참가 확인 UI를 네이티브 `confirm()`에서 인앱 확인 UI로 교체 — 모바일/PWA에서 짧은 시간 내 `confirm()`을 반복 호출하면 브라우저가 후속 다이얼로그를 조용히 차단해, 미션 하나를 참가한 직후 다른 미션 참가 버튼이 무반응이던 문제 수정.

## 구현 계획
이전 버전: SERVICE_OPERATIONS_20260724_1954를 기준으로 개선.

---
## 완료 기록

### 구현 내용 요약
미션 참가 확인 UI를 네이티브 `confirm()`에서 인앱 확인 UI로 교체 — 모바일/PWA에서 짧은 시간 내 `confirm()`을 반복 호출하면 브라우저가 후속 다이얼로그를 조용히 차단해, 미션 하나를 참가한 직후 다른 미션 참가 버튼이 무반응이던 문제 수정.

### 변경된 파일
```
SERVICE_OPERATIONS 문서 참조
```

### 테스트 결과
- 문서에 명시된 사항 참고

### 배포 정보
- 배포일: 2026-07-24
- 환경: production
- 원본 문서: SERVICE_OPERATIONS_20260724_1954.md

### 주요 의사결정 / 핵심 메모
> 상세 내용은 Service Plan/Archive/Operations/SERVICE_OPERATIONS_20260724_1954.md 참조

### 잔여 이슈
> 문서에 명시된 내용 참고

