# JAM! Phase 15 프로젝트 스펙 — 홈 → '투데이' 개편

> 작성일: 2026-07-26

---

## 1. 기술 스택 (기존 유지 + 최소 추가)

기존 Next.js + Supabase 패턴 그대로. **신규 npm 의존성 추가 금지** — 아티클 본문(`body_markdown`)은 실제로는 마크다운 파서 없이 "빈 줄 기준 문단 분리"로만 렌더링(볼드/링크 등 리치 포맷 필요해지면 그때 별도 검토). `package.json`에 markdown 관련 라이브러리가 전혀 없는 걸 확인했고(2026-07-26 기준), 카드 30개짜리 기능에 새 의존성을 들이는 건 과함.

## 2. 파일 구성

```
[마이그레이션]
supabase/migrations/0XX_today_cards.sql       # today_cards 테이블 (Phase15_02 §1)
supabase/seed_phase15_today_cards_30.sql      # 샘플 30개 (1회성, 마이그레이션 아님)

[lib]
src/lib/today/exposure.ts    # 신규 — computeUserExposureTags()
src/lib/today/cards.ts       # 신규 — getTodayCards(), target_href 자동생성

[타입]
src/types/database.ts        # TodayCardRow, TodayCardTemplateType 추가 (수정)

[서비스 UI]
src/app/(main)/TabBar.tsx                 # label: '홈' → '투데이' (수정, 한 줄)
src/app/(main)/page.tsx                   # 투데이 카드 스택 섹션 최상단 삽입 (수정)
src/app/(main)/TodayCardStack.tsx         # 신규 — 템플릿별 카드 렌더링
src/app/(main)/today/[cardId]/page.tsx    # 신규 — 아티클 상세 페이지

[어드민]
src/app/admin/today/page.tsx              # 신규 — 목록
src/app/admin/today/TodayCardList.tsx     # 신규 — 리스트 + 템플릿별 동적 생성폼
src/app/api/admin/today/route.ts          # 신규 — GET/POST
src/app/api/admin/today/[id]/route.ts     # 신규 — PATCH/DELETE
```

## 3. 구현 규칙

- **`target_href` 자동생성 우선순위**: 어드민이 명시적으로 입력한 값이 있으면 그 값을 쓰고, 비어있으면 템플릿 규칙(Phase15_02 §2)으로 자동 계산. `editorial_article`은 예외 없이 항상 `/today/{id}`로 고정(어드민 입력 무시).
- **노출조건 태그는 OR 매칭** — 카드에 태그가 여러 개면 유저가 그중 하나라도 해당하면 노출. `all`이 포함된 카드는 무조건 노출.
- **시간대 태그는 KST 기준**으로 계산 — 서버가 UTC로 동작해도 `computeUserExposureTags()` 내부에서 KST(UTC+9)로 변환 후 시간대 판정.
- **`is_active=false`이거나 조회 시점이 `starts_at`~`ends_at` 밖이면 절대 노출 안 됨** — 카드 스택 쿼리(§4)와 아티클 상세 페이지(Step D) 양쪽 다 이 조건을 체크(아티클 페이지 직링크로 기간 밖 카드에 접근하는 것도 막아야 함 — 그렇지 않으면 "예약 발행"의 의미가 없어짐).
- **기존 홈 섹션은 절대 삭제/이동하지 않는다** — 투데이 카드 스택은 "추가"이지 "교체"가 아님. 최근배지/바로가기/피드는 순서·내용 그대로 아래에 유지.
- **어드민 CMS는 기존 패턴 재사용** — `missions`/`itembooks` 어드민의 "목록+인라인생성폼" 구조, 배지 검색·다중선택 UI(Phase13에서 만든 것)를 그대로 재사용. 새로운 CMS 프레임워크나 리치 에디터 라이브러리 도입 금지.
- **샘플 30개의 `editorial_article`은 실존 데이터를 소재로** — 완전히 무관한 가짜 이름 대신, 실제 시드된 배지/미션 이름을 인용해서 "운영되는 느낌"을 살린다(단 등장인물 닉네임은 가상으로 명시해도 무방).

## 4. 절대 하지 마

- 마크다운/리치텍스트 에디터 라이브러리 신규 설치
- 기존 홈 섹션(최근배지/바로가기/피드) 삭제·순서변경
- 활동 로그 기반 자동 세그먼트(원본 활동 테이블 없이는 구현 불가 — Phase 2)
- `starts_at`/`ends_at` 검증 없이 아티클 페이지 직접 접근 허용
- 노출조건 태그 종류를 DB CHECK 제약으로 하드코딩(Phase 2에서 태그가 늘어날 걸 감안해 애플리케이션 레벨 검증만)

## 5. 완료 체크리스트

- [ ] Step A: `today_cards` 마이그레이션 적용 + 탭 개명
- [ ] Step B: 노출조건 계산 + 카드 조회 로직 + 유닛테스트
- [ ] Step C: 홈 화면 카드 스택 삽입(회귀 없음)
- [ ] Step D: 아티클 페이지(기간 밖 접근 차단 포함)
- [ ] Step E: 어드민 CMS(7템플릿 동적 폼)
- [ ] Step F: 샘플 30개 생성 + 적용
- [ ] Step G: tsc 0 에러 + SERVICE_OPERATIONS 문서 + 마이그레이션 직접 실행 + 배포 확인 + commit/push
