# JAM! 디자인 리뉴얼 — 디자인 문서

> Show Me The PRD로 생성됨 (2026-07-29, Enhancement Mode)
> 레퍼런스: `Reference/designmd/SuperHighPlus DESIGN.md`

## 문서 구성

| 문서 | 내용 | 언제 읽나 |
|------|------|----------|
| [Design_Phase01_01_PRD.md](./Design_Phase01_01_PRD.md) | 리뉴얼 목적, 범위, 성공 기준, 안 만드는 것 | 작업 시작 전 |
| [Design_Phase01_02_DATA_MODEL.md](./Design_Phase01_02_DATA_MODEL.md) | 신규 설정 데이터 구조 (테마 컬러, 상태 팔레트, i18n) | 신규 테이블/딕셔너리 설계 시 |
| [Design_Phase01_03_PHASES.md](./Design_Phase01_03_PHASES.md) | Phase 1(공통 컴포넌트) → Phase 2(화면 순차 적용) → Phase 3(BottomSheet+어드민 테마) | 개발 순서 정할 때 |
| [Design_Phase01_04_PROJECT_SPEC.md](./Design_Phase01_04_PROJECT_SPEC.md) | HIG 준수 규칙, 디자인 토큰 규칙, i18n 규칙, 절대 하지 마 목록 | AI에게 코드를 시킬 때마다 |

## 확정된 핵심 결정 사항 (인터뷰 결과)

1. **상태 색상 예외**: 배지 희귀도/카테고리 색상은 어드민이 관리하는 별도 상태 팔레트로 예외 허용. 그 외 화면은 코발트/아이스 바이너리 유지.
2. **상태 팔레트 색상값**: 기존 `jam-lime/teal/purple/yellow`를 재조정 없이 그대로 재사용 — 유저가 이미 학습한 희귀도 색 연상을 보존.
3. **이모지 교체 범위**: 배지/아이템북에 등록된 실제 이미지는 유지, 그 외 UI 이모지(빈 상태, 네비 등)는 전부 SVG 아이콘으로 교체.
4. **적용 순서**: 공통 컴포넌트(TopNav/TabBar/Card/Button) 우선 → 프로필(마이페이지) → 투데이(홈) → 배지 목록/상세 → 인벤토리/드랍/미션.
5. **다국어 범위**: 이번 Phase는 i18n 키-값 딕셔너리 구조만 준비, 실제 번역(en 등)은 나중.
6. **어드민 테마 구조**: 싱글턴이 아닌 `theme_presets` 다중 프리셋 + `is_active` 플래그 — 시즌 이벤트 컬러를 미리 만들어두고 전환만 가능. 전환은 **즉시 적용만** 지원(예약 발행 없음). 컬러피커 + 실시간 미리보기 UI (Phase 3).
7. **웹폰트**: Pretendard Variable CDN import (`pretendard@v1.3.9`), self-host 전환 없음.
8. **상태 팔레트 어드민 UI**: 희귀도 4개(`common`/`rare`/`legendary`/`mythic`) 고정 슬롯, 색상값만 수정 가능 — 슬롯 자유 추가/삭제 불가 (rarity enum과의 불일치 방지).
9. **테마 방향**: 다크 테마 고정 유지. 단 색상 토큰을 시맨틱 이름으로 설계해 향후 라이트 테마 확장 구조만 미리 준비 (실제 라이트 테마 구현은 범위 밖).
10. **RLS 정책**: `theme_presets`/`state_color_palette` 모두 전체 유저 SELECT + admin만 쓰기 — 기존 어드민 테이블과 동일 패턴.

## 다음 단계

Phase 1을 시작하려면 [Design_Phase01_03_PHASES.md](./Design_Phase01_03_PHASES.md)의 "Phase 1 시작 프롬프트"를 참고하세요.

## 미결 사항 종합

- `state_color_palette`의 `scope` 종류를 희귀도/카테고리 외 어디까지 미리 정의할지 (팩션, POI 카테고리 등) — Phase 2 착수 시점에 재검토.
