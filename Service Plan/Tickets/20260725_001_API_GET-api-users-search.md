---
id: 20260725_001
category: API
status: CLOSED
created: 2026-07-25
closed: 2026-07-26
---

# [API] GET /api/users/search

## 배경
유저 검색 API.

## 상세 요구사항
- 쿼리 파라미터: `q` (username 또는 이메일)
- 응답: 유저 배열 (최대 30개, 정확 일치 우선)

---

## 완료 기록

### 구현 내용 요약
- GET /api/users/search 라우트
- 검색 로직 (ilike)
- 결과 정렬

### 변경된 파일
```
src/app/api/users/search/route.ts (신규)
```

### 테스트 결과
- [x] 검색 동작

### 배포 정보
- 배포일: 2026-07-26
- 커밋: api/users-search
