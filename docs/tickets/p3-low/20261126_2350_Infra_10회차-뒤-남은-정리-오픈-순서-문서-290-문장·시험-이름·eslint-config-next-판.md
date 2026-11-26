---
id: "20261126_2350"
category: Infra
priority: P3
status: OPEN
created: 2026-11-26
---

# [Infra] 10회차 뒤 남은 정리: 오픈 순서 문서 290 문장·시험 이름·eslint-config-next 판

## 핵심 요약

- 요구사항: 티켓 20261125_1923(10회차) 완료 뒤 남은 사소한 항목 세 가지를 정리한다(사용자 «남은 걸 진행해», 2026-11-26).
  1. `docs/plan/jam2/12 JAM 2.0 오픈 전후 적용 순서.md` 20행 «290만은 2026-10-24 사용자 결정으로 드라이런을 보여 드리고 승인받은 뒤 실행한다»가 같은 문서 89행의 나중 지시(2026-10-31: 드라이런이 그날 값과 같으면 다시 묻지 않고 실행, 다르면 멈추고 보고)와 어긋난다(10-4 민지 발견). 20행을 89행에 맞춘다.
  2. `.claude/workflows/jam-work.test.mjs`의 `test26_gateWithoutRangeChecksOutOriginStaging`은 10-5 뒤 실제로는 로컬 staging을 체크아웃하는 동작을 시험한다(10-5 민지 발견). 이름을 `test26_gateWithoutRangeChecksOutLocalStaging`으로 바꾼다.
  3. `jam-web/package.json`의 `eslint-config-next`가 16.2.10이고 Next는 16.3.8이다(2026-09-23 보안 상향 때 Next만 올라감, 1249 민지 발견). 같은 판(16.3.8, 고정 표기 유지)으로 맞추고 lint·typecheck·test가 그대로 통과하는지 실제 설치본에서 확인한다. 새 lint 규칙 위반이 나오면 맞추지 않고 보고한다.
- 화면 변화: 없음.

## 완료 조건

- 1·2는 해당 문장·이름이 바뀌고 `node .claude/workflows/jam-work.test.mjs`가 통과한다.
- 3은 실제 설치본 `scripts/verify.sh` 20단계 통과 뒤 반영한다.

## 완료 기록 *(작업 완료 후 작성)*
