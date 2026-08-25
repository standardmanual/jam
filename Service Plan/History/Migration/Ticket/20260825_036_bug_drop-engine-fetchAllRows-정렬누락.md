---
id: 20260825_036
category: Service
status: OPEN
created: 2026-08-25
closed:
---

# [bug] drop-engine의 fetchAllRows 헬퍼에 정렬 기준 누락 — 페이지 경계 중복/누락 위험

## 배경 / 문제 정의

티켓 [20260825_034](20260825_034_bug_PostgREST-1000행상한-배지조회-절단-일괄점검.md)의
게이트 리뷰·개선 리뷰에서 발견된 범위 밖 이슈. `jam-web/src/lib/drop-engine/index.ts:160`의
로컬 `fetchAllRows` 헬퍼는 range 페이지네이션 루프는 구현돼 있으나 `.order()`가 없다.

Postgres는 `ORDER BY` 없는 쿼리의 물리적 행 순서를 보장하지 않으므로, 페이지 경계에서
행이 중복되거나 누락될 이론적 가능성이 있다. `jam-web/src/lib/notifications/batch/shared.ts`의
동명 헬퍼(`fetchAllRows`)는 정확히 이 이유로 `orderBy`를 필수 인자로 강제하고 있어 대조적이다.

드랍엔진(실제 배지·아이템 지급 판정 핵심 로직)이라 031의 범위에서는 손대지 않고 별도
검토가 필요하다고 판단해 이 티켓으로 분리했다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `jam-web/src/lib/drop-engine/index.ts`의 `fetchAllRows` 호출부(160행 부근)에서
  어떤 쿼리에 페이지네이션이 적용되는지, 그 쿼리 결과가 지급 판정에 실제로 어떻게
  쓰이는지 먼저 확인한다
- `.order('id')` 등 안정적인 tie-break 정렬을 추가한다 (`lib/notifications/batch/shared.ts`의
  `orderBy` 필수 인자 패턴 참고)
- 가능하면 `lib/notifications/batch/shared.ts`의 `fetchAllRows`와 이번 헬퍼를 공용화하는
  것도 검토한다 (031 개선 리뷰 제안 — 페이지네이션 로직이 여러 곳에 유사하게 중복돼 있어
  한 곳만 고치고 다른 곳을 놓치는 편차가 반복되고 있음)

## 구현 계획

1. `drop-engine/index.ts`의 `fetchAllRows` 호출부와 정렬 없는 쿼리가 실제 중복/누락을
   일으킬 수 있는지(같은 정렬 키를 가진 행이 많은지 등) 확인
2. 정렬 기준 추가
3. 공용 헬퍼화 여부는 영향 범위(다른 호출부와의 결합도)를 보고 판단

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- [ ] 해당 없음 (예상)

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
