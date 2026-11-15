---
id: "20261115_0030"
category: Infra
priority: P2
status: OPEN
created: 2026-11-15
closed:
---

# [Infra] staging CI verify가 선행 실패 시험 5건으로 계속 실패한다

## 핵심 요약
- 요구사항: staging의 CI verify가 2026-11-14 16:25 KST(07:25Z)부터 연속 실패한다. 실패하는 시험 7건(파일마다 1건)을 고쳐 CI를 초록으로 되돌린다. 그리고 verify가 test 단계에서 실패하면 실패한 시험 파일의 목록을 출력에 남기게 해서, 게이트가 CI 기록만으로 기존 실패를 가려낼 수 있게 한다.
- 구현 계획: 시험마다 «시험의 기대값이 낡았는가, 구현이 틀렸는가»를 먼저 가린 뒤 낡은 쪽을 고친다. 아래 「실패 시험 지도」의 순서대로 본다. 이미 실행된 마이그레이션 SQL 파일의 내용은 바꾸지 않는다.
- 관련 파일: 아래 「실패 시험 지도」와 `scripts/verify.sh`(26~46줄의 `run_step`과 맨 아래의 실패 보고 구간)

## 배경 / 문제 정의
- 2026-11-16 00:40 KST에 카리나가 메인 트리(staging `42d9a9789`, 실제 설치된 node_modules)에서 `npx vitest run`을 돌렸다. 실패는 55개 파일 555건이었다.
  - 48개 파일(`.tsx` 컴포넌트 시험)은 `Invalid hook call`(로그에 519회)로 실패한다. 이 PC의 로컬 환경에서 나는 문제로 보이며 이 티켓의 범위가 아니다. CI에서도 나는지는 CI 로그에 실패 목록이 없어 확인하지 못했다. 이 티켓의 수정이 CI에 반영된 뒤에도 CI가 실패하면 그때 가린다.
  - 나머지 7개 파일이 아래 지도의 시험이다. 파일마다 1건씩 실패한다. 아이콘 1회차(20261114_2345)와 3회차(20261114_2347) 게이트에서 민지가 기준 커밋에서도 같은 실패를 재현했다.
- CI 로그는 «verify 실패: test»까지만 남긴다. 그래서 액티비티 배지 1회차(20261115_2354) 게이트에서 민지가 CI 실패를 기존 실패로 가려내지 못하고 FAIL로 판정했다. 사용자가 기존 실패부터 고치기로 정했다(2026-11-16).
- 티켓 20261112_2240(2건)과 20261114_1411(3건)이 같은 시험을 다룬다. 이 티켓이 그 둘을 포함한다.

## 실패 시험 지도 (경로 기준 `jam-web/`)
| 파일 | 실패하는 시험 | 지금까지 알려진 어긋남 |
|---|---|---|
| `src/lib/today/__tests__/cardView.test.ts` | toCardView — 표시 데이터 › 기본 필드: 제목·부제·설명문·링크·라벨 | 돌려주는 객체와 기대 객체가 맞지 않는다(`expected { resource: 'badge', … } to match object { title: '제목', subtitle: '부제', … }`) |
| `src/lib/today/__tests__/eventsImports.test.ts` | events.ts가 값으로 닿는 파일에 cardView.ts·한국어 사전(lib/i18n)이 없다 | 이벤트 API 번들에 화면 모듈이나 한국어 사전이 딸려 들어간다 |
| `scripts/asset-generator/__tests__/registerMissionBundle.test.ts` | validateMissionBundle › exposure_mode·status_display_type 값 목록을 검사한다 | `status_display_type`이 `'ranking'`일 때의 메시지 기대값이 구현과 다르다 |
| `scripts/jam2-content/__tests__/gen-launch-sql.test.mjs` | 생성기 결과와 저장소의 SQL 파일 두 개가 한 글자도 다르지 않다 | 생성기 결과와 커밋된 SQL이 다르다 |
| `scripts/jam2-content/__tests__/gen-recipe-sql.test.mjs` | 생성기 결과와 저장소의 SQL 파일 두 개가 한 글자도 다르지 않다 | 생성기 결과와 커밋된 SQL이 다르다 |
| `src/lib/admin/registerChecks/__tests__/registerChecks.test.ts` (597줄 부근) | item_books를 가리키는 외래 키 8곳과 같다(생성 타입 대조) | `ITEM_BOOK_UNDO_REFERENCE_TABLES`와 생성 타입의 실제 참조 표 목록이 다르다 |
| `src/app/api/admin/item-paths/__tests__/route.test.ts` | 아이템마다 다섯 길과 잠긴 채 받는 모습(lock)이 실린다 | tierUp이 `collection_no_tribe`로 닫힐 거라는 기대와 실제 `open: true`가 다르다(`expected { itemId: 'c', … } to match object { status: 'open', … }`) |

## 상세 요구사항

### 서비스/코드베이스 관점
- 시험마다 원인을 먼저 가린다. 최근 변경으로 구현의 동작이 의도대로 바뀐 것이면 시험의 기대값을 고치고, 구현이 의도와 달라진 것이면 구현을 고친다. 어느 쪽인지는 그 동작을 바꾼 커밋과 티켓으로 확인하고, 판단 근거를 완료 보고에 시험마다 한 줄씩 적는다.
- `gen-launch-sql`과 `gen-recipe-sql`: 이미 실행된 마이그레이션 SQL 파일의 내용은 바꾸지 않는다. 생성기나 그 입력이 SQL을 만든 뒤에 바뀐 것이면, 커밋된 SQL이 다시 나오도록 생성기 쪽을 맞추거나 시험이 무엇을 대조해야 하는지를 고친다. 어느 쪽도 확신이 서지 않으면 그 건은 고치지 않고 `alerts`에 `[주의]`로 보고한다.
- `registerChecks`: 생성 타입이 맞다면 `ITEM_BOOK_UNDO_REFERENCE_TABLES`를 실제 참조 표 목록에 맞춘다. 이 목록은 컬렉션 되돌림이 참조를 확인하는 데 쓰이므로, 빠진 표가 있었다면 되돌림 검사의 누락이다. 그 사실을 `alerts`에 적는다.
- `eventsImports`: 번들에 딸려 들어간 경로를 끊는다. 시험을 느슨하게 해서 통과시키지 않는다.
- `scripts/verify.sh`: test 단계가 실패하면 실패한 시험 파일의 경로 목록을 표준 출력에 남긴다(vitest 로그에서 `FAIL`로 시작하는 줄의 파일 경로를 중복 없이, 최대 60줄). 다른 단계의 출력과 종료 코드는 그대로 둔다.
- 48개 `.tsx` 시험의 `Invalid hook call`은 이 티켓에서 고치지 않는다.

## 구현 계획
1. 지도의 일곱 파일을 하나씩 단독으로 돌려 실패를 재현한다(`npx vitest run <파일>`. 단독 실행은 워크트리의 node_modules 심볼릭 링크로도 된다).
2. 시험마다 원인을 가려 고친다.
3. `scripts/verify.sh`의 실패 보고 구간에 시험 실패 파일 목록 출력을 더한다. `scripts/`에 verify.sh를 다루는 시험이 있으면 함께 맞춘다.
4. 일곱 파일을 다시 단독으로 돌려 통과를 확인한다. 전체 `vitest run`은 로컬에서 `Invalid hook call` 때문에 실패하므로, 통과 여부는 CI 결과로 확인한다.

## 완료 조건
### 구현 범위 (게이트 판정 대상)
- 지도의 일곱 시험 파일이 단독 실행에서 모두 통과한다. 재현 경로: `cd jam-web && npx vitest run <지도의 일곱 경로>`.
- 리뷰 브랜치의 CI verify가 success다. success가 아니면, 새로 더한 실패 파일 목록 출력에 지도의 일곱 파일이 없어야 한다.
- 이미 실행된 마이그레이션 SQL 파일(`jam-web/supabase/migrations/`의 기존 파일)에 변경이 없다.
- test 단계가 실패하는 상황에서 verify의 출력에 실패한 시험 파일 경로가 보인다.
- 완료 보고에 시험마다 «기대값을 고쳤는지, 구현을 고쳤는지»와 그 근거가 적혀 있다.

### 후속 범위 (담당: 카리나, 시점: 머지 뒤)
- 티켓 20261112_2240과 20261114_1411을 이 티켓에 포함된 것으로 닫는다.
- CI가 여전히 실패하면 실패 파일 목록으로 `Invalid hook call` 계열이 CI에서도 나는지 가리고, 나면 별도 티켓을 만든다.
- 액티비티 배지 1회차(20261115_2354)와 2회차(20261115_2355)의 리뷰 브랜치를 고쳐진 기준 위로 옮겨 다시 검사한다.

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
- 출처: 민지 sideFindings [주의] (20261114_2345 게이트). 2026-11-15 00:51 KST에 아이콘 3회차(20261114_2347) 검토에서 registerChecks와 item-paths route 두 파일도 staging 코드에서 실패함을 재현했다.

### 잔여 이슈
-
