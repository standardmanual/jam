# JAM! PRD 문서 안내

> 이 폴더는 4카테고리 문서 체계(① PRD ② 티켓 ③ 컨텐츠 ④ 배지엔진) 중 **① PRD**에
> 해당한다. 기능·스펙·플로우 정의를 다루며, "현재 기준 최신 스펙"이 원칙이다.
> 실행 계획·작업 이력은 [History/Migration/Ticket/](../../History/Migration/Ticket/)을 참고할 것.

---

## 문서 구성

| 문서 | 내용 | 언제 읽나 |
|------|------|----------|
| [01_PRD.md](./01_PRD.md) | 뭘 만드는지, 누가 쓰는지, 핵심 기능 목록(구현 상태 표시) | 프로젝트 시작 전 / 방향 확인할 때 |
| [02_DATA_MODEL.md](./02_DATA_MODEL.md) | 데이터 구조, 엔티티 상세, 관계도 | DB 설계할 때 / 새 기능 추가할 때 |
| [03_PHASES.md](./03_PHASES.md) | 실제 개발 이력(티켓 기준 시간순) + 현재 상태 요약 | 지금까지 뭐가 만들어졌는지 훑어볼 때 |
| [04_PROJECT_SPEC.md](./04_PROJECT_SPEC.md) | 기술 스택, 절대 금지 목록, 환경변수 | AI에게 코드 시킬 때마다 함께 공유 |
| [../UX_WRITING_GUIDELINE.md](../UX_WRITING_GUIDELINE.md) | 화면 문구·알림·에러 메시지 작성 기준 | 신규 기능 문구 작성 시 / 기존 문구 수정 시 항상 |

> **2026-08-06 전면 갱신 완료**: 위 4개 문서를 `jam-web/src/app` 라우트 전체,
> `supabase/migrations/` 001~074 전수, 프로젝트 설정을 코드와 대조해 현재 상태
> 기준으로 재작성했다. 세계관·조합·미션·포인트·팔로우·어뷰징·드랍엔진v2·CMS 등
> 신규 도메인, 지도/POI 소스의 Google→네이버 전환, 도메인 전환(j-a-m.app) 등을
> 모두 반영. 갱신 시점 이후 변경분은 각 문서가 다시 낡을 수 있으므로, 신규
> 개선사항 작업 전에는 항상 [History/Migration/Ticket/](../../History/Migration/Ticket/) 최신 티켓을 먼저 확인할 것.

### 주제별 PRD 세트 (하위 폴더)

| 폴더 | 주제 |
|------|------|
| [AdminUI/](./AdminUI/) | 어드민 UI 리디자인 (기존 `05_ADMIN_PRD.md` → `AdminUI/ADMIN_PRD.md`로 이동, 기능 기준 문서로 유지) |
| [PointSystem/](./PointSystem/) | 포인트 시스템 |
| [Notification/](./Notification/) | 알림(소식) — 인앱 소식 히스토리 28종. 푸시 알림 아님 |

새 주제별 PRD 세트 생성 시 `Specs/PRD/{주제}/` 하위 폴더로 구분한다 (파일명 접두어 사용 안 함).

### 과거 이력 자료

| 자료 | 내용 |
|------|------|
| [History/PHASES_ROADMAP_ARCHIVE.md](../../History/PHASES_ROADMAP_ARCHIVE.md) | 2026-07-09~10 작성된 원래 Phase 계획 원문 (실행 안 됨, 참고용) |
| `History/Phase7~17_01~04` 등 | 각 Phase 시점의 4종 PRD 문서 스냅샷 |

---

## 최신 스펙 교차 참고

| 영역 | 문서 |
|------|------|
| 배지·드랍 엔진 판정 로직 (드랍엔진 v2, 세계관 모멘텀 등) | [Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md](../BadgeEngine/BADGE_ENGINE_UNIFIED.md) |
| 액티비티배지·컬렉션·아이템배지·세계관·POI 컨텐츠 목록 | [Specs/Content/](../Content/) |
| 실제 개발 작업 이력 원본 | [History/Migration/Ticket/](../../History/Migration/Ticket/) |

---

## 한 줄 요약

**Strava 연동 → 배지 자동 발급 → 지도에서 아이템 드랍/픽업 → 세계관별 컬렉션 완성 → 조합·미션·포인트로 순환 → (예정) 실물 패치 구매 자격**

---

## 기술 스택 요약

| 영역 | 선택 |
|------|------|
| 프레임워크 | Next.js 16 (App Router), React 19 |
| DB/백엔드 | Supabase (PostgreSQL) |
| 배포 | Vercel (Cron 4건) |
| 인증 | Supabase Auth + Google OAuth (어드민은 이중 인증) |
| 스타일 | Tailwind CSS 4 + Radix UI |
| 지도 / POI 자동수집 | **네이버 지도(NCP Maps.js) / 네이버 지역검색 오픈API** |

상세는 [04_PROJECT_SPEC.md](./04_PROJECT_SPEC.md) 참고.

---

## JAM! 핵심 철학 (개발 중 항상 기억)

1. **Tracker-less**: 자체 GPS 트래킹 UI 절대 만들지 말 것
2. **10초 첫 보상**: 마찰 제로 온보딩
3. **자립 운영**: 외부 자본 없이 지속 가능한 구조
