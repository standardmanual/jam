---
id: 20260830_2120
category: Service
status: CLOSED
created: 2026-08-30
closed: 2026-08-30
---

# [Service] LocalDate 하이드레이션 불일치 (React error #418)

## 배경 / 문제 정의
티켓 [20260830_2104](./20260830_2104_Service_getTodayLeftStatus-불필요한-DB조회-제거.md)
완료 후 발견된 잔여 이슈. staging(`jam-stage.vercel.app`) 홈 화면에서 브라우저 콘솔에
"Minified React error #418"(하이드레이션 불일치)이 매 새로고침마다 재현된다.

네트워크 요청은 전부 200이고 화면 콘텐츠 자체는 정상 렌더링돼 기능적 장애는 아니지만,
운영 중 콘솔 에러가 누적되는 것은 확인·정리가 필요하다.

20260830_2104의 변경 범위는 `jam-web/src/lib/today/status.ts`와
`jam-web/src/app/(main)/page.tsx`의 데이터 페칭(Promise 구성) 로직뿐이라 하이드레이션과는
무관해 보인다.

**유력 원인**: `jam-web/src/components/LocalDate.tsx`가 `new Date(iso).toLocaleString('ko-KR',
options)`를 서버 렌더와 클라이언트 하이드레이션 양쪽에서 하이드레이션 가드 없이 그대로
호출한다. 서버(Vercel 함수, UTC 등)와 클라이언트(브라우저, KST)의 타임존이 다르면
`toLocaleString` 결과 문자열이 달라져 하이드레이션 불일치가 발생할 수 있다. 이 컴포넌트는
홈 화면 "최근 배지" 날짜 표시(`page.tsx:130`)를 포함해 8개 파일에서 사용된다
(`today/[cardId]/page.tsx`, `badges/[id]/page.tsx`, `PoiEarnHistory.tsx`,
`ItemEarnHistory.tsx`, `StravaStatusCard.tsx`, `InventoryGrid.tsx`).

## 상세 요구사항

### 서비스/코드베이스 관점
- 로컬 dev 서버 또는 https://react.dev/errors/418 가이드를 참고해 error #418의 실제
  원인 컴포넌트를 브라우저에서 재확인한다 (production 빌드는 minify돼 있어 스택이 안 보임).
- `LocalDate.tsx`가 원인으로 확인되면, 서버/클라이언트 렌더 결과가 항상 일치하도록
  하이드레이션 가드를 추가한다 (예: 최초 렌더는 서버와 동일한 fallback/ISO 문자열을 출력하고,
  클라이언트 마운트(`useEffect`) 후에만 실제 로케일 포맷 문자열로 교체).
- 원인이 다른 컴포넌트로 밝혀지면 그 원인을 명시하고 별도로 수정한다.
- 8개 사용처 모두 회귀 없이 동일한 최종 표시 문자열을 유지해야 한다 (가드로 인해 마운트 직후
  깜빡임이 눈에 띄게 발생하지 않는지도 확인).

### UI/UX 관점 (해당 시)
- 날짜 표시 텍스트 자체는 변경하지 않는다. 마운트 전/후 시각적 깜빡임(레이아웃 시프트 등)이
  없는지 확인.

### 컨텐츠 관점 (해당 시)
- 없음

## 구현 계획
1. 로컬 dev 서버에서 홈 화면을 열어 브라우저 콘솔의 정확한 React 에러 스택을 확인,
   `LocalDate`가 원인인지 특정한다.
2. 원인 확정 시 `LocalDate.tsx`에 하이드레이션 가드 추가.
3. 8개 사용처에서 콘솔 에러 재현 여부 재확인 (특히 홈 화면).
4. staging 배포 후 `jam-stage.vercel.app`에서 새로고침 반복 테스트로 에러 소거 확인.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
유력 원인으로 지목된 `LocalDate.tsx`가 실제 원인임을 `TZ` 환경변수로 서버(UTC)·클라이언트(KST)
실행 환경을 시뮬레이션해 재현·확정했다. `new Date(iso).toLocaleString('ko-KR', options)`가
`timeZone`을 지정하지 않으면 실행 프로세스의 시스템 타임존을 따르는데, Vercel 서버 함수는 UTC로,
브라우저는 KST로 돈다. `earned_at` 등 시각이 UTC 15:00~23:59(=KST 00:00~08:59) 구간에 찍히면
서버·클라이언트가 계산한 날짜(요일 경계)가 아예 달라져 매번 하이드레이션 불일치가 났다
(브라우저 개발 도구 없이도 `TZ=UTC node -e "..."` vs `TZ=Asia/Seoul node -e "..."` 비교로
"8월 29일" vs "8월 30일" 불일치를 직접 재현·확인).

수정은 `toLocaleString` 호출에 `timeZone: 'Asia/Seoul'`을 명시하는 것. 이 서비스는 전체가
KST 고정 기준(`src/lib/notifications/kst.ts`와 동일한 원칙)이라, 실행 환경의 시스템 타임존과
무관하게 항상 같은 결과를 내게 되어 서버/클라이언트 렌더가 항상 일치한다. 마운트 가드
(`useEffect`로 클라이언트 마운트 후 교체)는 채택하지 않았다 — 문제의 본질이 "현재 시각이
계속 바뀜"이 아니라 "고정된 ISO 타임스탬프를 서로 다른 시스템 타임존으로 포맷"이었으므로,
입력값(옵션)에 `timeZone`을 고정하는 쪽이 근본 수정이고 마운트 직후 깜빡임도 발생하지 않는다.

8개 사용처(`page.tsx`, `today/[cardId]/page.tsx`, `badges/[id]/page.tsx`, `ItemEarnHistory.tsx`,
`PoiEarnHistory.tsx`, `StravaStatusCard.tsx`, `InventoryGrid.tsx`)는 모두 `LocalDate` 컴포넌트
하나를 공유하므로 이 한 곳 수정으로 전부 커버된다. 어느 caller도 `options`에 `timeZone`을 직접
지정하지 않아 충돌 없음.

### 변경된 파일
```
jam-web/src/components/LocalDate.tsx
```

### 테스트 결과
- [x] `TZ=UTC` / `TZ=Asia/Seoul` / `TZ=America/Los_Angeles` 각각에서 실제 사용 중인 5가지
      옵션 조합(연월일, YYYY.MM.DD, 월일만, 연월일+시분, M.D)을 `node -e`로 재현 — 수정 후
      3개 타임존 모두 완전히 동일한 문자열 출력 확인 (수정 전에는 UTC vs KST에서
      "2026년 8월 30일" vs "2026년 8월 29일"처럼 날짜 자체가 어긋남을 재현·확인)
- [x] 수정 전 클라이언트(KST, timeZone 미지정) 출력과 수정 후 출력이 완전히 동일함을 확인
      → 실제 사용자(한국 브라우저) 기준 표시 문자열 회귀 없음
- [x] `npm run lint` 전체 실행 — 0 errors, 25 warnings (전부 이번 변경과 무관한 기존 경고,
      `LocalDate.tsx` 관련 신규 경고 없음)
- [x] `npx tsc --noEmit` — 에러 없음
- [x] `npm run build` — 성공 (`[build] 완료`)
- [x] `jam-stage.vercel.app` 실배포 새로고침 3회 반복 테스트 — React error #418 재현 없음
      확인 (오케스트레이터가 브라우저로 직접 확인, dpl_HZqcU35gPa6RwpntjZjqmQ2S1TZj 배포 기준)

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
- 커밋: 6c8e0ced (staging 머지 커밋)

### 주요 의사결정 / 핵심 메모
- **마운트 가드 대신 `timeZone` 명시를 선택한 이유**: 티켓 예시(`useEffect` 마운트 감지 후
  fallback→실제값 교체)는 "현재 시각이 흐른다"는 종류의 하이드레이션 문제(예: `new Date()`를
  매 렌더 호출)에 맞는 패턴이다. 이 컴포넌트는 고정된 `iso` prop을 포맷할 뿐이라 근본 원인은
  "같은 입력을 다른 시스템 타임존으로 해석"이었다. `timeZone: 'Asia/Seoul'` 고정이 마운트 가드보다
  더 근본적인 수정이며, 마운트 직후 깜빡임(요구사항 4번 "눈에 띄는 깜빡임 없어야")도 원천적으로
  없다.
- **브라우저 재확인 미실시**: 이 세션에는 브라우저를 직접 제어할 수단이 없어 실제 React 에러
  컴포넌트 스택을 브라우저 콘솔에서 캡처하지 못했다. 대신 `TZ` 환경변수로 서버(UTC)·클라이언트
  (KST) 프로세스를 각각 시뮬레이션해 `toLocaleString` 결과가 실제로 어긋남을 수치로 재현·확정했다
  (`jam-web/src/lib/notifications/kst.ts`가 이미 문서화한 것과 동일한 클래스의 버그 — "서버 UTC,
  로컬 KST" 환경차).

### 잔여 이슈
- 없음 (staging 실배포 확인 완료).
- (범위 밖 참고) 개선 리뷰어가 동일 버그 클래스(서버 UTC vs 클라이언트 KST, `timeZone` 미지정
  `toLocaleString`/`toLocaleDateString`)가 `FeedSection.tsx:150` 등 다른 화면에도 있을 수
  있다고 지적함. 별도 티켓으로 점검 필요.
