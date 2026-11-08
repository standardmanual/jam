---
id: "20261108_1704"
category: UI
priority: P3
status: CLOSED
created: 2026-11-08
closed: 2026-11-09
parent: "20261106_1750"
specs: []
---

# [UI] 어느 화면도 쓰지 않는 InventoryItemHistorySheet를 삭제한다

## 핵심 요약

- 요구사항: `jam-web/src/app/(main)/inventory/[itemId]/InventoryItemHistorySheet.tsx`는 `src` 전체에서 import하는 곳이 없다. 파일을 지우고 참조(목록·주석)를 정리한다.
- 구현 계획: 삭제 전에 한 번 더 import 여부를 `grep`으로 확인한다. 삭제 뒤 `commonLiteralColors.test.ts` 목록의 한 줄(48줄 근처)과 `transitions-pages.css` 136줄 근처의 주석을 고친다. `LockedItemDetail.test.tsx` 325줄의 부정 시험(`InventoryItemHistorySheet|/history`가 소스에 없다는 단정)은 그대로 둘지 판단한다. `voc/page.tsx` 126줄과 `LockedItemDetail.tsx` 54줄의 주석은 «같은 패턴·같은 매핑» 설명이라 문구를 고칠지 판단한다.
- 관련 파일: 위 파일들과 `jam-web/src/app/api/inventory/items/[itemId]/history/route.ts`(+시험).
- 담당 에이전트: 카리나(경미 수정 판정) 또는 아현.

## 배경 / 문제 정의

목록 행 5-4 채원 사전 판정(2026-11-08)이 발견했고 카리나가 `grep`으로 확인했다: 정의 파일 자신을 빼면 이 이름이 나오는 곳은 주석 3곳, 리터럴 색 시험 목록, 부정 시험 한 건뿐이다. 사용자가 누를 수 없는 죽은 코드다. 이 파일은 2026-07-19 «아이템배지 상세 획득방법에 이력 바텀시트 추가»(`8df1c4f52`)로 생겼고 마지막 수정은 2026-10-21이다. 언제부터 쓰이지 않게 됐는지는 확인하지 못했다.

**함께 주인이 없어지는 것**: 이 시트가 부르는 `GET /api/inventory/items/[itemId]/history`(`src/app/api/inventory/items/[itemId]/history/route.ts`와 `__tests__/route.test.ts`)와 그 반환 타입 `HistoryEvent`를 쓰는 곳도 이 시트 하나뿐이다(`grep` 확인). 시트만 지우면 API가 남는다. API까지 지울지(외부 호출이나 어드민 사용 여부 확인 포함)를 이 티켓에서 판정한다. API는 코드 삭제와 별개로 DB·정책 영향이 없는지 본다.

## 시작 전 확인과 구현 계획 (카리나, 2026-11-08)

현재 `origin/staging`에서 참조를 전수 확인했다(읽기만).

- **시트**: `InventoryItemHistorySheet.tsx`를 import하는 곳이 없다. 남은 참조는 주석 3곳(`LockedItemDetail.tsx` 54줄, `voc/page.tsx` 126줄, `transitions-pages.css` 136줄), `commonLiteralColors.test.ts` 목록 48줄, 부정 시험 `LockedItemDetail.test.tsx` 325줄(`not.toMatch`라 삭제 뒤에도 통과), 감사 문서 `jam-web/docs/storybook/08-component-candidates.md`(과거 기록, 손대지 않음), 생성 보고서 `jam-web/scripts/jam2-token-migrate.report.json`(손대지 않음)뿐이다.
- **history API**: `GET /api/inventory/items/[itemId]/history`(`route.ts`와 `__tests__/route.test.ts`)와 반환 타입 `HistoryEvent`를 쓰는 곳은 이 시트 하나뿐이다. 이 API는 사용자 화면에서 누를 수 없는 시트를 위한 것이라 **함께 지운다**(사용자 승인: 정리 진행, 2026-11-08). 이 API에서만 쓰는 사전 문구 `d.inventory.historyItemNotFound`·`historyForbidden`(`ko.ts` 645~655줄)도 쓰는 곳이 없어진다. 시트가 쓰는 `d.inventory.obtainByDrop` 등 다른 `d.inventory.*` 키는 각각 `grep`으로 다른 사용처가 있는지 확인하고, 이 두 파일에서만 쓰던 키만 지운다.
- **문서**: `docs/service/prd/inventory/PRD.md` 259줄 «이력 API … 가림 대상 값이 구조상 없다(시험으로 고정)»는 API가 사라지면 서술할 대상이 없으므로 그 줄을 지운다(PRD 9절 «잠긴 개체 가림» 목록의 다른 줄은 그대로).
- DB는 바꾸지 않는다(이 API가 읽던 표·함수는 그대로 둔다).

### 파일 단위 계획

1. 삭제: `jam-web/src/app/(main)/inventory/[itemId]/InventoryItemHistorySheet.tsx`
2. 삭제: `jam-web/src/app/api/inventory/items/[itemId]/history/route.ts`, `…/history/__tests__/route.test.ts`
3. `jam-web/src/components/__tests__/commonLiteralColors.test.ts` 48줄 목록 항목 삭제
4. 주석 정리: `LockedItemDetail.tsx` 54줄(« …이력 시트(`InventoryItemHistorySheet`)와 같은 매핑이다» → 삭제된 시트를 가리키지 않게), `voc/page.tsx` 126줄, `transitions-pages.css` 136줄 부근
5. `jam-web/src/lib/i18n/ko.ts`: `historyItemNotFound`·`historyForbidden`과 이 삭제로 쓰는 곳이 없어지는 키만 삭제(키별 `grep` 근거를 완료 기록에 적는다)
6. `docs/service/prd/inventory/PRD.md` 259줄 삭제

## 완료 조건

- `InventoryItemHistorySheet.tsx`가 없고 `src` 어디에도 import·참조가 남지 않는다(문구만 설명하는 주석은 판단).
- `commonLiteralColors.test.ts`·`transitions-pages.css` 주석이 맞게 고쳐졌다.
- `history` API를 함께 지울지 판정해 기록하고, 지우면 경로·시험·참조(`HistoryEvent` 타입 import)까지 정리한다.
- `scripts/verify.sh`가 통과한다.

---
## 완료 기록

### 구현 내용 요약

- `InventoryItemHistorySheet.tsx`(143줄)와 `GET /api/inventory/items/[itemId]/history`(`route.ts` 168줄, `__tests__/route.test.ts` 176줄)를 삭제했다. DB는 바꾸지 않았다. 삭제 전에 `import`·`fetch` 참조가 두 파일 서로 외에 없음을 `grep`으로 다시 확인했다.
- 참조 정리: `commonLiteralColors.test.ts` 목록 한 줄, 주석 4곳(`LockedItemDetail.tsx` 54줄, `voc/page.tsx` 126줄, `transitions-pages.css` 136줄, 티켓에 없던 `WithdrawSheet.tsx` 91줄)을 삭제된 시트를 가리키지 않게 고쳤다. `docs/service/prd/inventory/PRD.md` 9절 259줄(이력 API 서술)을 지웠다. `LockedItemDetail.test.tsx` 325줄의 부정 시험(`not.toMatch`)은 삭제 뒤에도 통과해 그대로 뒀다.
- `ko.ts`의 `d.inventory` 사전 키 10개를 지웠다. 시트에서만 쓰던 8개(`historyTitle`, `historyError`, `historyEmpty`, `historyEmptyBody`, `historyUnknownUser`, `eventDropped`, `eventPickedUp`, `obtainMethod`)와 API에서만 쓰던 2개(`historyItemNotFound`, `historyForbidden`). 키마다 `src`·`e2e`·`docs/service`를 `grep`해 다른 사용처가 없음을 확인했다. `LockedItemDetail`이 쓰는 `obtainByDrop`·`obtainByDropEvent`·`obtainByPickup`·`obtainBySystem`은 남겼다. `d.points.historyTitle`은 별개 네임스페이스라 그대로다.

### 변경된 파일
```
삭제: jam-web/src/app/(main)/inventory/[itemId]/InventoryItemHistorySheet.tsx
삭제: jam-web/src/app/api/inventory/items/[itemId]/history/route.ts
삭제: jam-web/src/app/api/inventory/items/[itemId]/history/__tests__/route.test.ts
수정: jam-web/src/lib/i18n/ko.ts, LockedItemDetail.tsx, voc/page.tsx, WithdrawSheet.tsx,
      transitions-pages.css, __tests__/commonLiteralColors.test.ts, docs/service/prd/inventory/PRD.md
```
추가 4줄, 삭제 513줄.

### 게이트·확인

- 경로: `api` 유형(구현 → 게이트, 채원 호출 없음). 민지 게이트 **PASS**. CI `verify` 성공(`5f583fafc`, 병렬 세션 변경을 합친 `-r3`도 `8740ef75e` 성공).
- 카리나 재확인(머지 전, 브랜치와 병합 후 트리를 `git grep`으로 읽음): 삭제한 사전 키 9개는 남은 언급 0이고, `historyTitle`의 남은 1건은 `d.points.historyTitle`(`ko.ts` 1386줄)이다. 삭제 파일을 가리키는 `import`·`fetch`·`HistoryEvent` 참조는 `src`에 없고 남은 것은 위 부정 시험뿐이다. 합친 뒤에도 병렬 세션의 `ko.ts` 변경(등급 올리기 문구)과 충돌이 없었다.
- 머지: 병렬 세션의 push가 잦아 `-r2`(CI 성공 뒤 staging이 `ko.ts`를 건드리며 앞서 폐기), `-r3`(CI 성공 `8740ef75e`)로 옮긴 뒤, 마지막에 staging이 문서만 바뀐 것을 확인하고 메인 트리에서 직접 얹었다(CI는 push 뒤 staging에서 확인).

### 배포 정보
- 배포일: 2026-11-09
- 환경: staging(`stage.j-a-m.app`)
- 커밋: `eb34b55bf`(메인 트리 머지본, push 때 달라질 수 있다)

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1회차 (구현·게이트) | 2 | 100,920 | 9,926 / 5,327 | 21분 4초 | 55 |
| 합계 | 2 | 100,920 | 9,926 / 5,327 | 21분 4초 | 55 |

### 주요 의사결정 / 핵심 메모

- 처음 3.5 조사 때 `InventoryItemHistorySheet`를 «값 행 후보»로 잘못 세었다가 5-4 채원 사전 판정에서 죽은 코드임이 드러났고(`import`하는 곳이 없음), 그 삭제를 이 티켓이 맡았다. 삭제를 시작할 때는 시트만이 아니라 시트가 부르는 history API와 그 API 전용 사전 키, PRD 문장까지 얽혀 있음을 참조 전수 확인으로 먼저 찾았다.
- 삭제 커밋 메시지에 `테스트 삭제:` 줄이 필요하다(삭제한 `route.test.ts` 때문). 아현이 처음 push는 이 줄 없이 `pre-push` 훅에 막혀 메시지를 고쳐 다시 push했다.
- `jam-web/docs/storybook/08-component-candidates.md`(과거 감사 기록)와 `jam-web/scripts/jam2-token-migrate.report.json`(생성 보고서)에는 옛 시트 이름이 남아 있다. 과거 기록이라 손대지 않았다.

### 잔여 이슈

- 이 API를 **저장소 밖에서 호출하는 곳**(다른 클라이언트·스크립트)이 없는지는 저장소 안 `grep`으로만 확인했다. 필요하면 운영 로그에서 이 경로의 최근 호출을 확인한다.
- `LockedItemDetail.test.tsx` 325줄의 부정 시험은 지킬 대상이 없어졌지만 해가 없어 그대로 둔다.
