---
id: "20261126_2350"
category: Infra
priority: P3
status: CLOSED
created: 2026-11-26
closed: 2026-11-26
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

### 구현 내용 요약
- 1·2: 커밋 `2a51e015a`(로컬 staging). 오픈 순서 문서 20행을 2026-10-31 지시(드라이런이 그날 값과 같으면 다시 묻지 않고 실행, 다르면 멈추고 보고)에 맞추고, `test26` 이름을 `test26_gateWithoutRangeChecksOutLocalStaging`으로 바꿨다.
- 3: 반영하지 않았다. 실제 설치본에서 `eslint-config-next@16.3.8`(고정)로 올려 verify를 돌리자 lint가 경고 32건(no-unused-vars 24, no-location-assign-relative-destination 6, no-img-element 2)으로 실패했다. 완료 조건대로 되돌리고(실제 설치본도 `npm ci`로 16.2.10 복원) 후속 티켓 20261126_2358로 넘겼다.

### 테스트 결과
- [x] `node .claude/workflows/jam-work.test.mjs` 전체 통과
- [x] 3번 시험 결과: lint 실패(경고 32건), 나머지 단계는 실행 전 중단

### 주요 의사결정 / 핵심 메모
- 카리나 직접 처리(경미). 같은 차례에 사용자 결정 두 가지를 기록했다: 메인 폴더 staging 전환은 «보류»(티켓 20261126_2325 OPEN 유지), 무인 루틴 리포트 push와 규칙 3의 관계는 «루틴을 켤 때 정하기»(`scheduled-jobs.md`에 미정으로 적음).

### 잔여 이슈
- eslint-config-next 판 맞추기는 20261126_2358.
