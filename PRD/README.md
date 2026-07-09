# JAM! 유저 모바일 웹 — 디자인 문서

> Show Me The PRD로 생성됨 (2026-07-09)
> 기반 서비스: JAM! (Join And Move!) v2.2

---

## 문서 구성

| 문서 | 내용 | 언제 읽나 |
|------|------|----------|
| [01_PRD.md](./01_PRD.md) | 뭘 만드는지, 누가 쓰는지, 핵심 기능 목록 | 프로젝트 시작 전 / 방향 확인할 때 |
| [02_DATA_MODEL.md](./02_DATA_MODEL.md) | 데이터 구조, 엔티티 상세, 관계도 | DB 설계할 때 / 새 기능 추가할 때 |
| [03_PHASES.md](./03_PHASES.md) | Phase별 기능, 체크리스트, 시작 프롬프트 | 개발 순서 정할 때 / 다음 Phase 시작할 때 |
| [04_PROJECT_SPEC.md](./04_PROJECT_SPEC.md) | 기술 스택, 절대 금지 목록, 환경변수 | AI에게 코드 시킬 때마다 함께 공유 |

---

## 한 줄 요약

**Strava 연동 → 과거 운동 데이터 소급 분석 → 배지 자동 발급 → 인스타 공유 카드 생성 → 실물 패치 구매 자격**

---

## Phase 1 바로 시작하기

[03_PHASES.md](./03_PHASES.md)의 **"Phase 1 시작 프롬프트"** 섹션을 참고하세요.

아래 파일 3개를 AI에게 공유하고 프롬프트를 붙여넣으면 됩니다:
- `@PRD/01_PRD.md`
- `@PRD/02_DATA_MODEL.md`
- `@PRD/04_PROJECT_SPEC.md`

---

## 미결 사항 종합 ([NEEDS CLARIFICATION])

### 비즈니스 결정 필요
- [ ] D2C 쇼핑몰은 별도 URL인지, JAM! 앱 내에 있는지?
- [ ] 배지 공유 카드의 디자인 시스템 / 브랜드 가이드 확정 여부
- [ ] 커뮤니티 피드의 기본 컨텐츠 — 나만 보이는지, 팔로우 기반인지, 전체 공개인지

### 기술 결정 필요
- [ ] Strava API rate limit 처리 정책 (과거 5년치 소급 시)
- [ ] PWA 설치 프롬프트 노출 시점
- [ ] 공유 카드: Satori(서버 사이드) vs html2canvas(클라이언트 사이드)
- [ ] 배지 이미지 에셋 저장: Supabase Storage vs Vercel public

### 데이터 정의 필요
- [ ] 배지 발급 조건 스펙 (condition_json 구조 상세 정의)
- [ ] 아이템 배지 드랍 확률 테이블
- [ ] 이기종 데이터 중복 방지 알고리즘 (Strava + Garmin 동일 활동)
- [ ] 실물 패치 구매 연결 방식 (외부 쇼핑몰 redirect vs 앱 내 결제)

---

## 기술 스택 요약

| 영역 | 선택 |
|------|------|
| 프레임워크 | Next.js 15 (App Router) |
| DB/백엔드 | Supabase (PostgreSQL) |
| 배포 | Vercel |
| 인증 | Supabase Auth + Google OAuth |
| 스타일 | Tailwind CSS 4 |
| 지도 (Phase 2) | Kakao Map API |

---

## JAM! 핵심 철학 (개발 중 항상 기억)

1. **Tracker-less**: 자체 GPS 트래킹 UI 절대 만들지 말 것
2. **10초 첫 보상**: 마찰 제로 온보딩
3. **자립 운영**: 외부 자본 없이 지속 가능한 구조
