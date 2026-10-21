---
id: "20261021_1115"
category: BadgeEngine
priority: P3
status: OPEN
created: 2026-10-21
parent: "20261019_1310"
specs:
  - "docs/service/badge-engine/CONDITION_JSON_SPEC.md"
---

# [BadgeEngine] JAM2 미션 조건의 영구 미달성 경고: 요일과 계절을 판정할 값 없이 쓴 조건

## 핵심 요약

- 요구사항: 미션 조건에 `day_of_week`나 `season`을 판정할 값(거리, `season_count` 등) 없이 미션 전용 키하고만 쓰면 엔진이 막아 미션이 완료되지 않는다(`CONDITION_JSON_SPEC` §7.1에 문서화됨). 저장할 때 경고가 없어 운영자가 모르고 만들 수 있다. 서버가 저장 경고(`warning`)를 돌려준다.
- 구현 계획: 먼저 엔진이 어떤 조합을 막는지 `engineCondition.ts` 258~261줄 근처 주석과 엔진 쪽 판정으로 정확히 정리한다. 그 조합을 `checkMissionCondition`(`condition-keys.ts` 477줄)의 경고로 더하고 시험한다. 경고는 응답 `warning` 문자열로 가고 양식이 보인다.
- 관련 파일: `jam-web/src/lib/missions/engineCondition.ts` 258~261줄(주석만 있음), `jam-web/src/lib/missions/condition-keys.ts` 111~139줄(위임 키 목록)·331~336줄(`{error, warning}` 모양)·477~571줄(`checkMissionCondition`), `jam-web/src/app/api/admin/missions/route.ts` 87~88줄과 `[id]/route.ts` 160~161줄(응답 `warning`), `docs/service/badge-engine/CONDITION_JSON_SPEC.md` §7.1.

## 배경 / 문제 정의

티켓 20261019_1312(5-2)가 5-8로 넘긴 항목이다(«저장 경고가 없으므로 양식에서 안내하거나 경고를 더한다»). 티켓 20261019_1318(5-8) 1회 계획을 세우며 조사하니 경고가 서버에 구현돼 있지 않았다(2026-10-21). 판정 규칙이 엔진 쪽에 있어 5-8 범위(어드민 화면)에서 새 규칙을 만들면 엔진과 어긋날 위험이 있어 별도 티켓으로 분리했다.

## 상세 요구사항

### 서비스/코드베이스 관점

- 엔진이 실제로 막는 조합만 경고한다(엔진과 같은 판정을 쓴다, 새 규칙을 따로 만들지 않는다).
- 경고는 저장을 막지 않는다(5-2의 «판정 못 하는 조건은 저장 허용 후 경고만» 결정).

## 완료 조건

- [ ] 엔진이 막는 조합을 문서화한 내용과 코드가 일치한다
- [ ] 그 조합으로 저장하면 응답에 `warning`이 담긴다
- [ ] 막히지 않는 조합에는 경고가 없다

## 진행 기록

## 잔여 이슈
