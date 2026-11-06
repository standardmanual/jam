---
id: "20261107_0042"
category: Infra
priority: P2
status: OPEN
created: 2026-11-07
---

# [Infra] CI에서 textOverflow 시험 3건이 실패해 staging·review 브랜치 CI가 붉다

## 핵심 요약

- 요구사항: `jam-web/scripts/asset-generator/__tests__/textOverflow.test.ts`가 GitHub Actions `verify`의 `test` 단계에서만 실패한다. 원인을 가리고 CI를 녹색으로 되돌린다.
- 구현 계획: 미정(착수 전 규모 판정).
- 관련 파일: `jam-web/scripts/asset-generator/__tests__/textOverflow.test.ts`(23·31줄 단언), `jam-web/scripts/asset-generator/textOverflow.mjs`(실제 캔버스로 글자 폭을 잰다), `.github/workflows/verify.yml`, `scripts/verify.sh`.

## 배경 / 문제 정의

- 실패한 CI 실행: 커밋 `bdcdc2413`(staging, 2026-11-06 14:56Z)와 알림 배치 브랜치 `4ebdd8af9`(15:23Z 재실행 포함 2회). 진단용으로 `verify.sh`가 실패 로그 발췌를 찍게 한 임시 브랜치에서 실패 시험을 확인했다: 파일 1개·시험 3건, 단언은 «글자 시작 위치가 xPct 98이면 짧은 글자도 여백에 닿는다» 등 `expected false to be true`.
- 같은 시험은 로컬(macOS, 한글 글꼴 있음)에서 UTC 시간대로 돌려도 통과한다(전체 954파일·20,408개). 시험 파일은 2026-10-07 이후 바뀌지 않았다. 그 이전 CI(11:56Z, 13:54Z)는 통과했다.
- 시험이 `font.family: 'system-ui'`로 실제 캔버스에서 폭을 재므로, Actions 러너의 글꼴 환경이 바뀌었을 가능성이 높다(확인하지 않았다).
- `verify.sh`는 실패한 단계의 로그를 CI에 남기지 않아 이름을 가리는 데 진단용 브랜치가 필요했다.

## 완료 조건

- 원인(러너 글꼴 변화인지, 캔버스 라이브러리인지)을 확인해 이 티켓에 적는다.
- CI `verify`의 `test` 단계가 통과한다(시험을 글꼴에 의존하지 않게 하거나, 러너에 필요한 글꼴을 준비한다).
- 후속 판단: `verify.sh`가 CI에서 실패 단계의 로그 발췌를 출력하게 할지 정한다(이번에 쓴 방식: `CI`가 있으면 실패 로그의 `FAIL`·`AssertionError` 줄과 끝 30줄을 `::group::`으로 찍는다).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
