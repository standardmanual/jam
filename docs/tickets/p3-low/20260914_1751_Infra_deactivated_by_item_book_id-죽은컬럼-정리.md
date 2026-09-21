---
id: 20260914_1751
category: Infra
priority: P3
status: OPEN
created: 2026-09-14
closed:
---

# [Infra] `deactivated_by_item_book_id` 죽은 컬럼 정리

## 배경 / 문제 정의
티켓 [20260914_1729](../P2-일반/20260914_1729_Admin_컬렉션-활성화기간-설정-배지연동해제.md)
(컬렉션 활성화기간 설정 및 배지 연동 해제)에서 컬렉션-배지 캐스케이드 비활성화 로직
(`cascadeDeactivateItemBookBadges`/`cascadeActivateItemBookBadges`)을 완전히 제거하면서,
`badges.deactivated_by_item_book_id`(마이그레이션 146) 컬럼을 채우던 유일한 코드 경로가
사라졌다. 현재 이 컬럼은 어떤 코드에서도 쓰이지 않는 죽은 컬럼 상태다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `badges.deactivated_by_item_book_id` 컬럼의 잔존 참조(타입 정의, 쿼리, 문서)가 남아있는지
  전수 확인한다.
- 컬럼을 완전히 삭제할지, 향후 다른 용도로 재사용할 계획이 있는지 판단한다. 삭제하기로
  결정하면 마이그레이션 파일을 작성한다(단, 프로덕션에 이미 값이 채워진 로우가 있을 수
  있으므로 삭제 전 데이터 영향 확인 필요).

## 구현 계획
> 판단 단계 우선 — 삭제가 맞다고 결론나면 그 다음에 마이그레이션 작성.

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
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

### 잔여 이슈
-

---
## 진행 기록 (2026-09-21) — 마이그레이션 작성 완료, DB 적용 대기

- **삭제 결정**: 사용자 승인(2026-09-21). 조건은 「값이 채워진 행이 없을 때」였다.
- **삭제 전 확인**(jam-prod 읽기 전용 조회): 값이 채워진 행 0건(badges 3,386행 중), 이 컬럼을 참조하는 함수·뷰·RLS 정책·트리거 0건, 인덱스는 `idx_badges_deactivated_by_item_book_id` 하나(컬럼과 함께 삭제).
- **마이그레이션 파일 작성**: `jam-web/supabase/migrations/177_drop_badges_deactivated_by_item_book_id.sql`
- **DB 적용이 막혔다**: `apply_migration` 호출이 프로덕션 DB를 바꾼다는 이유로 권한 분류기에서 거부됐다. 우회하지 않고 멈췄다. **DB에는 아직 적용되지 않았다.**

### 남은 작업 (적용 후 같은 순서로)
1. 177을 프로덕션에 적용하고 `information_schema.columns`로 컬럼이 사라졌는지 확인한다.
2. 생성 타입에서 제거한다: `src/types/database.generated.ts`(257·292·327행 컬럼, 360행 외래키 관계)는 MCP `generate_typescript_types`로 재생성해 대조한다. 수기 `src/types/database.ts` 183행도 지운다.
3. 테스트 목 5개(`shadow-ban-gate`·`usage-badges`·`first-sync-options-contract`·`walking-badges-v4`·`badge-engine-v5`)의 `deactivated_by_item_book_id: null` 줄을 지운다.
4. 주석·문서를 정리한다: `src/app/api/admin/badges/[id]/route.ts` 238행 주석, `docs/specs/prd/02_DATA_MODEL.md` 126행 컬럼 행, `docs/specs/badge-engine/BADGE_ENGINE_UNIFIED.md` 569·573행의 캐스케이드 서술.
5. `scripts/verify.sh` 통과를 확인하고 이 티켓을 CLOSED 처리한다.

코드는 이 컬럼을 읽거나 쓰지 않아서(주석과 테스트 목에만 남아 있음) 적용 순서에 제약은 없다.
