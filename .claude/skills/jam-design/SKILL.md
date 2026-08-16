---
name: jam-design
description: JAM! 디자인 시스템 MODULAR과 Storybook 카탈로그를 탐색해 기존 컴포넌트 재사용 여부를 판단하고, 신규 UI가 필요할 때 MODULAR 확장 vs 서비스 전용 구현을 결정한다. UI·화면·컴포넌트를 새로 만들거나 고칠 때, "이런 컴포넌트 있어?", "디자인 시스템에 추가할까?", "Storybook 확인해줘" 같은 요청에 사용.
---

# jam-design — MODULAR 탐색 및 재사용 판단

MODULAR은 JAM!의 디자인 시스템 단일 진실 원천(`jam-web/design-system/`), Storybook은 그 실행 가능한
카탈로그다. **UI 작업의 시작점은 항상 이 탐색이다.**

## 1. 탐색 — 무엇이 이미 있는지 먼저 본다

에이전트가 쓸 검색 입구는 웹 UI가 아니라 파일이다. 순서대로:

| 순서 | 대상 | 용도 |
|---|---|---|
| 1 | `jam-web/design-system/_ds_manifest.json` | 컴포넌트 전체 색인 (기계 판독용) |
| 2 | `jam-web/design-system/readme.md` §색인 | 분류별 목록 + 파운데이션 설명 |
| 3 | `jam-web/**/*.stories.*` | 실제 변형(variant)·props·사용례 |
| 4 | `jam-web/design-system/components/{분류}/` | 구현체와 `.d.ts`, `.prompt.md` |
| 5 | Storybook 웹 (`npm run storybook`, :6006) | **사람이 눈으로 확인할 때만** |

컴포넌트 분류: `buttons` · `cards` · `feedback` · `forms` · `navigation` · `patterns`
파운데이션: `tokens/`(colors·typography·spacing·radius·motion·fonts) · `guidelines/`

## 2. 판단 — 재사용 / 확장 / 서비스 전용

```
새 UI 요구
   ↓
기존 컴포넌트로 해결되는가?
   ├─ YES ─────────────────────────────→ 그대로 재사용 (신규 생성 금지)
   └─ NO
        ↓
      기존 컴포넌트에 props/variant 추가로 해결되는가?
        ├─ YES ──────────────────────→ MODULAR 확장 + Story 추가
        └─ NO
             ↓
           아래 "MODULAR 승격 기준"을 충족하는가?
             ├─ YES ─────────────────→ MODULAR 신규 컴포넌트 + Story 필수
             └─ NO ──────────────────→ 서비스 전용(service-specific)으로 구현
```

### MODULAR 승격 기준 (하나라도 아니면 서비스 전용)

- **재사용성**: 2개 이상의 화면·맥락에서 쓰이거나 쓰일 것이 명확한가
- **범용성**: 특정 도메인 데이터(배지 id, 미션 상태 등)에 결합돼 있지 않은가
- **안정성**: 디자인이 확정됐는가 (실험 중인 UI는 서비스 전용으로 두고 안정화 후 승격)
- **토큰 준수**: 색상·간격·타이포를 `tokens/` 변수로만 표현할 수 있는가

### 예외 — 어드민

`jam-web/src/app/admin/`은 MODULAR 적용 대상이 아니다 (정책 결정). 어드민 UI는 이 트리를 타지 않고
바로 서비스 전용으로 구현한다.

## 3. MODULAR을 수정·추가했다면

```
MODULAR 변경 → 컴포넌트 반영 → Story 작성/수정 → Storybook 확인 → 커밋
```

- **Story는 선택이 아니라 의무다.** `design-system/components/**` 변경 시 대응 `*.stories.*`가
  함께 변경되지 않으면 `.githooks/pre-commit`이 경고한다.
- 새 컴포넌트는 `.d.ts` 타입 정의와 Story를 함께 제공한다.
- 토큰을 새로 추가했으면 `tokens/`와 `guidelines/`에 반영한다.
- 사용자 노출 문구가 있으면 `Service Plan/Specs/UX_WRITING_GUIDELINE.md`를 확인한다.

## 4. 선순환

```
서비스 개발 → (재사용 못 하면) MODULAR 확장 → Storybook 등록 → 다음 서비스 개발에서 재사용
                                                      ↑
              서비스 전용으로 만든 UI가 반복 사용되면 ─┘ MODULAR 승격 검토
```

`/jam-work`의 progressive-reviewer가 "이 서비스 전용 UI는 MODULAR 승격 가치가 있다"를 제안하므로,
역방향 흐름은 리뷰 단계에서 자동으로 포착된다.

## 참고 문서

- `jam-web/design-system/readme.md` — 파운데이션·폰트 설정·색인
- `jam-web/docs/storybook/` — 아키텍처(03), 접근성 감사(09), 컴포넌트 후보(08), 빌드 리포트(12)
- `Service Plan/History/Migration/ModulerTicket/` — MODULAR 개선 티켓 (DS-NNN)
