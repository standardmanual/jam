---
id: 20260825_034
category: BadgeEngine
status: OPEN
created: 2026-08-25
closed:
---

# [BadgeEngine] CONDITION_JSON_SPEC.md 필드 표 누락 필드 백필

## 배경 / 문제 정의

티켓 [20260825_031](20260825_031_BadgeEngine_condition-json-데이터계약-검증-도입.md) 게이트·
개선 리뷰 중 발견. `Service Plan/Specs/BadgeEngine/CONDITION_JSON_SPEC.md`는 `condition_json`의
"단일 출처(source of truth)"를 표방하지만, 실제 코드(`src/types/database.ts`의
`BadgeCondition`, `src/lib/badge-engine/condition-schema.ts`의 `ALL_CONDITION_KEYS`)에는
있는데 문서 필드 표에는 없는 필드가 있다:

- `day_of_week`
- `active_days_count`
- `season_count_all`
- `route`

이 중 `day_of_week`·`active_days_count`는 실제 걷기 배지 등에서 사용 중인 것으로 코드에서
확인됐다. 문서가 코드보다 오래된 상태다.

## 상세 요구사항

### 문서 관점 (④ 배지 드랍 로직)

- `CONDITION_JSON_SPEC.md` §2(조건 필드) 표에 위 4개 필드를 추가:
  - 각 필드의 타입·단위·평가 방식을 `src/lib/badge-engine/index.ts`·`src/types/database.ts`
    코드 주석 기준으로 정확히 기술
  - `season_count_all`은 사계절 각각 독립 카운터라는 평가 방식이 특이하므로 예시(§4)에도
    한 줄 추가 검토
- 정정 시 [20260825_033](20260825_033_BadgeEngine_온도조건-문서-부등호방향-오류.md)(온도 조건
  부등호 방향 오류)도 같은 문서이므로 함께 처리하는 것을 고려할 것(선택 — 별개 티켓이라
  분리 진행해도 무방)

## 구현 계획
> 문서 정정 단독 작업 — `/jam-docs` 규칙에 따라 진행. 코드 대조 후 표 백필.

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
해당 없음 (내부 스펙 문서, 사용자 노출 텍스트 아님)

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
> 티켓 20260825_031 리뷰 중 발견한 범위 밖 문서 누락. 별도 티켓으로 분리(2026-08-25, 사용자
> 결정) — 즉시 착수하지 않음.

### 잔여 이슈
-
