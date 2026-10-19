---
id: "20261019_1720"
category: BadgeEngine
priority: P3
status: OPEN
created: 2026-10-19
parent: "20261019_1310"
specs:
  - "docs/plan/jam2/10 JAM 2.0 서비스 운영 로직.md"
---

# [BadgeEngine] JAM2 숨김 배지 차단 잔여: 운영툴 배지 등록·등록 스크립트의 숨김 참조 검사, 게이트 미션 노출 조건 계열

## 핵심 요약

- 요구사항: 5-3 2회(티켓 `20261019_1313`, 티켓 `20261019_0012` 처리)가 숨김 배지를 미션 보상·선행 조건·교차 게이트·게이트 미션 배지로 쓰지 못하게 막았지만, 민지 게이트가 아래 두 틈과 참고 3건을 남겼다. 공용 DB는 숨김 배지가 0개(2026-10-19 읽기 전용 확인)라 지금 새는 곳은 없다. 숨김 배지를 처음 만들기 전에 닫는다.
  1. **운영툴 배지 등록과 등록 스크립트**: `jam-web/src/lib/admin/opsInbox/execute/jamBadge.ts` 116줄 근처와 `jam-web/scripts/asset-generator/registerBundle.mjs` 217줄 근처는 `findBadgeConditionSaveError`만 부르고 `findHiddenBadgeReferenceError`(`lib/admin/badge-validation.ts`)를 부르지 않는다. 이 경로로는 숨김 배지를 선행·교차 게이트로 쓰는 배지를 등록할 수 있다. 계획이 호출처를 어드민 POST·PUT 둘로 정해서 생긴 틈이다.
  2. **게이트 미션 노출 조건**: `visibility_rule_json`이 가리키는 배지 계열은 숨김 검사 밖이다. 잠긴 미션 목록의 `requiredBadge`로 이름이 내려가는 경로다(`jam-web/src/lib/missions/visibility.ts` 149줄 근처).
  3. 참고: (a) 미션 상세·목록은 보상 배지를 `deleted_at is null`로 읽어 숨김 목록을 만들기 때문에 삭제된 숨김 배지의 id가 `reward_badge_ids`에 남는다(투데이 카드는 삭제 배지도 거르지 않아 다르다). 숨김으로 바꾸는 저장이 삭제된 배지의 사용처도 막아서 지금은 도달할 수 없다(`app/(main)/missions/[id]/page.tsx` 42줄 근처). (b) `excludeHidden` 연결(`app/admin/missions/MissionForm.tsx` 325줄 근처, `GateMissionForm.tsx`)은 시험이 없다(검색 라우트만 시험). (c) `lib/missions/reward-badges.ts`의 `UUID_PATTERN`이 `registerChecks/bundleRules`의 것과 같은 정규식을 따로 정의한다.
- 구현 계획: 시작 때 1번의 두 호출처에서 `findHiddenBadgeReferenceError`를 어드민과 같은 방식으로 부르게 하고 시험을 더한다. 2번은 `visibility_rule_json`이 가리키는 계열을 같은 검증에 넣을지, 노출 쪽(`requiredBadge`)에서 가릴지 정한다. 참고 3건은 같은 작업에서 함께 정리한다.

## 완료 조건

- 운영툴 배지 등록과 등록 스크립트도 숨김 배지를 선행·교차 게이트로 쓰는 배지를 거절한다(시험으로 확인).
- 게이트 미션 노출 조건이 숨김 배지의 이름을 잠긴 미션 목록으로 내리지 않는다(시험으로 확인).
- 참고 3건이 정리되었거나 정리하지 않는 이유가 이 티켓에 기록되어 있다.

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

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
