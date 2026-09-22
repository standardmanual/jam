---
id: "20260922_2322"
category: Infra
priority: P3
status: OPEN
created: 2026-09-22
closed:
---

# [Infra] `.env.example`이 프로덕션 실제 환경변수와 어긋난다 (`ADMIN_SECRET` 미설정 포함)

## 핵심 요약

- 요구사항: `jam-web/.env.example`을 프로덕션 실제 설정과 맞추고, `ADMIN_SECRET` 미설정이 의도인지
  확인한다.
- 관련 파일: `jam-web/.env.example`, `jam-web/src/app/api/admin/auth/route.ts`,
  `jam-web/src/app/api/admin/test/simulate/route.ts`

## 배경 / 문제 정의

2026-09-22 `/jam-ship` 3단계 환경변수 점검(`vercel env ls production` vs `.env.example` 대조)에서
발견했다. 이번 배포의 diff와 무관한 기존부터 있던 어긋남이라 배포는 막지 않았다.

- **.env.example에는 있는데 production에 없음**: `ADMIN_SECRET`·`FOREST_SERVICE_KEY`·
  `RECRAFT_API_KEY`·`SUPABASE_PUBLISHABLE_KEY`·`SUPABASE_SECRET_KEY`·
  `NEXT_PUBLIC_NAVER_MAP_STYLE_ID`.
  - `FOREST_SERVICE_KEY`·`RECRAFT_API_KEY`·`SUPABASE_PUBLISHABLE_KEY`·`SUPABASE_SECRET_KEY`는
    `jam-web/src` 안에서 참조하는 곳이 0건이다 — 로컬 도구용이거나 낡은 항목일 수 있다.
  - **`ADMIN_SECRET`은 `admin/auth`·`admin/test/simulate` 라우트 2곳에서 실제로 쓰인다.** 값이
    없으면 `password !== undefined`가 항상 참이라 어떤 비밀번호도 로그인에 실패한다(fail-closed,
    보안 구멍은 아니다). 주 어드민 인증 경로는 `ADMIN_EMAILS` 화이트리스트 기반 구글 로그인
    (`getAdminUser()`)이고 이건 production에 정상 설정돼 있다 — 그래서 어드민 기능 자체는
    막히지 않는다. 다만 비밀번호 라우트가 왜 죽어 있는지(의도적 폐기인지 설정 누락인지)는
    불명확하다.
  - `NEXT_PUBLIC_NAVER_MAP_STYLE_ID`는 `MapView.tsx`에서 참조한다 — 값이 없으면 지도가 기본
    스타일로 렌더될 가능성이 있다(코드 확인 필요).
- **production에는 있는데 .env.example에 없음**: `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET`·
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`·`STRAVA_WEBHOOK_VERIFY_TOKEN`·`ADMIN_API_READ_TOKEN` — 새
  PC에서 로컬 개발 환경을 꾸릴 때 `.env.example`만 보면 이 5개를 빠뜨린다.

## 완료 조건
- `ADMIN_SECRET` 라우트 2곳을 유지할지 제거할지 결정하고, 유지한다면 production에 값을 설정하거나
  `.env.example`에서 뺀다.
- `NEXT_PUBLIC_NAVER_MAP_STYLE_ID` 없을 때 `MapView`가 의도한 기본 동작(기본 스타일 렌더)인지
  확인하고 주석으로 남긴다.
- `.env.example`이 production 실제 목록과 일치한다(사용하지 않는 5개 정리, 누락된 5개 추가).

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
- 해당 없음

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
