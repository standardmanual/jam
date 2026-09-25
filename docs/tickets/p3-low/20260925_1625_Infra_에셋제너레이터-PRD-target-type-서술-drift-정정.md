---
id: "20260925_1625"
category: Infra
priority: P3
status: CLOSED
created: 2026-09-25
closed: 2026-09-26
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
- `docs/specs/prd/asset-generator/PRD.md` §12(약 273~275줄)의 `asset_presets` 서술을 정정했다. `target_type` CHECK를
  `badge`·`mission`·`collection`·`home_feed` 4종으로 적고, 확장 마이그레이션 `187_asset_presets_target_type_expand.sql`과
  2026-09-25 jam-prod 적용 사실(출처: 티켓 20260925_1405 완료 기록)을 덧붙였다.

### 변경된 파일
```
docs/specs/prd/asset-generator/PRD.md
```

### 테스트 결과
- [x] `grep`으로 PRD 안에 "badge 하나만" 류의 낡은 서술이 더 남아 있지 않음을 확인
- [x] `ls jam-web/supabase/migrations | grep ^187`: `187_asset_presets_target_type_expand.sql` 존재, CHECK가 4종(파일 24~25줄)
- [ ] 187의 프로덕션 적용 사실은 이 세션에서 DB로 직접 확인하지 않았다(티켓 20260925_1405 완료 기록 인용)

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
- 문서는 현재 상태 덮어쓰기 규칙이라 변경 이력 서술 없이 현재 CHECK와 출처만 적었다. 적용 사실은 DB 확인이 아니라 1405 기록 인용이다.

### 잔여 이슈
- 없음

---
## 종료 기록 (2026-09-26, 카리나)

- 묶음 실행(티켓 2237·0347·0352·1625)의 일부다. 병합 커밋 9640551c, 게이트 결과와 묶음의 경위는 티켓 20260924_2237 종료 기록에 있다.
- 이 티켓의 판정: PRD §12(273~275줄)의 `asset_presets.target_type` 서술이 4종 CHECK(`badge`·`mission`·`collection`·`home_feed`)와 마이그레이션 187 적용 상태로 정정됐다. 4종은 번들의 `PRESET_TARGET_TYPES`와 일치한다(민지 대조). 187 적용은 티켓 20260925_1405 완료 기록을 인용했고 DB로 직접 확인하지 않았다.
- 티켓 본문이 가리키던 `PRD.md:233`은 실제 §12 위치(약 273줄)와 달랐다(민지 참고).

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차(2237·0347·0352·1625 묶음) | 아현·민지 | 131,884 | 77,170 / 7,842 | 9분 33초 | 82 |
| 재판정(카리나 번들 재생성·스크립트 패치 뒤) | 민지 | 42,497 | 0 / 12,806 | 4분 1초 | 9 |
| 합계 | 아현·민지 | 174,381 | 77,170 / 20,648 | 13분 34초 | 91 |

(네 티켓을 한 번의 실행으로 처리해 지표는 묶음 전체 값이다. 네 티켓 모두 같은 값을 적었다.)
