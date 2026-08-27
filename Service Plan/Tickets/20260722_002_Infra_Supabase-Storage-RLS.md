---
id: 20260722_002
category: Infra
status: CLOSED
created: 2026-07-22
closed: 2026-07-24
---

# [Infra] Supabase Storage RLS 설정

## 배경
아바타 이미지 저장소의 권한 관리.

## 상세 요구사항
- Storage 버킷: `avatars`
- 경로: `{user_id}/{timestamp}.{ext}`
- RLS: 본인만 업로드/삭제, 모두 조회

---

## 완료 기록

### 구현 내용 요약
- avatars 버킷 생성
- RLS 정책 설정

### 변경된 파일
```
supabase/migrations/009_storage_avatars.sql (신규)
```

### 테스트 결과
- [x] 업로드 권한 검증
- [x] 조회 권한 검증

### 배포 정보
- 배포일: 2026-07-24
- 커밋: infra/storage-avatars
