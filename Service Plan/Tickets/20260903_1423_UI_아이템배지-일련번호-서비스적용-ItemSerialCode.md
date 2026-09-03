---
id: 20260903_1423
category: UI
status: OPEN
created: 2026-09-03
---

# [UI] 아이템 배지 일련번호 표시를 ItemSerialCode로 교체 — 사용자 화면 적용

## 배경 / 문제 정의
[티켓 20260903_1356](20260903_1356_UI_아이템배지-일련번호-ItemSerialCode-MODULAR-신규등록.md)에서
MODULAR에 등록하고 [티켓 20260903_1414](20260903_1414_UI_ItemSerialCode-배지상세페이지-샘플-시각튜닝.md)에서
샘플 페이지로 시각 검증까지 마친 `ItemSerialCode` 컴포넌트를, 실제 서비스의 일련번호 표시
영역에 적용한다. 어드민 화면은 정책상 MODULAR 적용 대상이 아니므로 제외한다.

일련번호가 실제로 표시되는 사용자 화면은 사전 조사(현재 대화 세션) 결과 2곳뿐이다:
1. `badges/[id]` 배지 상세 페이지 — `ItemEarnHistory.tsx`
2. `drops` 지도 드랍 바텀시트 — `BadgeDetailSheet.tsx`

## 상세 요구사항

### UI/UX 관점
- 두 화면 모두 기존 "일련번호: XXXXXXXXXX" 텍스트 표시를 제거하고 `ItemSerialCode`로 교체
- 타이틀 텍스트("일련번호" 라벨) 없이 컴포넌트만 배치 — 샘플 페이지와 동일한 원칙
- `height`는 화면별 맥락에 맞게 판단 (배지 상세 페이지는 샘플에서 검증된 50, BadgeDetailSheet는
  더 좁은 바텀시트 공간에 맞춰 별도 판단 필요)

### 서비스/코드베이스 관점

**1. `src/app/(main)/badges/[id]/page.tsx` + `ItemEarnHistory.tsx`**
- `page.tsx`의 item 배지 분기(`badgeRow.type === 'item'`): `BadgeHeroSection`(하단에 배지
  description 렌더)과 `ItemEarnHistory`를 렌더하는 info-section 사이에 `ItemSerialCode` 삽입
- 유저가 같은 배지를 여러 개(서로 다른 serial) 보유할 수 있다(`allItemInventory.length > 1`) —
  대표로 어떤 개체의 serial을 크게 보여줄지(최신 획득분 권장) 정하고, 나머지 개체의 획득이력
  표시 방식도 함께 판단할 것
- `ItemEarnHistory.tsx`의 기존 일련번호 표시 2곳(최신 카드의 라벨+값 행, 이후 목록 행의
  font-mono 텍스트) 제거 — 획득일·만료일만 남긴다

**2. `src/app/(main)/drops/BadgeDetailSheet.tsx`**
- `drop.serial` 조건부 표시 부분(라벨+값)을 `ItemSerialCode`로 교체
- 바텀시트 공간에 맞는 height 조정 (샘플의 50이 그대로 맞지 않을 수 있음)

### 제외 대상 (건드리지 않음)
- 어드민: `admin/item-badges/[badgeId]/[itemId]/page.tsx`, `admin/item-badges/[badgeId]/page.tsx`
  (`SerialListTable`), `admin/item-badges/orphaned/page.tsx`(`OrphanedItemsTable`)
- `collections/[id]/SlotGrid.tsx`, `combine/CombineClient.tsx`, `badges/page.tsx` — serial 필드는
  쿼리에 포함되지만 현재 화면에 표시되지 않는 곳들이라 이번 범위 아님

## UI 탐색·재사용 판정 (오케스트레이터, 위임하지 않음)
- `_ds_manifest.json`·`readme.md` 확인 결과 `ItemSerialCode`는 이미 `components/patterns/`에
  등록돼 있다 (티켓 20260903_1356) — **신규 컴포넌트 불필요, 기존 컴포넌트를 그대로 재사용**한다
- 두 대상 화면 모두 서비스 전용 코드(`ItemEarnHistory.tsx`, `BadgeDetailSheet.tsx`, `page.tsx`)를
  수정해 `@ds/components/patterns/ItemSerialCode`를 import하는 "연결" 작업이며, MODULAR 쪽
  파일(`design-system/**`)은 이번 티켓에서 변경하지 않는다

## 구현 계획
1. `badges/[id]/page.tsx`의 item 분기에서 대표 아이템(최신 획득분 권장)의 serial 문자열
   조합(`${serial_prefix}${String(serial_number).padStart(6,'0')}`)해 `ItemSerialCode`에 전달
2. `ItemEarnHistory.tsx`에서 일련번호 표시 2곳 제거
3. `BadgeDetailSheet.tsx`에서 동일 교체, 시트 폭에 맞는 height 결정
4. 로컬 dev 서버에서 실제 화면 확인 (badges/[id], drops 바텀시트 둘 다) — 로그인된 테스트
   계정으로 실제 보유 아이템 배지가 있는 상태에서 확인
5. `npm run lint`, `tsc --noEmit` 통과 확인

---
## 완료 기록

### 구현 내용 요약
- **`badges/[id]/page.tsx`(item 분기)**: `activeItem`(보유 개체 중 `dropped_at`이 없는 첫 항목 —
  기존에도 계산돼 있던 변수, `allItemInventory`가 `obtained_at` 내림차순 정렬이라 "현재 보유 중인
  것 중 최신 획득분"과 동치)의 serial을 조합해 `BadgeHeroSection`과 info-section 사이에
  `ItemSerialCode(height=50)`을 삽입. 본인 뷰(`isOwnBadge`) + 보유 개체가 있을 때만 노출(`showSerial`).
  `ItemSerialCode`가 이미 `pb-[32px]` 여백을 만들므로, 노출 중일 때는 info-section의
  `pt-[32px]`를 생략해 dev-sample과 동일한 32px 간격을 유지(생략하지 않으면 64px로 벌어짐).
- **`ItemEarnHistory.tsx`**: `ItemCardContent`(최신 카드 + 상세 바텀시트 공용)에서 일련번호 행
  제거 — 획득일·만료일만 남음. "2번째부터" `ListRowCard` 행은 기존 `entry.serial`(font-mono) 대신
  `entry.obtained_at`을 `LocalDate`로 포맷해 표시 — 같은 디렉터리의 자매 컴포넌트
  `PoiEarnHistory.tsx`가 이미 쓰고 있던 동일 패턴(2번째 행부터는 날짜를 대표 텍스트로 노출)을
  그대로 재사용해 새로운 규칙을 만들지 않음.
- **`BadgeDetailSheet.tsx`**: `drop.serial` 라벨+값 행을 `ItemSerialCode`로 교체, 타이틀 텍스트
  없이 컴포넌트만 중앙 배치(`justify-center`). 기존 `border-t` 구분선은 유지. 시트 안 `Card`가
  좁고(다른 텍스트가 전부 caption/body-sm 스케일) 컴포넌트 스토리북 `argTypes.height`가 정의한
  지원 최소값이 40이라, 배지 상세 페이지(50)보다 작은 `height=40`을 사용.

### 대표 개체 선정 근거 (allItemInventory.length > 1 케이스)
- 티켓 문구("유저가 같은 배지를 여러 개 **보유**할 수 있다")가 "보유 중"을 명시하므로, 드랍되어
  더 이상 보유하지 않는 개체까지 포함한 단순 최신순(`allItemInventory[0]`)이 아니라 **현재
  보유 중인 것 중 최신 획득분**(`activeItem`)을 대표로 채택. `showSerial`이 참이면 항상
  `hasEarned`도 참이라(동일 판정식 재사용), "미보유인데 대표 serial이 보임" 같은 모순은 없음.
- `ItemEarnHistory`의 "최신 이력" 카드는 기존 로직(`allItemInventory[0]`, 드랍 여부 무관) 그대로
  유지 — 이 티켓은 "일련번호 표시를 컴포넌트로 교체"가 범위이며 최신 이력 선정 로직 자체를
  바꾸는 것은 범위 밖이라 손대지 않음. 두 값이 다를 수 있는 경우(예: 최근 획득분을 바로 드랍한
  뒤 이전 개체만 보유 중)는 실사용 빈도가 낮고, 있더라도 "대표 스탬프는 보유 중인 것, 아래
  이력은 전체 이력"으로 각자 의미가 분명해 혼동 소지가 적다고 판단.

### 변경된 파일
```
jam-web/src/app/(main)/badges/[id]/page.tsx          (item 분기 — ItemSerialCode 삽입, 대표 serial 계산)
jam-web/src/app/(main)/badges/[id]/ItemEarnHistory.tsx (일련번호 표시 2곳 제거 → 획득일/만료일, 목록행은 획득일로 대체)
jam-web/src/app/(main)/drops/BadgeDetailSheet.tsx      (serial 라벨+값 행 → ItemSerialCode(height=40))
```

### 테스트 결과
- [x] `tsc --noEmit` — 오류 0
- [x] `npm run lint`(전체) — 0 errors, 13 warnings(모두 `design-system/**`의 기존 드리프트,
  이번 변경 파일과 무관 — 스토리북 네이밍 경고, `<img>` 권장 경고 등)
- [x] 로컬 dev 서버(`:3000`)에서 Playwright로 `/api/dev-login` 인증 후 실제 화면 확인:
  - dev-tester 계정이 실제 보유 중인 아이템 배지(`/badges/052a5fa1-...`, "마지막 남은 어묵 국물")
    상세 페이지 — `ItemSerialCode` 정상 렌더, 획득 이력 카드에 일련번호 행 없음, 간격 정상(32px)
  - `BadgeDetailSheet`는 dev-tester 실 데이터에 픽업 가능한 실시간 드랍이 없어(GPS 기반) 실제
    컴포넌트를 임시 검증 페이지(커밋하지 않음, 확인 후 삭제)로 마운트해 확인 — height=40이 시트
    폭에 자연스럽게 맞음
  - 동일 배지를 2개 이상 보유하는 케이스도 dev-tester 실 데이터에 없어(9개 아이템 배지 모두
    서로 다른 badge_id) `ItemEarnHistory`를 목 데이터(3건)로 임시 검증 페이지에 마운트해
    확인 — "이후 목록 행"이 획득일로 정상 표시되고, 클릭 시 열리는 상세 바텀시트도 획득일/
    만료일만 표시됨을 확인. 임시 페이지는 확인 후 삭제, 커밋에 포함되지 않음
  - 콘솔/페이지 에러 0건

### UX Writing 검증
해당 없음 — 신규 사용자 노출 문구 없음(라벨 텍스트를 제거하는 방향의 변경이며, 표시되는
`d.inventory.obtainedAt`·`expiresAt`·`expiresNone`은 기존 문구를 그대로 재사용).

### 배포 정보
- 배포일: (미배포 — review 브랜치 push까지만, main 병합은 사용자 승인 후)
- 환경: 서비스(L1) 적용 완료. MODULAR(L2)는 이번 티켓에서 변경 없음(티켓 20260903_1356/1414에서
  이미 완료)
- 커밋: (아래 브랜치 push 커밋 참조)

### 잔여 이슈
- `d.inventory.serialNumber`(`'일련번호'` 라벨) i18n 키가 이번 변경으로 서비스 코드 전체에서
  더 이상 참조되지 않게 됨(어드민 3곳과 `collections/[id]/SlotGrid.tsx` 등은 애초에 이 키를
  안 쓰고 있었음). 티켓 범위가 "표시 교체"라 키 삭제는 별도 판단으로 남겨둠(사용하지 않아도
  당장 빌드·런타임에 영향 없음).
- `allItemInventory[0]`(이력 카드 "최신") vs `activeItem`(대표 serial)이 갈릴 수 있는 예외
  케이스(드랍 직후)는 위 "대표 개체 선정 근거"에 기록 — 실제 발생 시 혼동 여지가 있다고
  판단되면 후속 티켓에서 정책을 통일할 수 있음.
