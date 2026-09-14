# 도메인 문서

탐색 전에 어떤 문서를 읽어야 하는지에 대한 지침. 이 저장소는 `CONTEXT.md`/`docs/adr` 체계를
쓰지 않고, `Service Plan/Specs/`의 5개 카테고리 문서 체계를 domain doc으로 사용한다.

## 탐색 전에 먼저 읽을 것

서비스 전체를 파악해야 할 때 코드부터 탐색하지 않는다. 아래 순서로 읽는다.

1. `Service Plan/Tickets/`의 관련 최신 티켓 (유사 작업·의사결정 확인)
2. `Service Plan/Specs/PRD/01_PRD.md` (필요 시 `02_DATA_MODEL.md`, 주제별 폴더 `PRD/{주제}/`)
3. `Service Plan/Specs/Content/` (배지·아이템·트라이브·POI 관련 시)
4. `Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md` (배지·드랍 로직 관련 시)
5. 위에서 찾지 못한 경우에만 코드(`jam-web/src/`) 탐색

## 파일 구조

```
/
├── Service Plan/
│   ├── Specs/
│   │   ├── PRD/            ← 기능·스펙·로직 정의 (현재 상태, 덮어쓰기)
│   │   ├── Content/        ← 배지·아이템북·트라이브·POI 정의
│   │   ├── BadgeEngine/    ← 배지 발급·드랍 판정 로직
│   │   └── (루트)          ← UX_WRITING_GUIDELINE 등 횡단 참조 문서
│   ├── Tickets/            ← 작업 이력 (신규 생성, 지식베이스로 계속 검색됨)
│   ├── Business/서비스플랜/ ← 비전·장기 전략 (덮어쓰기)
│   └── Archive/            ← 폐기된 기록 (읽기 전용, 현재 상태 판단 근거로 삼지 않음)
└── jam-web/src/
```

## 용어 사용

출력에서 도메인 개념을 지칭할 때(티켓 제목, 리팩터 제안, 테스트 이름 등) `Specs/PRD`와
`Specs/Content`에 정의된 용어를 그대로 쓴다. 문서가 피하는 동의어로 임의로 바꾸지 않는다.

## 문서 충돌 시

출력이 기존 PRD·배지엔진 문서와 상충하면 조용히 덮어쓰지 말고 명시적으로 알린다.

> _`Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md`의 판정 로직과 상충하지만, ~한 이유로 재검토가
> 필요할 수 있다._

## 문서 체계 갱신 절차

문서 작성 규칙·파일명 규칙·필수 항목은 `/jam-docs` 스킬을 따른다.
