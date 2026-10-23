---
id: "20261022_2248"
category: Admin
priority: P2
status: CLOSED
closed: 2026-10-23
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
## 완료 기록

### 구현 내용 요약

- 원인: 커밋 `10ff5ec2e`(티켓 20261022_2225)가 투데이 카드 모양을 7개(`dome`, `ticket` 추가)로 늘렸지만, 모양을 5개로 고정한 시험과 시드 스크립트의 허용 목록이 함께 고쳐지지 않았다.
- `validate.test.ts`: 하드코딩한 5개 모양 기대값을 `@/lib/today/shape`의 `CARD_SHAPES` 직접 import로 바꿨다(오류 문구 4곳, `it.each` 2곳).
- `registerInput.test.ts`: 제목 상한 기대 객체에 `dome` 22, `ticket` 22를 더했다. `CARD_TITLE_MAX_LENGTH`와 일치한다.
- `registerHomeFeedBundle.test.ts`: 노출 형태 대조 기준을 마이그레이션 158에서 최신 CHECK인 286으로 옮겼다.
- `scripts/ops-patterns-seed.mjs`: 코드가 낡은 쪽이라 허용 목록을 7개로 맞췄다. 원고가 바뀌지 않아 SQL 212는 그대로다.
- 앱 코드와 마이그레이션 변경은 없다.

### 변경된 파일
```
jam-web/scripts/asset-generator/__tests__/registerHomeFeedBundle.test.ts
jam-web/src/lib/admin/opsInbox/__tests__/registerInput.test.ts
jam-web/src/lib/admin/opsInbox/__tests__/validate.test.ts
scripts/ops-patterns-seed.mjs
(추가 13줄, 삭제 12줄)
```

### 테스트 결과
- [x] vitest 66파일 3,009건 통과(`opsInbox`, `asset-generator`)
- [x] `node --test scripts/ops-patterns-seed.test.mjs` 22건 통과
- [x] CI `verify` 성공(Actions 실행 39898231052, 커밋 `bf54be011`)
- [x] 게이트(민지) PASS(재판정). 첫 판정은 FAIL이었고 사유는 이 패치가 아니라 범위 밖의 프로필 캡슐 시험 1건이었다

### 배포 정보
- 배포일: 2026-10-23
- 환경: staging (main 반영은 JAM 2.0 출시 전까지 하지 않는다)
- 커밋: `ca628d5bc` (머지 커밋)

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 구현(중간 저장 커밋 이어받기) | 1 | 60,609 | 15,426 / - | 8분 29초 | 40 |
| 게이트(FAIL, 범위 밖 시험 1건) | 1 | 59,346 | - / 18,502 | 7분 1초 | 33 |
| 게이트 재판정(PASS) | 1 | 45,729 | - / 8,977 | 5분 48초 | 20 |
| 합계 | 3 | 165,684 | 15,426 / 27,479 | 21분 18초 | 93 |

앞선 중단된 실행 3회분의 토큰은 측정하지 못해 이 표에 없다.

### 주요 의사결정 / 핵심 메모

- 상세 요구사항의 선택 항목(시험이 `CARD_SHAPES`를 직접 가져오게 한다)을 채택했다.
- 시드 시험의 실패는 시험이 아니라 코드(허용 목록)가 낡은 쪽이라 스크립트를 고쳤다.
- 실행이 세 차례 중단돼(앱 종료 2회, 중단 요청 1회) 구현 중간 저장 커밋을 이어받아 완성했다.
- 첫 게이트의 FAIL 사유는 이 패치가 아니라 최신 staging에서 이미 실패하던 `ProfileClient.capsule.test.tsx` 1건(원인 커밋 `260ee2344`)이었다. 같은 실패를 다른 세션이 티켓 `20261023_1248`로 먼저 남겨 두었고, 카리나가 같은 방식으로 기대를 뒤집어 `668d82f7c`로 staging에 올린 뒤 재판정해 PASS를 받았다.
- 아현이 최신 staging 위로 옮기자 원격 브랜치와 갈라졌고 강제 push는 권한 시스템이 거부했다. 우회하지 않고 새 브랜치 이름(`...-final`, `...-final2`)으로 일반 push했다.

### 잔여 이슈
- 모양 5개를 하드코딩한 부분집합 시험 5곳 → 티켓 `20261023_1311`
- 운영 패턴 원고와 SQL 212의 어긋남 → 티켓 `20261023_1312`
