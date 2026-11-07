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
- 구현 계획: 아래 «구현 계획» 절(시험이 글꼴 환경에 의존하지 않게 고친다).
- 관련 파일: `jam-web/scripts/asset-generator/__tests__/textOverflow.test.ts`(23·31줄 단언), `jam-web/scripts/asset-generator/textOverflow.mjs`(실제 캔버스로 글자 폭을 잰다), `.github/workflows/verify.yml`, `scripts/verify.sh`.

## 배경 / 문제 정의

- 실패한 CI 실행: 커밋 `bdcdc2413`(staging, 2026-11-06 14:56Z)와 알림 배치 브랜치 `4ebdd8af9`(15:23Z 재실행 포함 2회). 진단용으로 `verify.sh`가 실패 로그 발췌를 찍게 한 임시 브랜치에서 실패 시험을 확인했다: 파일 1개·시험 3건, 단언은 «글자 시작 위치가 xPct 98이면 짧은 글자도 여백에 닿는다» 등 `expected false to be true`.
- 같은 시험은 로컬(macOS, 한글 글꼴 있음)에서 UTC 시간대로 돌려도 통과한다(전체 954파일·20,408개). 시험 파일은 2026-10-07 이후 바뀌지 않았다. 그 이전 CI(11:56Z, 13:54Z)는 통과했다.
- 시험이 `font.family: 'system-ui'`로 실제 캔버스에서 폭을 재므로, Actions 러너의 글꼴 환경이 바뀌었을 가능성이 높다(확인하지 않았다).
- `verify.sh`는 실패한 단계의 로그를 CI에 남기지 않아 이름을 가리는 데 진단용 브랜치가 필요했다.

## 원인 확인 (2026-11-07, 진단용 임시 브랜치 `claude/diag-0042-fonts`, 확인 뒤 삭제함)

- 러너: Ubuntu 26.04.1 LTS, 이미지 버전 20261101.186.1. `fc-list | wc -l` = 53, **`fc-list :lang=ko` 결과 없음**(Lato·DejaVu·Liberation만 있음). `GlobalFonts.families`는 9개이고 한글 글꼴은 없다.
- `@napi-rs/canvas`에서 `400 100px "system-ui"`로 `가나다`와 `ABC`를 그리면 `measureText.width`가 둘 다 373.55로 같고 **불투명 픽셀이 0개**다. 러너에서 `system-ui`가 실제 글꼴로 풀리지 않아 아무것도 그려지지 않는다. 그래서 «넘침이 있다»(`toBe(true)`) 단언 3건만 실패한다. 원인은 러너의 글꼴 환경이고 캔버스 라이브러리가 아니다.
- 진단 방식: `claude/**` 브랜치에 `verify.yml`을 진단 단계(`fc-list`, 캔버스 폭·픽셀 출력)만 있는 것으로 바꿔 push하고 로그를 읽었다. `verify.sh`는 CI에서 실패 로그를 남기지 않아 이 방식이 필요했다.

## 구현 계획

규모: 변경 파일 1~2개(시험 파일과 필요하면 `.github/workflows/verify.yml`·진단용 임시 브랜치 제외), 변경 줄 수 약 30줄 이내.

1. **원인 확인(근거를 티켓에 적는다)**: 시험은 `font.family: 'system-ui'`로 `@napi-rs/canvas`에 실제로 글자를 그린다. 러너에 한글 글꼴이 없으면 한글 글리프가 그려지지 않아(또는 폭이 달라) «넘침이 있다»는 단언 3건(시험 파일 23·31줄 근처의 `toBe(true)` 케이스)만 실패한다. 이를 확인하려면 `claude/diag-…` 브랜치(이름이 `claude/**`여야 CI가 돈다)에 CI 단계 하나를 임시로 더해 `fc-list :lang=ko`와 해당 시험 값을 찍고, 확인 뒤 브랜치를 삭제한다. 진단 커밋은 staging에 들어가지 않는다.
2. **고치는 방향(추천)**: 시험이 시스템 글꼴 대신 저장소에 있는 글꼴 파일을 쓰게 한다. 저장소에 `jam-web/scripts/badge-image-gen/fonts/Pretendard-Bold.ttf`·`Pretendard-Black.ttf`가 있다. 시험 시작 때 `GlobalFonts.registerFromPath`로 등록하고 텍스트 레이어의 `font`를 그 family로 바꾼다. 단 `createTextOverflowDetector`는 `system-ui`가 아닌 family에 대해 `loadFont`(구글 폰트 다운로드, 네트워크)를 부르므로, 이 경로를 타지 않게 하는 방법(시험에서 로더를 주입하거나 family를 시스템 판정에 맞추는 방법)은 아현이 코드를 읽고 정하되, **시험에서 네트워크를 쓰지 않는다**. 운영 코드(`textOverflow.mjs`)의 동작은 바꾸지 않는다(시험이 쓰는 주입 지점이 이미 있으면 그것만 쓴다).
3. **대안(추천하지 않음)**: 러너에 `fonts-noto-cjk`를 설치하는 단계를 `verify.yml`에 추가한다. 시간이 늘고 러너 이미지 변화에 계속 묶인다.
4. 단언의 의미(왼쪽 짧은 글자는 안 닿음, 긴 글자는 닿음, 가운데 정렬, xPct 98, 빈 문자열, 이미지 레이어 무시, 없는 번호 오류)는 그대로 유지한다.
5. `verify.sh`의 CI 실패 로그 발췌 출력은 이 티켓 범위 밖이다(후속 판단으로 두고, 이번 진단에서 쓴 방식을 티켓에 한 줄 남긴다).

## 완료 조건

- 원인(러너 글꼴 변화인지, 캔버스 라이브러리인지)을 확인해 이 티켓에 적는다.
- CI `verify`의 `test` 단계가 통과한다(시험을 글꼴에 의존하지 않게 하거나, 러너에 필요한 글꼴을 준비한다).
- 후속 판단: `verify.sh`가 CI에서 실패 단계의 로그 발췌를 출력하게 할지 정한다(이번에 쓴 방식: `CI`가 있으면 실패 로그의 `FAIL`·`AssertionError` 줄과 끝 30줄을 `::group::`으로 찍는다).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
