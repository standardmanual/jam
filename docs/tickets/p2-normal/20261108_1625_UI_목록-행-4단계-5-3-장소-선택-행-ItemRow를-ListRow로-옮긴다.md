---
id: "20261108_1625"
category: UI
priority: P2
status: OPEN
created: 2026-11-08
closed: ""
parent: "20261106_1750"
specs:
  - jam-web/design-system/components/patterns/ListRow.jsx
---

# [UI] 목록 행 4단계 5-3: 장소 선택 행(PoiCarouselModal의 ItemRow)을 ListRow로 옮긴다

## 핵심 요약

- 요구사항: 드랍 선택 목록과 픽업 목록이 같이 쓰는 `ItemRow`(1단계 B8)를 `ListRow`로 옮긴다. 상위 완료 조건 2(행으로 판정한 줄이 새 컴포넌트로 옮겨져 있다)를 막는 마지막 대상 행 중 하나다.
- 구현 계획: 채원 사전 판정(개수 표시·면 톤·`disabled`·펄스 확정) → 아현 구현 → 민지 게이트 → 채원 사후 리뷰.
- 관련 파일: `jam-web/src/components/PoiCarouselModal.tsx`(`ItemRow` 1100줄~1170줄, 호출부 987줄·1014줄, `ItemRowProps` 1060~1090줄), `jam-web/src/components/PoiCarouselModal.test.tsx`(펄스 클래스 59·64·95·100줄, 드랍 버튼 `disabled` 211줄), `jam-web/src/components/ui/ListRow.tsx`(읽기만).
- 담당 에이전트: 채원(사전 판정·사후 리뷰), 아현(구현), 민지(게이트).

## 배경 / 문제 정의

`ItemRow`는 `button` 하나에 lead 44 `rounded-2xl` 타일, 우상단 개수 원, 이름 한 줄, 등급 칩(+만료 칩), 쉐브론 20을 직접 마크업한다. 면은 `bg-background-secondary rounded-2xl`, 안쪽은 `px-4 py-2`다. 같은 컴포넌트를 드랍 선택 목록(987줄)과 픽업 목록(1014줄)이 쓰므로 바꿀 곳은 한 컴포넌트다. 조사 결과는 상위 티켓 «5-3배치 조사 결과»에 있다.

## 사용자 결정

- lead는 모든 행에서 48px로 고정한다(2단계 결정 4). 이 행도 예외 없이 따른다.
- `ListRow`를 쓰는 곳은 1~5배치 규칙을 따른다: named import(`{ ListRow, ListRowChip, ListRowEm }`), 빈 슬롯은 `undefined`, lead 안 이미지는 `alt=""`(이름은 `title`이 담는다), 클릭 영역 안은 phrasing 요소만.
- 새 토큰·MODULAR 변경은 하지 않는다. `ListRow` 사본·원본이 모자라면 고치지 말고 보고한다(원본 변경은 승인 항목).
- 사용자 노출 문구는 바꾸지 않는다. 기존 `d.*` 사전 키를 그대로 쓴다.
- 실렌더는 메인 트리 개발 서버에서 320px로 확인한다. 격리 워크트리에서는 `next dev`가 뜨지 않는다.

## 범위

1. `ItemRow`를 `ListRow`로 바꾼다. props 시그니처(`name`·`imageUrl`·`rarity`·`onClick`·`disabled`·`count`·`countAriaText`·`expiresAt`·`locked`·`pulse`)는 호출부 두 곳이 그대로 쓰도록 유지한다.
2. 잠긴 개체 행(`locked`)은 `LockedTile`을 `size={48}`로 쓴다(호출부 값만 바꾼다).
3. 시험: `PoiCarouselModal.test.tsx`의 펄스·`disabled` 단정이 통과해야 한다. 마크업이 바뀌어 깨지는 단정이 있으면 의도를 지키며 고친다.
4. 문서: 드랍·픽업 목록 PRD 절(`docs/service/prd/`에서 `PoiCarouselModal|드랍 선택|픽업 목록`으로 탐색, 행 모양 서술이 있으면 갱신), 상위 티켓 5배치 표.

범위 밖: 값 행(5-4·5-5), 온보딩 체크 목록(별도 판정), 캐러셀·헤더 등 목록 밖 UI.

## 매핑표 (채원이 사전 판정에서 확정·교정한다)

| 현재 | 대응(안) |
|---|---|
| lead 44 `rounded-2xl` 타일, `LockedTile size={44}` | lead 48, `LockedTile size={48}` |
| 개수 표시: 흰 면 + 테두리 20px 원, 숫자만, 우상단. 스크린리더용 `sr-only` 문구(`countAriaText`)가 lead 래퍼 안에 있다 | `leadBadge`(검정 알약, 우하단). 스크린리더 문구가 그대로 읽혀야 한다 |
| 이름 `text-base`(보통), 한 줄 말줄임 | `title` + `titleVariant="regular"` |
| 등급 칩(`RarityBadge`) + 만료 칩(직접 12px, 임박일 때만) | `eyebrow`에 칩 줄: `RarityBadge` 그대로 + 만료 칩은 `ListRowChip` |
| 쉐브론 20 | `chevron` |
| 면 `bg-background-secondary rounded-2xl`, 안쪽 `px-4 py-2` | `tone`(판정) |
| `disabled`(픽업 목록에서만 `!isActive`일 때): `button disabled`, 커서만 바뀐다 | `ListRow disabled`: 행 전체 불투명도(`--opacity-disabled`)와 `pointer-events: none` |
| 퀘스트 펄스: 버튼 className에 `.jam-quest-pulse` 병합 | `ListRow className`은 행 바깥 면으로 간다 |

## 판정이 필요한 점 (채원 사전 판정 입력)

1. **개수 표시 모양**: 흰 원·우상단에서 검정 알약·우하단으로 바뀐다. 1~3배치의 `leadBadge` 규칙(«×N» 등 접두어)을 따를지, 숫자만 둘지 판정한다. 모양·위치가 눈에 띄게 바뀌므로 승인 항목이 될 수 있다.
2. **면 톤**: `bg-background-secondary` 면에 대응하는 `ListRow` 톤과, 목록 `gap-2`·바텀시트 안 최대 높이 스크롤(`max-h-[50vh]`)에서의 모양을 판정한다.
3. **`disabled` 시각**: 지금은 눌림만 막히고 모양은 그대로다. `ListRow disabled`는 흐려진다. 픽업이 막힌 상태(`!isActive`)를 흐려 보이게 두어도 되는지 판정한다.
4. **펄스 반경**: `.jam-quest-pulse`가 `ListRow` 면의 모서리 반경과 맞는지 확인한다(원래는 `rounded-2xl` 버튼에 붙었다).
5. **쉐브론 크기**: 20에서 `ListRow` 쉐브론 크기로 바뀌는 차이를 확인한다.

## 구현 계획

파일 단위 계획(계획 반환 면제 사유: 변경 파일이 2개이고 위치가 확정돼 있다).

1. `PoiCarouselModal.tsx` — `ItemRow`(1100~1170줄)의 본문을 `ListRow`로 바꾸고, 안 쓰게 되는 import(`ChevronRightIcon`, `MedalIcon` 폴백 등)는 lint로 확인한다.
2. `PoiCarouselModal.test.tsx` — 깨지는 단정을 의도를 지키며 고친다.
3. 문서 두 곳.

## 완료 조건

### 구현 범위 (게이트 판정 대상)

- `ItemRow`가 `ListRow`이고 드랍·픽업 두 목록이 같은 모양이다. 개수·만료·잠김·`disabled`·펄스가 모두 동작한다.
- 스크린리더가 개수 안내(`countAriaText`)와 이름·등급·만료를 읽는다.
- 호출부 두 곳이 바뀌지 않거나 최소로만 바뀐다.
- 변경한 파일이 `scripts/verify.sh`와 `serviceLiteralColors` 시험을 통과한다.

### 후속 범위 (담당: 카리나, 시점: 머지 뒤)

- 드랍·픽업 데이터가 있는 상태(또는 시험 값)로 개발 서버에서 320px 실렌더를 확인한다. 데이터가 없으면 확인하지 못했다고 기록한다.
- 판정 1~5 결과를 상위 티켓에 기록한다.

---
## 완료 기록 *(작업 후 작성)*
