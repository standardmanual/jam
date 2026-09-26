---
id: "20260926_1513"
category: Admin
priority: P3
status: CLOSED
created: 2026-09-26
closed: 2026-09-26
related:
  - "20260926_1510"
  - "20260926_1409"
  - "20260926_1410"
---

# [Admin] 테스트 보강 묶음: `image_url` 라우트 배선·단건 삭제 「본인」(1510), `list-bulk` 트라이브 지정 오류(1409), 배포 전 점검 경계·단언(1410)

> 하위 티켓들을 한 번의 구현·게이트·병합으로 처리하기 위한 묶음 티켓이다(사용자 지시, 2026-09-26). 끝나면 하위 티켓도 함께 닫는다. **각 하위 티켓의 본문이 세부 기준이다. 아래 표는 파일 단위 실행 범위다.**

## 핵심 요약

- 요구사항: 이번 세션 배포 전 점검(민지 모드 ③)이 남긴 테스트 공백을 채운다. **코드 변경은 없고 테스트만 추가·보강한다.** (1) 티켓 20260926_1510: `badges/[id]`·`missions/[id]`의 `image_url` 비문자열 400을 라우트 테스트로 고정하고(호출부를 빼면 실패해야 함), 단건 완전 삭제의 「본인」 케이스를 일반 유저 계정으로 만들어 본인 분기만 타게 하며 문구를 단언하고, `ADMIN_EMAILS` 화이트리스트에만 있고 `is_admin`이 false인 어드민 케이스를 추가한다. (2) 티켓 20260926_1409: `list-bulk`의 트라이브 지정 경로 오류 3곳(`tribeError`, `booksError`, `fetchBadgeTribeCandidates`의 `.in()` 오류)이 500과 고정 문장이고 원문이 없음을 테스트한다. (3) 티켓 20260926_1410(그 뒤 덧붙인 항목 포함, 모두 [참고]): 제재 필터 경계(999건·0건), `buildFilledByBook` 빈 입력, 느슨한 단언 보강, export 라우트 10개의 라우트별 정상 경로(CSV 본문·헤더·청크), 드랍 제외 일괄의 조회 오류·묶음 경계, `probeWorkflowFreeze` 두 분기, 배포 게이트 쿠키 삭제 분기, `buildPublicMissionCheckLines` 경계.
- **범위 제외**: 1410에 덧붙인 "프리셋 POST의 `layers` 비객체 원소"는 묶음 J1이 다룬다. `RecipeTable` 문구 테스트는 기능 회귀 위험이 낮아 이번에 하지 않는다. 드랍 제외 일괄의 「아이템배지가 아닙니다」 문구 관찰은 문구 변경이라 이번 범위 밖이다(기록만).
- 관련 파일: `jam-web/src/app/api/admin/badges/[id]/__tests__/route.test.ts`, `jam-web/src/app/api/admin/missions/[id]/`(테스트 신규), `jam-web/src/app/api/admin/users/[id]/__tests__/route.test.ts`, `jam-web/src/app/api/admin/badges/list-bulk/__tests__/route.test.ts`, `jam-web/src/lib/admin/__tests__/user-list.test.ts`, `jam-web/src/lib/itembook/__tests__/filled-by-book.test.ts`, `jam-web/src/app/api/admin/__tests__/export-ids-routes.test.ts`, `jam-web/src/app/api/admin/drop-policy/exclusions/bulk/__tests__/route.test.ts`, `scripts/doc-check-hook.test.mjs`, `scripts/deploy-gate.test.mjs`, `scripts/public-mission-check.test.mjs`.

## 구현 계획

### 파일 단위 계획 (규모 사전 판정, 2026-09-26)

| # | 파일 | 하는 일 | 예상 줄 수 |
|---|---|---|---|
| 1 | `badges/[id]/__tests__/route.test.ts`, `missions/[id]/__tests__/route.test.ts`(신규) | 비문자열 `image_url` → 400, 호출부를 제거하면 실패, 정상 수정 유지 | 약 90 |
| 2 | `users/[id]/__tests__/route.test.ts` | 본인 케이스(일반 유저 계정, 본인 분기만, 문구 단언), 화이트리스트 어드민(`is_admin` false) 케이스, `hardDeleteUser`의 `ok:false` 경로 | 약 50 |
| 3 | `badges/list-bulk/__tests__/route.test.ts` | 트라이브 지정 오류 3곳 500·원문 미노출·`console.error` 로그 접두어 단언 | 약 60 |
| 4 | `user-list.test.ts`, `filled-by-book.test.ts` | 제재 필터 999건·0건 경계, `buildFilledByBook` 빈 입력, 키 없음과 빈 집합을 구분하는 단언 | 약 40 |
| 5 | `export-ids-routes.test.ts` | 라우트별 정상 경로(CSV 본문·헤더·청크)를 가능한 범위에서 강화, `call()`이 예외를 삼켜 null이 통과하지 않게 | 약 60 |
| 6 | `drop-policy/exclusions/bulk/__tests__/route.test.ts` | 조회 DB 오류 500, `ID_CHUNK_SIZE` 초과 다중 묶음 | 약 45 |
| 7 | `doc-check-hook.test.mjs`, `deploy-gate.test.mjs`, `public-mission-check.test.mjs` | `probeWorkflowFreeze`의 예외 파일까지 막는 분기·임시 저장소 생성 실패 분기, 게이트 쿠키 삭제 분기(`Max-Age<=0`·빈 값), `buildPublicMissionCheckLines`의 `badges` 키 없음·null | 약 80 |

- 예상 합계 약 425줄(전부 테스트), 변경 파일 약 13개라 기준을 넘긴다. `planOnlyWaiver`로 첫 호출부터 면제한다. 실제 DB·스토리지·네트워크는 접근하지 않고 스텁으로만 한다. 훅·게이트 테스트는 임시 저장소에서만 돌리고 메인 저장소의 훅·브랜치를 바꾸지 않는다. **테스트를 만들다 실제 결함이 드러나면 고치지 말고 `alerts`에 `[주의]`로 보고한다**(범위 밖).

## 완료 조건

- 위 (1)~(3)의 공백이 테스트로 채워지고, 코드 변경 없이 기존 테스트도 그대로 통과한다. 특히 (1)은 호출부를 제거하면 테스트가 실패함을 확인한다. `scripts/verify.sh` 통과.

---
## 완료 기록

### 구현 내용 요약
- 하위 티켓 세 건(20260926_1510, 20260926_1409, 20260926_1410)을 한 번의 구현·게이트·병합으로 처리했고 세 건도 함께 CLOSED로 바꿨다. 코드 변경 없이 테스트 파일만 바꿨다(신규 1개, 수정 10개). 세부는 각 하위 티켓의 완료 기록에 있다.
- 테스트를 만드는 중 실제 결함 3건이 드러났으나 범위 밖이라 고치지 않고 티켓으로 남겼다(아래 「범위 밖 발견물」).

### 변경된 파일
```
- jam-web/src/app/api/admin/{badges/[id], missions/[id](신규), users/[id], badges/list-bulk, drop-policy/exclusions/bulk}/__tests__/route.test.ts
- jam-web/src/app/api/admin/__tests__/export-ids-routes.test.ts
- jam-web/src/lib/admin/__tests__/user-list.test.ts, jam-web/src/lib/itembook/__tests__/filled-by-book.test.ts
- scripts/{doc-check-hook,deploy-gate,public-mission-check}.test.mjs
```

### 테스트 결과
- [x] `scripts/verify.sh` 전 항목 통과, CI `verify` 성공(실행 36223626726, 커밋 5e9beb72). 병합 뒤 통합본에서 vitest 82개 파일 1088건, `deploy-gate.test.mjs`·`public-mission-check.test.mjs` 통과
- [x] 민지 게이트 **PASS**. 점검 12항목 중 1·2·4·5·10·11 통과, 나머지 해당 없음. 검토 범위 7eeba09a..5e9beb72

### 배포 정보
- 배포일: 2026-09-26 (staging 병합·push). 프로덕션은 `/jam-ship`으로 별도 진행
- 커밋: 구현 434c69ae·aa689d08·81638415·e5695c4f·03f399da·4cf023ac·9cc1bceb·ff246dec·5e9beb72, 병합 31c3608c (리뷰 브랜치 `claude/jamwork-20260926_1513-test-reinforce-bundle`)

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 아현·민지 (묶음 3건, 게이트 PASS) | 219,985 | 81,133 / 16,199 | 16.9분 | 92 |
| 합계 | 2 | 219,985 | 81,133 / 16,199 | 16.9분 | 92 |

### 주요 의사결정 / 핵심 메모
- **「호출부를 지우면 실패한다」를 실제로 확인했다.** 아현은 `badges/[id]`·`missions/[id]`의 `imageUrlTypeError` 호출부를 지우는 변조로 각각 4건 실패를 확인하고 원복했다. 민지도 별도 워크트리에서 같은 변조를 다시 해 각 4건 실패를 재현했다. 본인 삭제 분기와 list-bulk 원문 노출은 아현이 같은 방식으로 확인했고, 민지는 테스트 코드를 읽어 단언을 대조했다.
- **결함을 고치지 않고 「현재 동작」으로 기록했다.** 쿠키 저장소가 `Expires`만으로는 쿠키를 지우지 않는 점은 테스트에 현재 동작으로 남겼다. 고칠 때 그 케이스의 기대값을 바꿔야 한다.
- **export의 「CSV 본문」은 빈 결과의 헤더 행까지만** 라우트별로 확인했다. 행 단위 본문은 `badges/export` 기존 테스트가 맡는다(티켓이 「가능한 범위」라고 했다).
- **계획 반환 면제.** 파일 약 13개·예상 425줄이라 티켓에 파일 단위 계획을 적고 첫 호출부터 면제했다. 실제 변경은 파일 11개(테스트만)였고 변경 줄 수는 아현이 568줄, 민지가 682줄로 쟀다(세는 범위 차이).
- **병합 방식.** J1 병합과 주간 리포트 커밋으로 staging이 앞서 조상 검사는 실패했으나, 브랜치에만 있는 커밋 9개가 모두 이 티켓 것이고 겹치는 파일이 없어 최신 `origin/staging` 위에서 `--no-ff`로 병합했다.
- **범위 밖 발견물**
  - `[주의]` `users/[id]/route.ts:27`, `drop-policy/exclusions/bulk/route.ts:47`, `missions/[id]` PATCH와 export 라우트 여럿이 DB 오류 원문을 500 응답에 싣는다 → 기존 티켓 20260925_0238에 위치를 덧붙였다.
  - `[주의]` `scripts/public-mission-check.mjs:69`가 배지 응답 인자가 null·undefined일 때 `TypeError`를 낸다.
  - `[참고]` `scripts/deploy-gate.mjs:653`의 `Expires` 미처리, `scripts/check-contract.mjs:537`의 `mkdtempSync`가 try 밖에 있음.
  - 뒤 두 묶음은 새 티켓 20260926_1535로 만들었다.
