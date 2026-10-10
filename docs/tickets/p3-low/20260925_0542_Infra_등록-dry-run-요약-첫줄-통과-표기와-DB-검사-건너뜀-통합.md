---
id: "20260925_0542"
category: Infra
priority: P3
status: CLOSED
created: 2026-09-25
closed: 2026-09-26
parent: "20260924_2154"
specs:
  - "docs/service/prd/asset-generator/REGISTRATION_BUNDLE.md"
---

# [Infra] 등록 dry-run 요약이 DB 검사를 건너뛰었어도 첫 줄에 '통과'만 찍는 문제를 고친다

> 티켓 20260924_2202 게이트 리뷰에서 민지가 낸 범위 밖 발견물을 3.2절대로 자동 티켓화했다. 카리나가 실제 스키마로 확인한 사실을 덧붙였다.

## 핵심 요약

- 요구사항: `register-badge.mjs --dry-run`은 서비스 키가 없으면 DB 읽기 검사(이름 중복·tribe_id·item_book_id 존재)를 건너뛰는데도 첫 줄에 `결과: 통과`만 찍고 "건너뜀"은 `[DB 읽기 검사]` 절에만 나온다. 컨펌 자료(dry-run 요약)를 훑는 사람이 중복 검사까지 끝난 것으로 읽을 수 있다. 실제로 카리나가 격리 환경에서 예시 묶음을 돌렸을 때 첫 줄이 `결과: 통과`였다.
- 구현 계획: 첫 줄을 `결과: 통과 (DB 읽기 검사는 건너뜀 — 서비스 키 없음)`처럼 건너뜀이 있으면 함께 적는다. 건너뜀이 있는 dry-run 요약은 컨펌 근거로 쓰지 말고 키가 있는 환경(메인 폴더)에서 다시 돌리라는 안내를 넣는다.
- 관련 파일: `jam-web/scripts/asset-generator/registerRecord.mjs`(`formatDryRunSummary`), `docs/service/prd/asset-generator/REGISTRATION_BUNDLE.md`(절차 절), 테스트 `__tests__/registerRecord.test.ts`

## 완료 조건
- 키가 없을 때 dry-run 첫 줄에 건너뜀이 표기되고, 키가 있을 때는 기존과 같다(테스트).
- `npm run lint`·`npm test` 통과.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- `formatDryRunSummary`가 `dbChecks`에 `건너뜀`이 있으면 첫 줄을 `결과: 통과 (DB 읽기 검사는 건너뜀 — 서비스 키 없음)`으로 적고, 바로 아래에 `※ DB 읽기 검사(...)가 빠진 요약이에요. 컨펌 근거로 쓰지 말고, 서비스 키가 있는 환경(메인 폴더)에서 다시 돌려요.` 안내 줄을 넣는다. 건너뜀이 없으면 출력은 기존과 같다.
- `docs/service/prd/asset-generator/REGISTRATION_BUNDLE.md` §6 `--dry-run` 절에 같은 동작을 적었다.

### 변경된 파일
```
jam-web/scripts/asset-generator/registerRecord.mjs
jam-web/scripts/asset-generator/__tests__/registerRecord.test.ts
docs/service/prd/asset-generator/REGISTRATION_BUNDLE.md
```

### 테스트 결과
- [x] `registerRecord.test.ts`: 건너뜀이 있을 때 첫 줄·안내 줄, 없을 때 첫 줄 `결과: 통과`와 안내 없음 확인
- [x] 최종 `scripts/verify.sh`는 티켓 20260925_0540 완료 기록 참고(묶음 전체 1회 실행)

### 배포 정보
- 배포일: 
- 환경: production
- 커밋: 

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모
- 검사 실패(`결과: 실패 (N건)`)일 때는 첫 줄을 바꾸지 않았다. 실패는 어느 쪽이든 고쳐야 하고, 티켓이 요구한 것은 «통과»가 오해를 부르는 경우다. 다만 건너뜀이 있으면 실패 요약에도 안내 줄은 붙는다.
- 건너뜀 판정은 `dbChecks`의 `status === '건너뜀'` 하나로 한다(`runDbChecks`가 서비스 키 없음일 때만 이 값을 낸다). 첫 줄의 사유 문구는 그 유일한 원인인 «서비스 키 없음»을 적었다.

### 잔여 이슈
- 미션·홈피드 dry-run 요약(`formatMissionDryRunSummary`·`formatHomeFeedDryRunSummary`)은 이 티켓 범위 밖이라 그대로다. 같은 문제가 있는지는 확인하지 않았다.

---
## 종료 기록 (2026-09-26, 카리나)

- 묶음 실행(티켓 0540·0542·0549)이다. 병합 커밋 c8bc1efa. 사용자가 병합을 승인했다(2026-09-26). 게이트(민지) **WARN**, 재작업 없음.
- **WARN의 원인은 이 묶음이 아니다.** 브랜치 CI(`verify`)가 `asset-bundle` 단계에서 실패했는데, 민지가 기준 커밋에서도 같은 오류를 재현했다. 원인은 카리나가 묶음 B(0239, 프리셋 타입 통합)를 묶음 C의 번들 재생성 뒤에 병합해 생긴 staging의 번들 드리프트였다. 카리나가 번들을 재생성해 해소했다(`95f8708c`). 병합 뒤 `scripts/verify.sh` 전체(lint·typecheck·test·ds:check·asset-bundle·slop·scripts-test·contract 등)가 통과했다.
- 병합 전 오염 검사가 「조상 아님」으로 나왔으나 원인은 브랜치 기준(`a023a714`) 이후 카리나가 staging에 올린 커밋 2개(번들 재생성 `95f8708c`, 티켓 생성 `028fa5c9`)였다. 브랜치 고유 커밋은 예상한 5개뿐이었다.
- 스크립트 테스트 334건(14파일)이 통과한다(민지가 재실행). 전부 스텁이라 실제 DB·Storage에 쓰지 않았다.
- 후속 티켓 20260926_0120(미션·홈피드 등록 스크립트의 정규식 복제와 dry-run 요약 표기, OPEN, P3).
- 이 티켓의 판정: `formatDryRunSummary`가 `dbChecks`에 「건너뜀」이 있으면 첫 줄을 `결과: 통과 (DB 읽기 검사는 건너뜀 — 서비스 키 없음)`으로 적고 「컨펌 근거로 쓰지 말고 키가 있는 환경(메인 폴더)에서 다시 돌려요」 안내 줄을 붙인다. 건너뜀이 없으면 기존 출력 그대로, 실패 요약의 첫 줄은 유지된다. 두 경우 모두 테스트가 있다.
- **한계**: 배지 등록 스크립트만 고쳤다. 미션·홈피드 `--dry-run` 요약이 같은 문제를 갖는지는 확인하지 않았다(후속 티켓 0120).

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차(0540·0542·0549 묶음) | 아현·민지 | 176,044 | 38,337 / 6,449 | 11분 44초 | 68 |
| 합계 | 아현·민지 | 176,044 | 38,337 / 6,449 | 11분 44초 | 68 |

(세 티켓을 한 번의 실행으로 처리해 지표는 묶음 전체 값이다. 세 티켓 모두 같은 값을 적었다.)
