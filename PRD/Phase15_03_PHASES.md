# JAM! Phase 15 구현 단계 — 홈 → '투데이' 개편

> 작성일: 2026-07-26

---

## Step A: 데이터 모델 + 하단 탭 개명

- `supabase/migrations/0XX_today_cards.sql`: Phase15_02_DATA_MODEL §1 그대로. 직접 Supabase에 실행(서비스 롤 키 보유 — `.env.local` 참고).
- `src/types/database.ts`에 `TodayCardRow`/`TodayCardTemplateType` 타입 추가.
- `TabBar.tsx`: `label: '홈'` → `label: '투데이'` 한 줄만 변경(회귀 위험 최소).

**완료 기준**: 마이그레이션 적용 확인(`today_cards` 테이블 존재), 하단 탭에 "투데이" 표시.

## Step B: 노출조건 계산 + 카드 조회 로직

- `src/lib/today/exposure.ts` 신규 — Phase15_02_DATA_MODEL §3의 `computeUserExposureTags()`.
- `src/lib/today/cards.ts` 신규 — §4 쿼리를 감싸는 `getTodayCards(userId): Promise<TodayCardRow[]>`. `target_href` 자동 계산 로직도 여기 포함(템플릿별 매트릭스 §2 그대로 — 어드민이 명시적으로 `target_href`를 채웠으면 그 값 우선, 비어있으면 템플릿 규칙으로 자동 생성).

**완료 기준**: 유닛테스트(`node:assert`)로 태그 매칭·`target_href` 자동생성 로직 검증(순수 함수로 분리 가능한 부분만).

## Step C: 홈 화면에 투데이 카드 스택 삽입

- `src/app/(main)/page.tsx`: `getTodayCards()` 호출 결과를 최상단에 신규 섹션으로 삽입(기존 섹션들은 그대로 아래 유지).
- `src/app/(main)/TodayCardStack.tsx`(신규, 클라이언트 또는 서버) — 템플릿별 카드 UI 분기 렌더링. 카드 0개면 섹션 자체 미노출.

**완료 기준**: 조건에 맞는 카드가 홈 상단에 스택으로 노출, 기존 홈 섹션들 회귀 없음.

## Step D: 아티클 페이지

- `src/app/(main)/today/[cardId]/page.tsx` 신규 — `editorial_article` 카드 조회 후 `cover_image_url`/`title`/`body_markdown` 렌더링(마크다운 렌더러: 이미 프로젝트에 마크다운 라이브러리가 있는지 먼저 확인, 없으면 최소 기능만 지원하는 간단한 렌더러 사용 — 신규 의존성 추가는 최소화).
- 다른 템플릿 카드로 잘못 접근 시 404 또는 해당 카드의 실제 `target_href`로 리다이렉트.

**완료 기준**: `editorial_article` 카드 클릭 → 기사 페이지 정상 렌더링.

## Step E: 어드민 CMS

- `src/app/admin/today/page.tsx`(목록, 카드형 UI, starts_at 내림차순) + `TodayCardList.tsx`(클라이언트, `missions`/`itembooks` 어드민 패턴 재사용).
- `[+ 콘텐츠 추가]` → 템플릿 타입 셀렉트 → 선택값에 따라 폼 필드 동적 표시(Phase15_02_DATA_MODEL §2 매트릭스 그대로. 배지/미션/아이템북 선택은 기존 미션 어드민의 "배지 검색·다중선택 UI" 컴포넌트 재사용 가능한지 확인 후 재사용).
- 노출조건 태그: 체크박스 다중선택(6개 자동계산 태그 + `all`).
- `src/app/api/admin/today/route.ts`(GET/POST), `src/app/api/admin/today/[id]/route.ts`(PATCH/DELETE) — 기존 어드민 API 패턴(`requireAdmin()` + service client) 그대로.

**완료 기준**: 7개 템플릿 전부 어드민에서 생성 가능, 저장 후 목록에 반영.

## Step F: 샘플 콘텐츠 30개 생성

- 실제 시드된 배지(아이템배지 100종 + 액티비티배지)와 Phase13에서 만든 미션 30종, 아이템북 데이터를 활용해 `today_cards` 30개 INSERT SQL 작성(`supabase/seed_phase15_today_cards_30.sql`).
- 템플릿 분포 예시: badge_spotlight 8, progress_nudge 5, mission_spotlight 5, itembook_milestone 3, location_trend 3, drop_alert 2, editorial_article 4.
- `editorial_article` 4개는 실제로 존재하는 배지/유저 정보를 소재로 한 가상 기사 본문(마크다운) 작성 — "실제 운영되는 느낌"을 살리되 가상 인물임을 알 수 있게 과장되지 않은 톤 유지.
- 시작/종료 일시를 다양하게 분산(일부는 이미 시작, 일부는 예약발행 테스트용으로 미래 시작).
- 서비스 롤 키로 직접 실행 + SQL 파일은 저장(git 커밋).

**완료 기준**: 투데이 탭에서 실제로 여러 카드가 스택되어 보임, 예약발행 카드는 아직 안 보임 확인.

## Step G: 검증 + 문서

- `npx tsc --noEmit` 0 에러.
- 기존 홈 화면 기능(최근 배지/바로가기/피드) 회귀 없음 확인.
- `PRD/SERVICE_OPERATIONS_YYYYMMDD_HHMM.md` 신규 생성.
- 마이그레이션 직접 실행 + 배포 확인(vercel inspect로 최신 배포가 alias에 반영됐는지) + commit + push.

---

## 확장 후보 (이번 범위 아님)

| 기능 | 시점 |
|------|------|
| 활동 로그 기반 자동 세그먼트("러닝 많이 하는 유저" 등) | 원본 활동 로그 테이블 신설 후 |
| 완전 자동 추천 알고리즘 | 태그 기반 운영 데이터 쌓인 후 |
| 아티클 SNS 공유 최적화 | 유저 요청 시 |
| 카드 성과 지표 대시보드 | 카드 수 늘어난 후 |
