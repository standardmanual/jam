---
id: "20261006_1502"
category: Service
priority: P3
status: OPEN
created: 2026-10-06
closed:
---

# [Service] Strava 연동 링크의 미리 불러오기가 CORS 오류를 낸다

## 핵심 요약

- 요구사항: 홈에서 Strava가 연결되지 않은 계정이면 `/api/strava/auth`를 가리키는 `next/link`가 화면에 있어, Next가 이 링크를 미리 불러오면서(`?_rsc=`) Strava 인증 페이지로의
  리다이렉트를 fetch로 따라가다 CORS에 막혀 콘솔 오류가 두 줄 남는다. 외부로 리다이렉트하는 API 링크는 미리 불러오지 않게 한다.
- 구현 계획: 해당 링크에 `prefetch={false}`를 주거나 일반 `<a>`로 바꾼다. 같은 주소를 쓰는 곳을 함께 본다.
- 관련 파일: `jam-web/src/components/strava/StravaStatusCard.tsx`(21–22행 `Link` `href="/api/strava/auth"`), `jam-web/src/app/(main)/page.tsx`(42행 `strava_disconnected`의 `href`)와 그 값을 그리는 컴포넌트

## 배경 / 문제 정의

2026-10-06 `/jam-ship` 2단계 staging 확인(자동 로그인 계정, Strava 미연결)에서 홈 콘솔에 「Access to fetch at 'https://www.strava.com/oauth/authorize…' … blocked by CORS policy」가 보였다.
이 링크들은 그 배포 범위(origin/main → staging)에서 바뀌지 않았다. 화면 동작(누르면 Strava로 이동)에는 영향이 없다.

## 완료 조건

- Strava 미연결 계정의 홈에서 콘솔에 CORS 오류가 나지 않고, 링크를 누르면 지금처럼 Strava 인증으로 이동한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `docs/specs/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일: 
- 환경: production
- 커밋: 

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

### 잔여 이슈
-
