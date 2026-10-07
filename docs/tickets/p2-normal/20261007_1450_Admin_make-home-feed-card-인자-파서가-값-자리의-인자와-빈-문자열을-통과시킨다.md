---
id: "20261007_1450"
category: Admin
priority: P2
status: OPEN
created: 2026-10-07
closed:
parent: "20261006_1806"
---

# [Admin] make-home-feed-card 인자 파서가 값 자리의 `--` 인자와 빈 문자열을 통과시킨다

> 상위: 20261006_1806 ⑥-A(20261007_1600)의 게이트 주의 발견물. 이번 범위 밖이라 분리했다.

## 핵심 요약

- 요구사항: `jam-web/scripts/asset-generator/makeHomeFeedCardArgs.mjs`(82줄 근처)의 인자 파서도 ⑥-A의 `renderArgs.mjs`와 같은 규칙을 따르게 한다. 알 수 없는 인자는 오류로 멈추고, 값이 없거나 빈 문자열이거나 `--`로 시작하면 「--키 값이 필요해요」 계열 오류로 멈춘다.
- 문제: 지금은 값 자리에 다른 `--` 인자가 오면 값으로 삼키고 빈 문자열 값도 통과시켜, 남은 검사로만 거른다. 윤진 예약 루틴(`.claude/agents/jam-marketer.md` 140~183줄)이 이 스크립트를 쓴다.
- 구현 계획: `makeHomeFeedCardArgs.mjs`를 `renderArgs.mjs`와 같은 규칙으로 고치고 `makeHomeFeedCard.test.ts`(또는 새 `makeHomeFeedCardArgs.test.ts`)에 같은 케이스를 더한다. 루틴이 쓰는 인자 조합은 그대로 동작해야 한다. 두 파서가 같은 로직이면 공용 함수로 뽑을지는 착수 때 판단한다.
- 관련 파일: `jam-web/scripts/asset-generator/makeHomeFeedCardArgs.mjs`, `jam-web/scripts/asset-generator/__tests__/makeHomeFeedCard.test.ts`, `jam-web/scripts/asset-generator/renderArgs.mjs`(기준).

## 완료 조건

- [ ] `make-home-feed-card`의 알 수 없는 인자·빈 문자열 값·값 자리의 `--` 인자가 오류로 멈춘다.
- [ ] 윤진 루틴이 쓰는 인자 조합은 그대로 동작한다(테스트).
- [ ] `scripts/verify.sh`가 통과한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
