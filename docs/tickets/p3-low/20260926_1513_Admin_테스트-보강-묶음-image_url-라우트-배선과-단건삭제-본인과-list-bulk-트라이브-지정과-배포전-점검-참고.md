---
id: "20260926_1513"
category: Admin
priority: P3
status: OPEN
created: 2026-09-26
closed:
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
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
