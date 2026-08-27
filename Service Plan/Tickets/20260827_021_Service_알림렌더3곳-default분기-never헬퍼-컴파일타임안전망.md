---
id: 20260827_021
category: Service
status: CLOSED
created: 2026-08-27
closed: 2026-08-27
---

# [Service] 알림 렌더 3곳 `default` 분기 — `never` 헬퍼로 컴파일 타임 안전망 추가

## 배경 / 문제 정의

티켓 20260827_016의 **잔여 이슈 3번**을 처리한다.

알림 소식 종류(`NotificationType`, 현재 20종)를 렌더하는 곳이 세 군데인데 전부
`switch` + `default` fallback 구조다:

| 파일 | 함수 | `default` 반환 |
|---|---|---|
| `src/lib/notifications/message.ts` | `buildNotificationMessage` | `{ template: n.unknown, vars: {} }` (「새로운 소식이 도착했어요」) |
| `src/lib/notifications/href.ts` | `notificationTarget` | `single(null)` (이동하지 않는 행) |
| `src/app/(main)/notifications/NotificationsClient.tsx` | `TypeIcon` | `<BellIcon />` |

**문제는 새 종류를 추가할 때다.** 세 곳 중 하나를 빠뜨려도 컴파일이 통과하고, 그 종류는
조용히 「새로운 소식이 도착했어요」 + 링크 없음 + 종 아이콘으로 렌더된다. 016에서는
"20종 전수가 세 곳에 명시 case를 가진다"를 **1회성 스크립트로 확인**했을 뿐, 다음에 종류가
추가될 때 그 대조가 반복된다는 보장이 없다.

### `default`를 지우면 안 되는 이유 (런타임 안전망은 유지한다)

1. **배포 시차** — 코드 배포와 DB 상태 사이 구간에 미지의 `type` 행이 잠깐 존재할 수 있다.
2. **ENUM 잔존 9값** — DB `notification_type` ENUM에는 코드가 쓰지 않는 9값이 남아 있다
   (Postgres가 ENUM 값 제거를 안전하게 지원하지 않아 016에서 존치 결정). 어떤 경로로든
   재유입되면 fallback이 받아야 한다. `database.generated.ts`는 29값을 그대로 나열하는데
   수기 `database.ts`는 20종이라 **두 파일이 이미 갈라져 있다**(016 잔여 이슈 4번).

즉 필요한 건 "`default` 제거"가 아니라 **"타입 누락만 컴파일 에러로 승격시키되 런타임
경로는 그대로 두는 것"** 이다.

### 착수 시점 사실 확인 (2026-08-27)

세 렌더러 모두 20종 전수에 명시 case가 있어, `default` 분기에서 `view.type`은 **이미
`never`로 좁혀진다.** 따라서 헬퍼 도입은 다른 코드 수정 없이 컴파일이 통과해야 한다.
**통과하지 않으면 그 자체가 "이미 누락된 종류가 있다"는 발견**이므로 구현을 멈추고 보고한다.

코드베이스에 기존 `assertNever` 계열 헬퍼는 없다(신규 작성).

## 상세 요구사항

### 서비스/코드베이스 관점

**A. 헬퍼 신설**

`src/lib/notifications/types.ts`에 exhaustiveness 헬퍼를 하나만 만들고 세 곳이 공유한다.
(세 곳에 각각 만들면 이 티켓이 막으려는 "세 곳이 갈리는" 문제를 헬퍼가 다시 재현한다.)

요구 동작:
- 인자 타입이 `never` — 남은 종류가 있으면 **호출 지점이 컴파일 에러**가 된다
- **던지지 않는다.** 반환하거나 void로 끝나고, 호출부는 기존 fallback 값을 그대로 반환한다
  (런타임 안전망 유지가 이 티켓의 전제다 — 던지면 미지 type 행 하나가 목록 전체를 깨뜨린다)
- `types.ts`는 서버·클라이언트 양쪽에서 import된다. `server-only` 등 런타임 종속을 넣지 않는다

**B. `console.warn` 로깅 (함께 검토 항목 — 채택)**

`default` 진입 시 미지 `type`을 한 번 남겨 ENUM 잔존값 재유입을 사후 포착한다.

- 형식은 기존 관례를 따른다: `src/lib/notifications/feed.ts:241`의
  `console.warn('[notifications] 빈 슬롯', { ... })`
- **반드시 중복 억제할 것.** 세 함수 모두 행마다·렌더마다 호출된다. 미지 type 행이 30개
  있는 목록을 스크롤하면 경고가 수백 건 쏟아진다. 프로세스/세션 단위로 `type`당 1회만
  남기도록 모듈 스코프 `Set`으로 막는다
- 로그에 유저 식별자나 payload 원문을 넣지 않는다 (type 값만)

**C. 절대 바꾸지 말 것**

| 대상 | 이유 |
|---|---|
| 세 `default`의 **반환값** | 「새로운 소식이 도착했어요」·`null` 착지·`BellIcon`은 현행 fallback 계약이다 |
| 20종 `case` 분기 내용 | 이 티켓은 순수하게 `default` 분기와 헬퍼만 다룬다 |
| `NotificationType` 유니온 | 종류를 늘리거나 줄이지 않는다 |
| `ko.ts`의 `unknown` 문구 | 그대로 쓴다 |

### UI/UX 관점

사용자 노출 변화 없음. 신규 문구 없음. `default`는 도달 불가 경로이고 반환값도 동일하다.

### 컨텐츠 관점

해당 없음.

## 구현 계획

1. `types.ts`에 헬퍼 + 중복 억제 `Set` 작성
2. `message.ts` → `href.ts` → `NotificationsClient.tsx` 순으로 `default` 분기에 헬퍼 호출 삽입
3. `npm run typecheck` — **여기서 에러가 나면 멈추고 보고** (누락 종류 발견)
4. 헬퍼가 실제로 작동하는지 역검증: `NotificationType`에 임시 종류를 하나 넣어
   세 곳 전부 컴파일 에러가 나는지 확인하고 **되돌린다** (커밋에 남기지 않는다)
5. `npm run lint`(신규 위반 없음 확인) · `npm test` 통과

> 전체 `npm run lint`는 이미 183건 레드다(016 잔여 이슈 — 전부 `design-system/`·
> `dotmatrix-hooks`의 기존 `set-state-in-effect` 부채). **이번 변경으로 건수가 늘지
> 않았는지**를 기준으로 판정한다.

## 완료 조건

- [ ] 헬퍼가 `types.ts`에 하나만 있고 세 곳이 공유한다
- [ ] 세 `default` 분기의 반환값이 이전과 동일하다
- [ ] 미지 type 1건에 `console.warn`이 **정확히 1회** 남는다 (같은 type 반복 시 억제)
- [ ] `NotificationType`에 종류를 추가하면 세 곳 전부 컴파일 에러가 난다 (역검증, 커밋 제외)
- [ ] `typecheck` · `test` 통과 / `lint` 신규 위반 0

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

`src/lib/notifications/types.ts`에 `unknownNotificationType(type: never): void` 헬퍼를
**하나만** 신설하고, 세 렌더러의 `default` 분기가 이를 공유하도록 했다.

- 인자 타입이 `never`라 `NotificationType`에 종류가 추가되면 **세 호출 지점이 전부
  컴파일 에러**가 된다. 세 곳 중 하나를 빠뜨린 채 배포되는 경로가 막힌다.
- **던지지 않는다.** 호출부는 헬퍼를 부른 뒤 기존 fallback 값을 그대로 반환한다
  (`n.unknown` / `single(null)` / `<BellIcon />`). 배포 시차·ENUM 잔존 9값 재유입에
  대비한 런타임 안전망이 그대로 살아 있다.
- `default` 진입 시 `console.warn('[notifications] 미지 소식 종류', { type })`을 남긴다.
  모듈 스코프 `Set`으로 **type당 1회**만 남겨 목록 스크롤 시 경고 폭주를 막는다.
  로그에는 `type`만 담고 유저 식별자·payload 원문은 넣지 않는다.

### 변경된 파일
```
jam-web/src/lib/notifications/types.ts               (헬퍼 + 중복 억제 Set 신설)
jam-web/src/lib/notifications/message.ts             (default에 헬퍼 호출 + import)
jam-web/src/lib/notifications/href.ts                (default에 헬퍼 호출 + import)
jam-web/src/app/(main)/notifications/NotificationsClient.tsx  (default에 헬퍼 호출 + import)
Service Plan/Specs/PRD/Notification/DATA_MODEL.md    (§2에 전수 처리 계약 명시)
Service Plan/Tickets/20260827_021_Service_알림렌더3곳-default분기-never헬퍼-컴파일타임안전망.md
```

### 테스트 결과
- [x] `npx tsc --noEmit` — 에러 0. 헬퍼 도입만으로 다른 코드 수정 없이 통과했다
      (= 현재 20종 전수가 세 곳에 명시 case를 갖고 있음이 타입 레벨로 재확인됨)
- [x] **역검증** — `NotificationType`에 임시 종류 `'__tmp_probe__'`를 넣자 정확히 세 곳만
      `error TS2345: Argument of type '"__tmp_probe__"' is not assignable to parameter of
      type 'never'`로 실패했다 (`NotificationsClient.tsx:81`, `href.ts:170`,
      `message.ts:698` — 전체 에러 3건). 확인 후 되돌렸고 커밋에 남기지 않았다
- [x] 중복 억제·fallback 동등성 — 임시 vitest로 미지 type 행을 5회 렌더(두 함수 × 5 = 10회
      호출)해도 `console.warn`이 1회만 남고, 반환값이 기존 fallback과 동일함을 확인했다.
      다른 type은 별도로 1회 남는다. 검증용 임시 파일은 삭제했다
- [x] `npm test` — 588 passed / 2 failed. 실패 2건은
      `src/lib/strava/__tests__/sync-drop-order.test.ts`의 Supabase 환경변수 미설정 오류로,
      **이번 변경 전 기준선에서도 동일하게 실패**함을 stash 후 재실행해 확인했다 (기존 이슈)
- [x] lint — 변경 파일 4개 대상 `npx eslint`는 위반 0건. 신규 위반 없음

### 배포 정보
- 배포일: 2026-08-27 (staging 머지)
- 환경: staging — **프로덕션 미승격.** main 반영은 `/jam-ship`으로 별도 진행
- 커밋: review 브랜치 `claude/jamwork-20260827_021-notif-never-guard`
- 육안 확인 대상 아님 — 도달 불가 경로(`default`)의 타입·로깅만 바뀌어 화면 표시 변화가 0이다

### 주요 의사결정 / 핵심 메모

- **헬퍼 이름**: 티켓 예시는 `unknownFallback`이었으나, 세 파일이 각자 import하는 공용
  심볼이라 무엇의 fallback인지 호출 지점에서 드러나도록 `unknownNotificationType`으로 했다.
- **`void` 반환**: 반환값을 주면 호출부가 그것을 반환하고 싶어지고, 그러면 세 곳의
  fallback 계약(문구·착지·아이콘)이 헬퍼 안으로 새어 들어간다. 헬퍼는 로깅만 하고
  fallback 값은 각 호출부에 그대로 남겼다.
- **`String(type)`**: 인자가 `never`라 타입상 도달 불가지만 런타임에는 실제 문자열이
  들어온다. `Set<string>` 키로 쓰기 위해 명시적으로 변환한다.
- **`warning.ts`는 안전망에 넣지 않았다.** `NotificationType`을 `switch`하는 네 번째
  지점이지만, 그 `default: return false`는 "대부분의 종류는 경고가 아니다"라는 **의도된
  기본값**이라 `never` 가드를 붙이려면 20종 전부를 나열해야 한다. 대신 DATA_MODEL §2의
  갱신 지점 표에 "안전망 밖 — 조용히 누락됨"으로 명시했다. 개선안(경고 후보를
  `ReadonlySet<NotificationType>`으로 뽑아 집합 갱신 누락을 한 곳에 모으는 것)은 후속 티켓감.
- **`console.warn`은 관측 수단이 아니다.** 리포에 Sentry·로그 수집 유틸이 전무해
  (`Sentry|captureException|logError` 검색 0건), 클라이언트 렌더 경로(`TypeIcon`)의 경고는
  유저 브라우저 콘솔에만 남는다. 즉 "미지 type 재유입"의 실제 관측 가능성은 사실상 0이다.
  **본체는 컴파일 가드이고 warn은 부속**이라는 판단이며, 이 문장을 DATA_MODEL §2에도 남겼다.
- **중복 억제 `Set`의 회귀 테스트는 남기지 않았다.** 모듈 스코프라 테스트 간 상태가 누적돼
  테스트 전용 리셋 함수(`__resetWarnedNotificationTypes()`)를 프로덕션 코드에 뚫어야 한다.
  부속 기능을 위해 프로덕션 표면을 넓히는 것보다, 본체인 컴파일 가드가 역검증으로 확인된
  것으로 충분하다고 판단했다. `Set`의 키 상한은 DB ENUM 29값이라 무한 증가 여지도 없다.
- **티켓 번호 019 → 021 재부여**: 구현 중 다른 세션이 `origin/staging`에
  `20260827_019_Service_알림-syncGroupKey-죽은-export-정리.md`를 먼저 올렸고, 020도
  `claude/jamwork-20260827_020-storybook-prod-split` 브랜치가 선점한 상태였다. 머지 직전
  021로 재부여하고 파일명·`id`·코드 주석 4곳·브랜치명·커밋 메시지를 함께 정합화했다.

### 잔여 이슈
- **`warning.ts`가 네 번째 type 인지 지점인데 안전망 밖이다.** 새 ⑧계정·시스템 경고 종류를
  추가하면 문구·착지·아이콘은 컴파일 에러로 잡히지만 **경고 스타일만 조용히 빠진다**
  (PRD §6-2 동적 재평가 대상). 위 의사결정 항목의 `ReadonlySet` 대안으로 별도 티켓 후보.
- 016 잔여 이슈 4번(`database.generated.ts` 29값 vs 수기 `database.ts` 20종의 괴리)은 이 티켓
  범위 밖이라 그대로다. 이번 헬퍼는 **수기 `database.ts`의 20종 유니온**을 기준으로 동작하므로,
  언젠가 `generated`를 진실 소스로 바꾸면 세 `default`가 모두 도달 가능해져 컴파일 에러 9건이
  뜬다 — 그 전환 티켓에 이 영향을 미리 적어둘 것.
- **`src/lib/missions/checker.ts:431` `getTarget(missionType: string, …)`** — 인자가 유니온이
  아니라 `string`이라 오타 하나(`"distanse"`)가 컴파일도 런타임도 통과하고 목표치 0을 반환한다.
  진행바(#20)와 마감 임박 소식(#21)이 **동시에** 오판정되는 경로다. `never` 가드를 붙이려면
  미션 타입 유니온화가 선행돼야 해 별도 티켓감이다.
- **워크트리 `npm run lint`가 30,526건을 보고한다.** 원인 확인: `jam-web/eslint.config.mjs`의
  `globalIgnores`에 `.next/**`는 있으나 **`public/storybook/**`·`storybook-static/**`이 빠져
  있어** 빌드된 Storybook 번들을 전부 린트한다. 016이 기준선으로 삼은 183건과 스케일이
  두 자릿수 다른 이유이며, 앞으로도 파일 단위 판정을 강요하게 된다 — ignore 설정 보강 필요.
- `src/lib/strava/__tests__/sync-drop-order.test.ts` 2건이 `NEXT_PUBLIC_SUPABASE_URL`·
  `SUPABASE_SERVICE_ROLE_KEY` 미설정으로 **상시 실패**한다. 이번 변경과 무관한 기존 부채지만
  상시 레드 2건은 스위트의 회귀 감지력을 떨어뜨린다 — 환경변수 모킹 또는 skip 조건 필요.
