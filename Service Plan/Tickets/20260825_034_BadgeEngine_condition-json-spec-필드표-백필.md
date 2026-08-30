---
id: 20260825_034
category: BadgeEngine
status: CLOSED
created: 2026-08-25
closed: 2026-08-30
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
`CONDITION_JSON_SPEC.md`에 누락돼 있던 4개 필드를 코드(`src/types/database.ts`의
`BadgeCondition`, `src/lib/badge-engine/index.ts`, `condition-schema.ts`) 기준으로 백필했다.

- `day_of_week` (§2.1): 단일값 필터 모드 + 배열+`total_count` "요일별 독립 카운터" 모드 둘 다 기술
- `active_days_count` (§2.4): 누적 고유 활동일수(`COUNT(DISTINCT date)`), `streak_days`와의 차이 명시
- `season_count_all` (§2.5): 사계절 각각 독립 카운터, `season_count`와의 차이 명시
- `route` (§2.1, §6): **조사 결과 badge-engine에 실제 평가 로직이 전혀 없음을 확인** —
  `condition-schema.ts`에는 `FILTER_ONLY_CONDITION_KEYS`로 분류돼 있어 필터처럼 보이지만,
  `src/lib/badge-engine/index.ts` 전체를 grep해도 `route` 참조가 0건이다. 조건에 넣어도
  아무 효과 없이 무시된다는 사실을 §2.1과 §6 미구현 표에 명시했다(실제 코드 변경 없음 — 이
  티켓은 문서화 범위, 필드 구현 여부 결정은 별도 판단 필요)

§4 예시에 `season_count_all`·`day_of_week` 배열 모드 예시 각 1개 추가.

### 변경된 파일
```
Service Plan/Specs/BadgeEngine/CONDITION_JSON_SPEC.md
```

### 테스트 결과
- [x] `src/lib/badge-engine/index.ts`에서 `day_of_week`(47·281~341행)·`season_count_all`
  (344~361행)·`active_days_count`(364~370행) 평가 로직 대조 확인
- [x] `route` 필드는 `condition-schema.ts`(61행, `FILTER_ONLY_CONDITION_KEYS`)에는 있으나
  `src/lib/badge-engine/index.ts` 전체 grep 결과 참조 0건 — 미구현 확인. admin 폼(`BadgeForm.tsx`)·
  시드/마이그레이션에도 사용례 없음(현재 실사용 배지 없어 즉각적 실해는 없음)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
해당 없음 (내부 스펙 문서, 사용자 노출 텍스트 아님)

### 배포 정보
- 배포일: 2026-08-30
- 환경: 문서 전용 변경 (코드 무변경, 배포 불필요)
- 커밋: (staging push 시 기록)

### 주요 의사결정 / 핵심 메모
> 티켓 20260825_031 리뷰 중 발견한 범위 밖 문서 누락. 별도 티켓으로 분리(2026-08-25, 사용자
> 결정) — 이후 미착수 티켓 일괄 처리(2026-08-30) 중 착수.
>
> **범위 밖 발견물**: `route` 필드가 스키마·타입엔 존재하지만 badge-engine 평가 로직이 아예
> 없다는 것을 이번 조사에서 확인했다. `mission_reward`(티켓 20260825_028)·미지원 필드
> 유실 위험(티켓 20260825_032)과 같은 계열의 "선언은 됐는데 실제로 작동하지 않는 필드"
> 패턴이다. 다만 현재 실사용 배지가 없어 당장 발급 오류로 이어지진 않는다 — 문서화로 위험을
> 명시했고, "구현할지 필드 자체를 제거할지"는 제품 결정이 필요해 이 티켓 범위 밖으로 남긴다.

### 잔여 이슈
- `route` 필드 구현 여부(실제 루트 매칭 로직 추가 vs 필드 제거) 결정 필요 — 제품 판단 대기
