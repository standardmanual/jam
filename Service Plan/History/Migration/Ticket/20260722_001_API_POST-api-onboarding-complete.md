---
id: 20260722_001
category: API
status: CLOSED
created: 2026-07-22
closed: 2026-07-24
---

# [API] POST /api/onboarding/complete

## 배경
온보딩에서 username을 확정하는 API.

## 상세 요구사항
- 요청 본문: `{ username: string }`
- 응답: `{ success: true, user: {...} }`
- 요청자 권한 확인 (본인만 가능)

---

## 완료 기록

### 구현 내용 요약
- POST /api/onboarding/complete 라우트
- username 최종 저장
- 온보딩 완료 플래그 설정

### 변경된 파일
```
src/app/api/onboarding/complete/route.ts (신급)
```

### 테스트 결과
- [x] 온보딩 완료 저장 확인

### 배포 정보
- 배포일: 2026-07-24
- 커밋: api/onboarding-complete
