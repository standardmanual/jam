# JAM! PRD 문서 안내

> 이 폴더는 4카테고리 문서 체계(① PRD ② 티켓 ③ 컨텐츠 ④ 배지엔진) 중 **① PRD**에
> 해당한다. 기능·스펙·플로우 정의를 다루며, "현재 기준 최신 스펙"이 원칙이다.
> 실행 계획·작업 이력은 [History/Migration/Ticket/](../../History/Migration/Ticket/)을 참고할 것.

---

## 문서 구성

| 문서 | 내용 | 언제 읽나 |
|------|------|----------|
| [01_PRD.md](./01_PRD.md) | 뭘 만드는지, 누가 쓰는지, 핵심 기능 목록 | 프로젝트 시작 전 / 방향 확인할 때 |
| [02_DATA_MODEL.md](./02_DATA_MODEL.md) | 데이터 구조, 엔티티 상세, 관계도 | DB 설계할 때 / 새 기능 추가할 때 |
| [03_PHASES.md](./03_PHASES.md) | Phase 로드맵 요약 (상세는 이력 자료로 분리됨) | 개발 진행 상태를 대략 확인할 때 |
| [04_PROJECT_SPEC.md](./04_PROJECT_SPEC.md) | 기술 스택, 절대 금지 목록, 환경변수 | AI에게 코드 시킬 때마다 함께 공유 |
| [../UX_WRITING_GUIDELINE.md](../UX_WRITING_GUIDELINE.md) | 화면 문구·알림·에러 메시지 작성 기준 | 신규 기능 문구 작성 시 / 기존 문구 수정 시 항상 |

> ⚠️ **위 4개 문서는 2026-07-09~10 초기 작성 이후 내용이 갱신되지 않았다.**
> Phase 1~7 + 어드민 완료 시점 기준으로 작성돼 있어, 이후 구현된 드랍엔진 v2·
> 세계관·조합 시스템·POI 배지 타입 등 최신 기능이 반영되어 있지 않다. 최신 상태
> 반영은 별도 작업으로 예정. **현재 서비스 상태를 정확히 파악하려면 아래
> "최신 스펙은 여기서 확인" 섹션을 먼저 참고할 것.**

### 주제별 PRD 세트 (하위 폴더)

| 폴더 | 주제 |
|------|------|
| [AdminUI/](./AdminUI/) | 어드민 UI 리디자인 (기존 `05_ADMIN_PRD.md` → `AdminUI/ADMIN_PRD.md`로 이동, 기능 기준 문서로 유지) |
| [PointSystem/](./PointSystem/) | 포인트 시스템 |

새 주제별 PRD 세트 생성 시 `Specs/PRD/{주제}/` 하위 폴더로 구분한다 (파일명 접두어 사용 안 함).

### 과거 Phase별 문서 (이력)

| 자료 | 내용 |
|------|------|
| [History/PHASES_ROADMAP_ARCHIVE.md](../../History/PHASES_ROADMAP_ARCHIVE.md) | (구)`03_PHASES.md` + (구)`04_PHASES_NEXT.md` 전문 — Phase 1~18 상세 실행계획, 시작 프롬프트 |
| `History/Phase7~17_01~04` 등 | 각 Phase 시점의 4종 PRD 문서 스냅샷 |

---

## 최신 스펙은 여기서 확인

이 폴더의 4개 핵심 문서가 갱신되기 전까지, 현재 서비스 상태는 아래 문서들이 더 정확하다.

| 영역 | 문서 |
|------|------|
| 배지·드랍 엔진 로직 (드랍엔진 v2, 세계관 모멘텀, 앰비언트 드랍 등) | [Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md](../BadgeEngine/BADGE_ENGINE_UNIFIED.md) |
| 액티비티배지·아이템북·아이템배지·세계관·POI 컨텐츠 | [Specs/Content/](../Content/) |
| 실제 개발 작업 이력 (신규 개선사항은 여기부터 확인) | [History/Migration/Ticket/](../../History/Migration/Ticket/) |

---

## 한 줄 요약

**Strava 연동 → 배지 자동 발급 → 아이템 드랍/픽업 → 세계관 컬렉션 → 인스타 공유 카드 생성 → 실물 패치 구매 자격**

---

## 기술 스택 요약

| 영역 | 선택 |
|------|------|
| 프레임워크 | Next.js 15 (App Router) |
| DB/백엔드 | Supabase (PostgreSQL) |
| 배포 | Vercel |
| 인증 | Supabase Auth + Google OAuth |
| 스타일 | Tailwind CSS 4 |
| 지도 | Google Maps JavaScript API (Phase 7~) |

상세는 [04_PROJECT_SPEC.md](./04_PROJECT_SPEC.md) 참고.

---

## JAM! 핵심 철학 (개발 중 항상 기억)

1. **Tracker-less**: 자체 GPS 트래킹 UI 절대 만들지 말 것
2. **10초 첫 보상**: 마찰 제로 온보딩
3. **자립 운영**: 외부 자본 없이 지속 가능한 구조

---

## 미결 사항 종합 ([NEEDS CLARIFICATION])

각 문서 하단의 `[NEEDS CLARIFICATION]` 섹션 참고. 대표 항목:

- [ ] D2C 쇼핑몰은 별도 URL인지, JAM! 앱 내에 있는지?
- [ ] 배지 발급 조건 스펙(`condition_json`) 최신 버전 위치
- [ ] 아이템 배지 드랍 확률 테이블 — [BadgeEngine 문서](../BadgeEngine/BADGE_ENGINE_UNIFIED.md)와 이 문서 간 정합성 확인 필요
