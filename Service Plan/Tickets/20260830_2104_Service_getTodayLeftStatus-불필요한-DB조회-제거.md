---
id: 20260830_2104
category: Service
status: CLOSED
created: 2026-08-30
closed: 2026-08-30
---

# [Service] getTodayLeftStatus 불필요한 DB 조회 제거

## 배경 / 문제 정의
티켓 [20260830_2030](./20260830_2030_UI_투데이홈-상단-재구성-오늘의현황-스트립.md) 게이트 리뷰(conservative-reviewer)의
sideFindings로 발견된 범위 밖 이슈.

`jam-web/src/lib/today/status.ts`의 `getTodayLeftStatus(userId, stravaConnected)`는
`stravaConnected=false`일 때만 조기 반환(`kind: 'strava_disconnected'`)하고, 그 외에는
`bestProgress()`(컬렉션 슬롯·완료 조회 2건 + 미션 참가·완료 조회 2건, 총 4개 DB 쿼리)를 실행한다.

그런데 `jam-web/src/app/(main)/page.tsx`의 병렬 `Promise.all` 안에서는 항상
`getTodayLeftStatus(userId, true)`로 인자를 고정 호출하고, 실제 Strava 연동 여부는 같은
`Promise.all`의 `strava_connections` 쿼리 결과(`stravaConn`)로 밖에서 다시 확정해
`leftStatus`를 조합한다(page.tsx:39-56). 즉 함수 내부 분기는 최종 렌더 결과에 영향을 주지
않고 항상 무시된 채 덮어써진다.

결과적으로 Strava 미연동 유저(제일 흔한 신규 유저 경로 포함)도 홈 화면 요청마다
`bestProgress()`의 4개 쿼리가 무의미하게 실행된다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `getTodayLeftStatus`에서 `stravaConnected` 파라미터를 제거한다. 함수는 항상
  "진행 중 컬렉션/미션 → 없으면 신규 유저 안내" 분기만 계산하는 순수한 역할로 좁힌다.
- `page.tsx` 호출부에서 `strava_connections` 조회 결과(`stravaConn`)를 먼저 판단해,
  미연동이면 `getTodayLeftStatus` 자체를 호출하지 않고 바로
  `{ kind: 'strava_disconnected', href: '/api/strava/auth' }`를 사용한다.
- `Promise.all` 병렬화 이점을 유지해야 하므로, `strava_connections` 쿼리와
  `getTodayLeftStatus` 호출의 의존순서를 어떻게 배치할지는 구현 시 판단한다
  (예: `strava_connections`만 먼저 await 후 분기, 또는 조건부로 Promise.all 구성).
  단, 미연동 시 `bestProgress()` 관련 쿼리가 전혀 실행되지 않아야 한다는 목표는 유지.
- 기존 코드의 "인자값이 최종 결과에 영향을 주지 않는다"는 취지의 주석(page.tsx:34-38)은
  더 이상 사실이 아니게 되므로 제거하거나 새 구조에 맞게 수정한다.

### UI/UX 관점 (해당 시)
- 없음 (렌더 결과 동일, 내부 로직만 정리)

### 컨텐츠 관점 (해당 시)
- 없음

## 구현 계획
1. `status.ts`의 `getTodayLeftStatus` 시그니처에서 `stravaConnected: boolean` 제거,
   내부의 `if (!stravaConnected) return ...` 분기 제거.
2. `page.tsx`에서 `strava_connections` 조회를 먼저 처리(또는 조건부 호출 구조로 재배치)해
   미연동 시 `getTodayLeftStatus` 호출 자체를 스킵.
3. 기존 3분기(미연동 / 진행 중 컬렉션·미션 있음 / 신규 유저 안내) 동작이 회귀 없이
   동일하게 유지되는지 확인.
4. 관련 주석 정리.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- `getTodayLeftStatus`에서 `stravaConnected` 파라미터와 그에 따른 조기 반환 분기를 제거했다.
  이제 이 함수는 항상 "진행 중 컬렉션/미션 → 없으면 신규 유저 안내"만 계산하는 순수한
  책임으로 좁혔다. 함수 상단에 이 계약을 명시하는 doc 주석을 추가했다.
- `page.tsx`의 병렬 조회 쿼리들을 개별 Promise 변수로 분리해 모두 즉시 시작(fire) 시키되,
  `strava_connections` 쿼리 결과만 먼저 `await`해 연동 여부를 확정한다. 연동 상태면
  `getTodayLeftStatus(userId)`를 호출하고, 미연동이면 `Promise.resolve({ kind:
  'strava_disconnected', ... })`로 대체해 `bestProgress()` 관련 4개 쿼리가 아예
  실행되지 않도록 했다. 나머지 쿼리(`users`, `user_activity_badges`,
  `getTodayRightStatus`)는 `strava_connections`와 무관하게 이미 동시에 실행 중이므로,
  최종 `Promise.all`에서 함께 대기해 병렬화 이점을 그대로 유지했다.
- 더 이상 사실이 아닌 "인자값이 최종 결과에 영향을 주지 않는다"는 취지의 기존 주석을
  새 구조를 설명하는 주석으로 교체했다.

### 변경된 파일
```
jam-web/src/lib/today/status.ts
jam-web/src/app/(main)/page.tsx
```

### 테스트 결과
- [x] `npx tsc --noEmit -p .` — 에러 0건
- [x] `npm run lint` (전체) — 에러 0건, 경고 25건 (모두 이번 변경과 무관한 기존 경고,
      변경 파일 2건은 경고 목록에 없음)
- [x] staging(`jam-stage.vercel.app`) 실제 화면 확인 — 미연동 분기("Strava 동기화하면
      시작해요") 정상 렌더링 확인. 네트워크 요청 전부 200, 기능적 오류 없음. (진행 중/
      신규 유저 분기는 게이트 리뷰의 코드 대조로 회귀 없음을 확인 — 해당 상태의 테스트
      계정 부재로 브라우저 실측은 생략)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일: 2026-08-30
- 환경: staging (프로덕션 반영은 `/jam-ship`으로 별도 진행 예정)
- 커밋: 7641d6ab (staging 머지 커밋)

### 주요 의사결정 / 핵심 메모
> UX Writing/문서 갱신 체크박스는 렌더 결과가 변경 전후 동일한 내부 성능/구조 개선이라
> 해당 없음으로 비워둔다(progressive-reviewer 검토 결과 동일 결론).

### 잔여 이슈
- staging 확인 중 홈 화면에서 React 하이드레이션 에러(Minified React error #418)가
  발견됨. 이번 변경 범위(`status.ts`/`page.tsx`의 데이터 페칭 로직)와는 무관하며,
  `LocalDate` 컴포넌트(`src/components/LocalDate.tsx`)가 서버/클라이언트 렌더 결과가
  달라질 수 있는 `toLocaleString` 호출을 하이드레이션 가드 없이 사용하는 것이 유력한
  원인으로 추정된다(기능적 오류는 아니며 네트워크 요청은 전부 정상). 범위 밖 이슈로
  별도 티켓 분리 필요.
