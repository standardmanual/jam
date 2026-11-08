---
id: "20261108_1704"
category: UI
priority: P3
status: OPEN
created: 2026-11-08
closed: ""
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
## 완료 기록 *(작업 후 작성)*
