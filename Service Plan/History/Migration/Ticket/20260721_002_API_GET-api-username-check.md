---
id: 20260721_002
category: API
status: CLOSED
created: 2026-07-21
closed: 2026-07-23
---

# [API] GET /api/username/check

## 배경
온보딩/프로필 편집에서 username 중복 여부를 실시간 확인.

## 상세 요구사항
- 쿼리 파라미터: `username`
- 응답:
  ```json
  {
    "available": true,
    "message": "사용 가능한 닉네임입니다"
  }
  ```
- 검증: 정규식 확인, 예약어 체크

---

## 완료 기록

### 구현 내용 요약
- GET /api/username/check 라우트
- 중복 검사 로직
- 검증 규칙 적용

### 변경된 파일
```
src/app/api/username/check/route.ts (신규)
```

### 테스트 결과
- [x] 중복 username → available: false
- [x] 사용 가능 → available: true
- [x] 형식 오류 → 400 응답

### 배포 정보
- 배포일: 2026-07-23
- 커밋: api/username-check
