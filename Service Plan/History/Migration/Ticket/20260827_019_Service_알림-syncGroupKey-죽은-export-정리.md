---
id: 20260827_019
category: Service
status: CLOSED
created: 2026-08-27
closed: 2026-08-27
---

# [Service] 알림 `syncGroupKey()` 죽은 export 정리 + 테스트 픽스처 현행화

## 배경 / 문제 정의

티켓 20260827_016(알림 레거시 6종·`mutual_follow` 죽은 렌더 경로 정리)를 진행하며 발견한
**범위 밖 발견물**이다. 016과 정확히 같은 성격 — 티켓 20260827_014(알림 소식 전면 개편)가
남긴 도달 불가능 코드다.

`jam-web/src/lib/notifications/groupKey.ts:30`의 `syncGroupKey()`는 원래 소식 1(활동배지)·
3(아이템배지)·4(POI배지)를 **Strava 활동 1건 단위**(`{type}:sync:{strava_activity_id}`)로
묶기 위한 빌더였다. 014에서 이 세 종류가 활동 결산(`activity_recap`) 1종으로 재편되면서
묶음 축이 **KST 하루 단위**(`dailyGroupKey`)로 바뀌었고, `sync` 축을 쓰는 소식이 26종 중
하나도 남지 않았다.

### 실측 (2026-08-27, `origin/staging` bd13569c 기준)

```
$ grep -rn "syncGroupKey" jam-web/src/ | grep -v __tests__
jam-web/src/lib/notifications/groupKey.ts:30:export function syncGroupKey(...)
```

정의부 1줄뿐 — **프로덕션 호출부 0건**이다. 나머지 참조는 전부 테스트다:

| 위치 | 내용 |
|---|---|
| `__tests__/kst-group-key.test.ts:13` | import |
| `__tests__/kst-group-key.test.ts:87~89` | 키 충돌 검증 (3종 호출) |
| `__tests__/kst-group-key.test.ts:94~95` | 키 형식 검증 |

`__tests__/create-notification.test.ts:354`의 `'badge_earned:sync:42'`와
`supabase/tests/096_notifications_merge.test.sql:34`의 `'__test__:badge_earned:sync:1'`은
**함수를 호출하지 않는 단순 문자열 픽스처**다(merge RPC 동작 검증용 임의 키). 이번 범위 밖.

### 존치/제거 판단 — **제거**

| 존치 근거 후보 | 검토 결과 |
|---|---|
| 향후 활동 단위 묶음이 다시 필요할 수 있다 | ❌ 014가 하루 축으로 확정했고 그 근거가 `DATA_MODEL.md:360`에 기록돼 있다 — 활동별 키는 F2(활동 2건 이상 접기)를 위한 fold가 따로 필요한데 결산은 인라인 생성이라 배치의 `foldTargets`를 쓸 수 없다. 되돌릴 계획이 없다 |
| 20260826_001(POI 배지 재방문)이 이 키를 전제로 설계됐다 | ❌ 해당 티켓은 CLOSED이고, `poi_badge_earned` 자체가 014에서 결산으로 흡수됐다. 문서상 과거 의사결정 기록일 뿐 현행 코드 경로가 아니다 |
| 공개 API라 외부 사용처가 있을 수 있다 | ❌ `index.ts:33`의 `export * from './groupKey'`로 재노출되지만 이 저장소 내부 전용 라이브러리다 |

남겨 두면 016과 같은 문제가 생긴다 — 묶음 키 설계를 읽는 사람이 **현행에 없는 `sync` 축을
현행으로 오인**한다.

## 상세 요구사항

### 서비스/코드베이스 관점

**A. 제거 대상**

1. `jam-web/src/lib/notifications/groupKey.ts` — `syncGroupKey()` 함수 + 그 JSDoc
2. `jam-web/src/lib/notifications/__tests__/kst-group-key.test.ts`
   - `syncGroupKey` import 제거
   - `'syncGroupKey는 {type}:sync:{activityId}'` 케이스 제거
   - 키 충돌 검증 케이스(87~89행) **정리** — 아래 B 참조

**B. 키 충돌 검증 케이스 처리 — 삭제가 아니라 현행 키로 치환한다**

이 케이스가 지키는 계약은 「UNIQUE 인덱스가 `(user_id, group_key)`뿐이라 type이 키에
들어있지 않으면 서로 다른 종류의 소식이 같은 행으로 병합된다」이며, `groupKey.ts` 상단
주석 전체가 이 계약의 근거다. **계약은 여전히 유효하므로 검증을 통째로 없애면 안 된다.**

현재 픽스처는 `syncGroupKey('activity_recap'|'following_rare_badge'|'inventory_full', activityId)`
인데, 뒤 두 종류는 애초에 Strava 활동 단위로 묶이는 소식이 아니라(각각 `{badgeId}:{actorId}`,
`{today}` 축) 픽스처로서 의미가 없다. **실제 호출부가 쓰는 빌더·인자 조합**으로 바꿔
같은 계약을 검증한다. 예: 같은 KST 날짜에 대한 `dailyGroupKey('activity_recap', d)` /
`dailyGroupKey('followed', d)` /`dailyGroupKey('strava_disconnected', d)`가 서로 다른 키인지.

**C. `groupKey.ts` 상단 주석**

「왜 모든 키에 type을 접두로 붙이는가」 블록은 `sync:{strava_activity_id}` 충돌 시나리오를
근거로 든다. 규칙 자체는 현행이므로 블록을 지우지 말고, 그 시나리오가 **역사적 사례**임이
드러나도록 최소 손질한다(예: "구 소식 1·3·4가 …를 공유했다"). 016이 남긴
`DATA_MODEL.md:360`의 표기와 어긋나지 않게 쓴다.

**D. 하지 말 것**

- `scopedGroupKey`·`dailyGroupKey`·`sixHourGroupKey`·`groupFingerprint`·`groupedTargetsKey`는
  전부 실사용 중이다 — 건드리지 않는다
- `create-notification.test.ts`·`096_notifications_merge.test.sql`의 문자열 픽스처는 그대로 둔다
- DB·마이그레이션 변경 없음. 기존 행의 `group_key` 값에 손대지 않는다
  (016 전제조건인 알림 전량 삭제와 무관하게 안전한 순수 코드 정리다)

### UI/UX 관점 (해당 시)
- 없음. 사용자에게 보이는 동작 변화 0건 — 도달 불가능 코드 제거다.

### 컨텐츠 관점 (해당 시)
- 없음.

## 구현 계획

1. `groupKey.ts`에서 `syncGroupKey()` 삭제, 상단 주석 C대로 손질
2. `kst-group-key.test.ts`에서 import·형식 검증 케이스 삭제, 충돌 검증 케이스를 B대로 치환
3. `npx tsc --noEmit`으로 잔존 참조 없음 확인
4. `npx vitest run src/lib/notifications`로 알림 테스트 전체 통과 확인
5. `grep -rn "syncGroupKey" jam-web/src/`가 0건인지 최종 확인

### 영향 범위

```
jam-web/src/lib/notifications/groupKey.ts
jam-web/src/lib/notifications/__tests__/kst-group-key.test.ts
```

문서 갱신은 불필요할 가능성이 높다 — `DATA_MODEL.md:360`이 016에서 이미
「구 1·3·4가 쓰던 `{type}:sync:{strava_activity_id}`를 대체한다」로 정리됐다. 구현 후
재확인해 어긋나면 그때 갱신한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

- **A. `syncGroupKey()` 제거** — `groupKey.ts`에서 함수 + JSDoc 삭제. `index.ts:33`의
  `export * from './groupKey'` 재노출도 자동으로 사라진다(개별 export 목록이 아니라 와일드카드라
  별도 수정 불필요). 프로덕션 호출부가 0건이었으므로 동작 변화 없음.
- **B. 키 충돌 검증 케이스 치환** — 삭제하지 않고 **실제 호출부가 쓰는 조합**으로 바꿨다.
  같은 KST 하루에 대한 `dailyGroupKey('activity_recap'|'followed'|'strava_disconnected', at)`
  세 키가 서로 다른지 검증한다(각각 `recap.ts:70`·`follows/route.ts:63`·`strava/sync.ts:643`이
  실제로 쓰는 조합). 「UNIQUE 인덱스가 `(user_id, group_key)`뿐이라 type 접두가 없으면 서로 다른
  종류가 한 행으로 병합된다」는 계약은 그대로 유지된다.
  `'syncGroupKey는 {type}:sync:{activityId}'` 형식 검증 케이스는 대상 함수가 사라져 삭제.
- **C. 상단 주석 손질** — 「왜 모든 키에 type을 접두로 붙이는가」 블록은 유지하되, 규칙 진술
  (type 없이 scope만 쓰면 병합된다)을 앞으로 빼고 `sync:{strava_activity_id}` 충돌은 **과거 사례**로
  분리했다. 014에서 세 종류가 `activity_recap` 1종·`dailyGroupKey` 축으로 재편돼 현행에 `sync` 축이
  없다는 사실을 명시 — `DATA_MODEL.md:360`(016이 정리한 표기)과 동일한 서술이다.
  말미의 「시간창의 의미(하루/6시간/동기화 1회)」에서 '동기화 1회'도 제거했다.
- **D. 하지 말 것 준수** — `scopedGroupKey`·`dailyGroupKey`·`sixHourGroupKey`·`groupFingerprint`·
  `groupedTargetsKey` 무변경. `create-notification.test.ts:354`·`096_notifications_merge.test.sql:34`의
  문자열 픽스처 무변경. DB·마이그레이션 변경 없음.

- **E. 개선 리뷰 반영 (머지 후 보강, 커밋 별도)** — 스카우트가 짚은 세 가지를 이 티켓
  안에서 처리했다.
  1. `groupKey.ts:18`의 「`points:…`·`follow:…`·`slottable:…`」가 **stale이었다.** 현행
     §4-2 표의 키는 `followed:`·`collection_completable:`·`drop_picked_up:`·
     `mission_milestone:`·`strava_disconnected:`로, `points:`는 표에 아예 없고 나머지 둘도
     접두가 다르다. C항이 손질한 문단 **바로 아래 줄**이라 함께 정리했다.
  2. 앵커 표기를 `§4` → `§4-2`로 통일. 실제 제목이 `## 4-2. group_key 설계`이고 같은
     디렉터리의 `index.ts:104`·`types.ts:106`·`batch/shared.ts:3`·`batch/collections.ts:4`가
     모두 `§4-1`/`§4-2`를 쓴다. 아울러 C항 서술이 「현행 표에는 `sync` 행이 없다」를
     명시하도록 보강 — 표를 열어본 사람이 근거를 못 찾는 문제를 막는다.
  3. 충돌 검증 케이스에 `expect(keys.every((k) => k.endsWith(':2026-08-25'))).toBe(true)`
     추가. 기존 `new Set(keys).size === 3`만으로는 **scope가 갈라져도 통과**해
     「같은 시간창인데 type 덕분에 안 부딪힌다」는 계약 검증이 트리비얼해진다.
  4. scope 서술을 「시간창(하루/6시간)이거나, 014에서 추가된 대상 집합의 지문
     (`groupedTargetsKey`)」으로 확장 — R11 축이 생겨 시간창만으로는 설명되지 않는다.

### 문서 정합성 — 이 티켓에서 닫은 것 / 뺀 것

`DATA_MODEL.md:360`은 016에서 이미 「구 1·3·4가 쓰던 `{type}:sync:{strava_activity_id}`를
대체한다」로 정리돼 있어 코드 주석과 어긋나지 않음을 대조 확인했다.

반면 **아래 3건은 014/016이 남긴 문서 잔여물로 확인됐고, 이 티켓 범위를 넘어 별도 처리로
분리했다** (코드 정리 티켓에 PRD 본문 수정을 끼워 넣지 않는다):

| 위치 | 현재 표기 | 문제 |
|---|---|---|
| `PRD.md:57,59` | 「동기화 1회로 발급된 배지 3개 → 1건으로 묶음」·「"동기화 1회"가 묶음 단위」 | 014 이후 축은 KST 하루 — **현행 스펙과 정면 충돌하는 유일한 문서** |
| `DATA_MODEL.md:355` | 「소식 1·3·4처럼 같은 동기화를 scope로 쓰는」(현재형) | 360행 각주(과거형)와 시제가 엇갈림 |
| `RECAP_CASEBOOK.md:35,504` | 「PRD §3과 DATA_MODEL §4-2는 계속 "동기화 1회"라고 쓴다」 | 이제 절반만 유효(DATA_MODEL은 016에서 정정, PRD만 잔존) |

`RECAP_CASEBOOK.md:31`의 `item_badge_earned:sync:…`는 014 이전 상황을 설명하는 케이스북
서술이라 그대로 둔다(016에서 시점 표기가 이미 정리됨).

### 변경된 파일
```
jam-web/src/lib/notifications/groupKey.ts
jam-web/src/lib/notifications/__tests__/kst-group-key.test.ts
```
커밋: `c927cb67`(A~D) → `f5002ce2`(병합) → E항 보강 커밋

### 테스트 결과
- [x] `npx tsc --noEmit` — 에러 0건 (잔존 참조 없음)
- [x] `npx vitest run src/lib/notifications` — 7 파일 / 163 케이스 전부 통과
- [x] `npx eslint` (변경 2파일) — 경고·에러 0건
- [x] `grep -rn "syncGroupKey" jam-web/src/` — 0건
      (`sync:` 문자열은 `groupKey.ts` 주석의 역사적 사례 서술만 남음 — 의도된 존치)
- [x] E항 보강 후 재검증 — `tsc --noEmit` 0건, `vitest run src/lib/notifications` 7 파일 /
      163 케이스 전부 통과 (케이스 추가가 아니라 기존 케이스에 단언 1줄 추가라 수 동일)
- [x] 게이트 리뷰(체크포인트) **PASS** — A~D항 대조, `grep -rn "syncGroupKey" jam-web/` 0건,
      `scopedGroupKey(..., 'sync', ...)` 우회 생성 0건, 실사용 빌더 5종 무변경 확인
- [x] 머지 전 오염 검사 — `git merge-base --is-ancestor origin/staging <review>` 종료코드 0
