---
id: "20261022_2248"
category: Admin
priority: P2
status: IN_PROGRESS
created: 2026-10-22
---

# [Admin] 투데이 카드 dome·ticket 형태 추가 뒤 시험 9건이 staging에서 실패한다

## 핵심 요약

- 요구사항: 커밋 `10ff5ec2e`(티켓 `20261022_2225`, 22:29 KST)가 투데이 카드 모양에 `dome`과 `ticket`을 더했는데(마이그레이션 286, `lib/today/shape.ts`의 `CARD_SHAPES`, `lib/admin/today-sections.ts`), 모양 목록을 고정한 시험 일부가 고쳐지지 않아 staging에서 시험 9건이 실패한다. 시험의 기대값을 새 모양 7개에 맞추거나, 의도와 다르면 코드를 고친다.
- 실패한 시험(파일 3개, 9건): `jam-web/scripts/asset-generator/__tests__/registerHomeFeedBundle.test.ts` 1건(노출 형태 목록이 `today_cards_layout_type_check`와 같다), `jam-web/src/lib/admin/opsInbox/__tests__/registerInput.test.ts` 1건(제목 상한 상수는 모양 5개를 모두 갖는다), `jam-web/src/lib/admin/opsInbox/__tests__/validate.test.ts` 7건(`shape`가 없거나 허용값 밖일 때의 안내, `card_shapes`는 5개 모양만 허용)
- 관련 파일: 위 시험 3개, 모양 목록의 기준 `jam-web/src/lib/today/shape.ts`, `jam-web/src/lib/admin/opsInbox/`(`validate`가 허용값을 안내하는 문구), 원인 커밋 `10ff5ec2e`

## 배경 / 문제 정의

티켓 `20261022_1138`(7-7) 1회 보강 머지 시험(최신 `origin/staging` `10ff5ec2e` 위, 전체 785파일 16,975건)에서 발견했다. 7-7 변경은 `scripts/asset-generator`와 `src/lib/admin/opsInbox`를 건드리지 않았고(원격과의 diff가 비어 있음) 같은 파일들이 `10ff5ec2e`와 같은 상태에서 시험이 실패한다. staging push에는 전체 시험이 걸려 있지 않아(티켓 `20260922_0205`) 눈에 띄지 않았다. 이 커밋은 TodayCard·shape 시험은 고쳤지만 위 세 파일은 고치지 않았다.

**추가 발견(2026-10-22, 티켓 `20261022_1138` 7-7 2회 게이트)**: 같은 원인의 시험이 하나 더 있다. `scripts/ops-patterns-seed.test.mjs`(275줄 부근)가 `verify.sh`의 scripts-test 단계에서 실패해, 이 저장소의 모든 `claude/*` 브랜치 CI가 빨갛게 나온다. 위 3개 파일 9건(vitest)과 이 1건(node:test)을 함께 고친다. 전체 시험은 vitest 기준 786파일 17,007건 가운데 9건만 실패한다(카리나가 최신 `origin/staging` `1a46da3d4` 위에서 확인). 완료 조건에 `scripts/ops-patterns-seed.test.mjs`가 통과함을 더한다.

## 상세 요구사항

### 서비스/코드베이스 관점

- 허용값을 «모양 5개»로 적은 문구와 기대 배열을 `CARD_SHAPES`(7개)에 맞춘다. 시험이 상수를 직접 가져오게 바꾸면 같은 일이 되풀이되지 않는다(선택).
- `asset-generator`의 홈피드 묶음 등록 스크립트도 같은 허용값을 쓰는지 확인한다.

## 구현 계획

기준은 `shape.ts`의 `CARD_SHAPES`와 마이그레이션 286의 CHECK다. 시험 세 파일의 기대값과 오류 문구를 맞추고 `npx vitest run src/lib/admin/opsInbox scripts/asset-generator`를 돌린다.

## 완료 조건

- 위 시험 3개 파일이 모두 통과하고, 전체 시험이 통과한다.
- 허용 모양 목록을 한 곳(`CARD_SHAPES`)에서 읽는 시험과 문구가 같은 목록을 가리킨다.

## 진행 기록

- 2026-10-23 JAM 2.0 부가 P2 티켓 일괄 처리(jam-work)로 착수한다. 카리나가 최신 `origin/staging`에서 아직 재현됨을 확인했다. 유형 `bug`, 경로 ③ 표준. 규모 사전 판정: 파일 5~6개, 변경 50줄 안팎이다. 구현 계획과 관련 파일에 경로·함수명이 적혀 있고 범위가 한 가지 일이라 `planOnlyWaiver`를 넘긴다. 확인한 사실: vitest 3개 파일에서 9건이 그대로 실패하고, `scripts/ops-patterns-seed.test.mjs`도 `deepStrictEqual`로 실패한다(실제 5개 모양, 기대 7개). 결정: 시험이 `CARD_SHAPES`를 직접 가져오게 바꾼다(상세 요구사항의 선택 항목을 채택). 시드 시험은 코드가 낡았는지 시험이 낡았는지 가려서 고친다.

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
- 배포일: 
- 환경: production
- 커밋: 

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
