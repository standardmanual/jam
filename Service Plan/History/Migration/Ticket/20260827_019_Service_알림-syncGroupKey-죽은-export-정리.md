---
id: 20260827_019
category: Service
status: OPEN
created: 2026-08-27
closed:
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

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]
