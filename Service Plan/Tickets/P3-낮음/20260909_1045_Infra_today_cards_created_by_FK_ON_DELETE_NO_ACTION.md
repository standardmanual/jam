---
id: 20260909_1045
category: Infra
priority: P3
status: OPEN
created: 2026-09-09
closed:
---

# [Infra] today_cards.created_by FK가 ON DELETE NO ACTION — 유저 완전삭제 시 잠재적 500 위험

## 배경 / 문제 정의
티켓 20260909_0911(유저 관리 강제 완전 삭제 기능) 게이트 리뷰 중 발견. `public.users(id)`를
참조하는 FK 전수 조사 결과, 대부분 `ON DELETE CASCADE`(또는 `SET NULL`)인데
`today_cards.created_by`만 `ON DELETE` 절이 없어(기본값 `NO ACTION`) 예외다.

현재는 라이브 DB의 모든 `today_cards` 행에서 `created_by`가 NULL이고, 앱 코드 어디에서도 이
컬럼에 값을 쓰지 않는다(사실상 데드 컬럼) — 그래서 지금 당장은 유저 완전 삭제 기능에 영향이
없다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `created_by`를 실제로 채워 쓰는 기능이 생기기 **전에** 먼저 다음 중 하나로 정리:
  1. 컬럼이 정말 데드 코드라면 컬럼 자체를 제거하는 마이그레이션 작성
  2. 계속 쓸 계획이라면 `ON DELETE SET NULL`(또는 용도에 맞는 CASCADE)로 FK 재정의
- 방치할 경우: 향후 이 컬럼에 값이 채워진 유저를 신규 "완전 삭제" 기능으로 삭제하면
  FK 위반으로 500 에러가 발생할 수 있다.

## 구현 계획
- `today_cards.created_by`의 실제 사용처(생성 로직·읽는 화면)가 있는지 코드베이스 재확인 후
  정리 방향 결정. 없으면 컬럼 제거가 더 단순한 해법.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
