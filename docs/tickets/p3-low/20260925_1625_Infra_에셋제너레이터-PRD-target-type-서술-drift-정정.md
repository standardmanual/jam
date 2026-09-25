---
id: "20260925_1625"
category: Infra
priority: P3
status: OPEN
created: 2026-09-25
closed:
specs:
  - "docs/specs/prd/asset-generator/PRD.md"
related:
  - "20260925_1405"
  - "20260925_1408"
---

# [Infra] 에셋 제너레이터 PRD의 target_type 서술 drift 정정

## 핵심 요약

- 요구사항: `docs/specs/prd/asset-generator/PRD.md` §12(데이터)가 아직 "`asset_presets.target_type`
  (text, CHECK `badge` 하나만)"이라고 서술하고 있다 — 실제로는 티켓 20260925_1405로 CHECK가
  `badge`·`mission`·`collection`·`home_feed` 4종으로 확장되고 마이그레이션 187이 2026-09-25
  프로덕션에 적용됐다. §12 서술을 실제 상태로 정정한다.
- 관련 파일: `docs/specs/prd/asset-generator/PRD.md:233`

## 배경 / 문제 정의

티켓 20260925_1408(컬렉션 프리셋) 게이트 리뷰에서 민지가 발견했다. 1405의 구현 커밋(a30577b)이
코드·마이그레이션은 갱신했지만 PRD.md는 건드리지 않아 생긴 drift다. CLAUDE.md 5항(환경 서술은
확인한 결과만) 위반 상태 — 문서가 실제보다 낡았다.

## 완료 조건
- PRD.md §12의 `asset_presets.target_type` 서술이 4종 CHECK와 마이그레이션 187 적용 사실을
  반영한다.

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
