---
id: 20260909_2157
category: Service
priority: P3
status: CLOSED
created: 2026-09-09
closed: 2026-09-09
---

# [Service] 유저 jamfather 아이디를 god으로 변경

## 배경 / 문제 정의
사용자(본인 계정, sihyunrr@gmail.com)가 `public.users.username`이 `jamfather`인 계정의
아이디를 `god`으로 바꿔달라고 요청했다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `public.users` 테이블에서 `id = 3649ed39-2be2-402e-82ae-41e0cd328105`,
  `username = 'jamfather'`인 행의 `username`을 `'god'`으로 변경한다.
- 스키마·로직 변경은 없다. 1회성 데이터 값 변경이므로 `seed_*.sql`로 기록한다.

## 구현 계획
- `god`이라는 아이디가 이미 사용 중인지 사전 확인 (미사용 확인됨)
- `UPDATE public.users SET username = 'god' WHERE id = '3649ed39-2be2-402e-82ae-41e0cd328105'`
  를 jam-prod(단일 공용 DB)에 직접 실행
- `Service Plan/supabase/seed_20260909_2157_jamfather_to_god.sql`로 기록·커밋

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`jamfather` 유저의 `username`을 `god`으로 변경했다.

### 변경된 파일
```
- jam-web/supabase/seed_20260909_2157_jamfather_to_god.sql
```

### 테스트 결과
- [x] 변경 후 `username = 'god'` 조회로 반영 확인

### 배포 정보
- 배포일: 2026-09-09
- 환경: production (staging·프로덕션 공용 단일 DB)
- 커밋:

### 주요 의사결정 / 핵심 메모
- 스키마·로직 변경이 없는 1회성 데이터 변경이라 풀 파이프라인 없이 직접 처리했다.

### 잔여 이슈
-
