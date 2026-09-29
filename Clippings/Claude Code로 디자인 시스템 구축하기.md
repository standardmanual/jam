---
date: "2026-09-29T15:01:16+09:00"
type: "clip"
tags:
link: "https://brunch.co.kr/@0f2edcfe3d1d4c6/56?ref=surfit.io"
status: "no read"
parent:
description: "Figma에 연결한 뒤 AI에게 변수, 컴포넌트, 화면까지 만들기 | *원문을 번역한 글입니다. *원문은 발행 이후 수정될 수 있으며, 본 번역은 발송 시점 기준으로 작성되었습니다.   며칠 전, 한동안 궁금했던 걸 직접 시험해보기로 했습니다. Claude Code를 Figma에 바로 연결한 다음, 실제로 쓸 수 있는 디자인 시스템을 처음부터 만들어 달라고 하면 어떻게 될까요?  간단한 예제를 말하는 게 아닙니다. 버튼 하나"
author:
  - "[[만식]]"
---
Figma에 연결한 뒤 AI에게 변수, 컴포넌트, 화면까지 만들기

by

\*원문을 번역한 글입니다.

\*원문은 발행 이후 수정될 수 있으며, 본 번역은 발송 시점 기준으로 작성되었습니다.

---

며칠 전, 한동안 궁금했던 걸 직접 시험해보기로 했습니다. Claude Code를 Figma에 바로 연결한 다음, 실제로 쓸 수 있는 디자인 시스템을 처음부터 만들어 달라고 하면 어떻게 될까요?

간단한 예제를 말하는 게 아닙니다. 버튼 하나를 만드는 수준도 아닙니다. 프리미티브 컬러, 시맨틱 토큰, 타이포그래피 스케일, 디멘션 토큰을 포함한 전체 변수 시스템부터 시작했습니다. 이어서 120개가 넘는 배리언트를 가진 복잡한 버튼 컴포넌트를 만들고, 마지막에는 방금 만든 디자인 시스템을 활용해 완성된 로그인 화면까지 제작했습니다.

결과는 솔직히 놀라웠습니다. 완벽하게 된 부분도 있었고, 손봐야 하는 부분도 있었습니다. 하지만 전체 워크플로우는 어땠냐고요? 디자인이 앞으로 어디로 향하고 있는지 제대로 보여주는 경험이었습니다.

직접 해볼 수 있도록 전체 과정을 정리했습니다.

## 시작하기 전에 필요한 것

![image.png](https://img1.kakaocdn.net/thumb/R1280x0.fpng/?fname=http://t1.kakaocdn.net/brunch/service/user/hxsO/image/8v3lbYwtBDHcRbeTYBe2gewT5eg.png)

**시작하기 전에 다음을 준비하세요.**

Claude Code 데스크톱 앱(Chat, Code, Agentic 세 가지 모드가 하나로 들어 있는 앱)

유효한 Claude 구독 — 무료 계정으로는 이 워크플로우를 사용할 수 없습니다.

파일을 하나 이상 열어둔 Figma 계정

전체 과정을 진행하는 데 방해받지 않을 약 30~45분

미리 알아둘 점이 하나 있습니다. 이 워크플로우는 Claude 사용량 한도를 소모합니다. 120개 배리언트로 구성된 버튼처럼 복잡한 컴포넌트를 만들면 시간당 사용량 한도를 상당히 많이 사용할 수 있습니다. 처음에는 간단한 작업부터 시작해 과정을 익힌 다음 복잡한 작업으로 넘어가는 편이 좋습니다.

## 1단계: Claude Code 설치하기

![image.png](https://img1.kakaocdn.net/thumb/R1280x0.fpng/?fname=http://t1.kakaocdn.net/brunch/service/user/hxsO/image/VbniY7Pt458CQqp7kxFJY7IOnVI.png)

[claude.ai/download](https://claude.ai/download) 로 이동해 사용하는 OS(Mac 또는 Windows)에 맞는 Claude Code 데스크톱 앱을 다운로드합니다.

설치가 끝나면 인증을 요청합니다. Claude 구독 계정으로 로그인하세요. 로그인이 완료되면 세 가지 기능이 하나로 구성된 Claude 인터페이스가 나타납니다. 이 앱에는 세 가지 모드가 있습니다.

Chat - 일반적으로 대화할 때 사용하는 Claude

Code - 코딩 작업을 위한 모드

Agentic - Figma 작업에서 진짜 재미가 시작되는 모드

이 워크플로우에서는 주로 Agentic 모드를 사용합니다. 이 모드에서는 Claude가 자율적으로 작업을 수행할 수 있으며, Figma 캔버스를 직접 조작하는 것도 가능합니다.

## 2단계: MCP로 Claude와 Figma 연결하기

모든 것을 가능하게 만드는 핵심 단계입니다. MCP(Model Context Protocol) 서버를 사용해 Claude와 Figma를 연결하겠습니다.

**1.** Claude Code 앱에서 Settings로 이동합니다.

**2.** MCP Servers 섹션으로 이동합니다.

**3.** “Add MCP Server”를 클릭합니다.

**4.** 사용 가능한 연동 목록에서 Figma를 선택합니다.

**5.** Figma 계정 인증을 요청하면 OAuth 절차에 따라 진행합니다.

**6.** 연결이 완료되면 Figma가 활성화된 MCP 서버로 표시됩니다.

### 제대로 연결됐는지 확인하는 방법

브라우저에서 Figma 파일을 연 다음 Claude에게 간단하게 물어봅니다.

> “지금 열려 있는 Figma 파일이 보여? 캔버스에 뭐가 있는지 알려줘.”

Claude가 Figma 파일에 있는 내용을 설명할 수 있다면 연결에 성공한 것입니다. 그렇지 않다면 MCP 서버 설정을 다시 확인하고 Figma 파일이 열려 있는지도 확인하세요.

팁: 프롬프트를 입력하기 전에 새 Figma 파일을 만들거나 기존 파일 안에 전용 페이지를 하나 만드는 것이 좋습니다. 이렇게 하면 실험용 작업이 실제 업무 파일과 섞이지 않습니다.

## 3단계: AI로 전체 변수 시스템 구축하기

![image.png](https://img1.kakaocdn.net/thumb/R1280x0.fpng/?fname=http://t1.kakaocdn.net/brunch/service/user/hxsO/image/NeI7LvH_mKtzJpgCEHygMtwpM8A.png)

여기서부터 재미있어집니다. 컬러, 타이포그래피, 스페이싱 변수를 수십 개씩 직접 만드는 대신 Claude에게 전체 토큰 아키텍처를 구축하게 해보겠습니다.

### 사용한 프롬프트

> 내 Figma 파일에 다음 구조로 완전한 디자인 토큰 시스템을 만들어줘.  
>   
> 1\. Primitive Colors — 전체 컬러 스케일을 만들어줘. gray(50–900), primary blue(50–900), secondary green(50–900), error red(50–900), warning amber(50–900), success green(50–900). 업계에서 일반적으로 사용하는 hex 값을 사용해줘.  
>   
> 2\. Semantic Colors — primitive color를 참조하는 semantic layer를 만들어줘. background-primary, background-secondary, text-primary, text-secondary, text-disabled, icon-primary, icon-secondary, border-default, border-strong을 만들어줘. 인터랙티브 요소를 위한 hover와 active 상태도 추가해줘.  
>   
> 3\. Primitive Dimensions — spacing scale을 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80으로 만들어줘. radius scale은 0, 2, 4, 8, 12, 16, 9999(full round)로 만들어줘.  
>   
> 4\. Semantic Typography — display-large, display-medium, heading-1부터 heading-4, body-large, body-medium, body-small, caption, overline을 위한 typography token system을 만들어줘. font family, font size, line height, font weight는 각각 별도의 token으로 구성해줘.  
>   
> Figma text style도 만들고 typography variable과 연결해줘.

> 원문  
> “In my Figma file, create a complete design token system with the following structure:  
>   
> 1\. Primitive Colors — create a full range of colours: grays (50–900), primary blue (50–900), secondary green (50–900), error red (50–900), warning amber (50–900), and success green (50–900). Use industry-standard hex values.  
>   
> 2\. Semantic Colors — create a semantic layer that references the primitive colours: background-primary, background-secondary, text-primary, text-secondary, text-disabled, icon-primary, icon-secondary, border-default, border-strong. Also add hover and active state variants for interactive elements.  
>   
> 3\. Primitive Dimensions — create a spacing scale: 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80. And a radius scale: 0, 2, 4, 8, 12, 16, 9999 (full round).  
>   
> 4\. Semantic Typography — create a typography token system for: display-large, display-medium, heading-1 through heading-4, body-large, body-medium, body-small, caption, and overline. Include font family, font size, line height, and font weight as separate tokens.  
>   
> Also create Figma text styles and map the typography variables to them.”

### 결과

Claude는 요청을 처리한 뒤 제 Figma 파일에서 자율적으로 작업을 시작했습니다. 몇 분 후 Variables 패널을 확인해보니 다음과 같이 구성되어 있었습니다.

Primitive Colors - 전체 컬러 램프가 컬렉션별로 제대로 정리되어 있었습니다.

Semantic Colors - 모든 값이 primitive 컬렉션을 올바르게 참조하고 있었습니다. hex 값을 직접 넣은 것이 아니라 실제 레퍼런스로 연결돼 있었습니다.

Background, text, icon, border 토큰 - hover와 active 상태까지 포함해 제대로 구조화되어 있었습니다.

Typography system - 해당 변수와 연결된 text style까지 완성돼 있었습니다.

Dimension tokens - spacing과 radius 스케일이 바로 사용할 수 있는 상태로 만들어져 있었습니다.

품질은 정말 인상적이었습니다. 시맨틱 토큰이 프리미티브 토큰을 제대로 alias로 참조하고 있어서 primitive color 하나를 변경하면 전체 시스템에 자동으로 반영됩니다. 직접 만든다면 정확히 이런 방식으로 설계했을 텐데, 몇 시간이 아니라 몇 분 만에 끝났습니다.

**개선한다면:** 컬러 값은 브랜드 가이드라인과 대조해 확인하겠습니다. AI는 무난한 기본값을 선택하지만, 여러분의 브랜드 블루가 AI가 선택한 일반적인 블루와 같을 가능성은 낮습니다. 프리미티브 값만 바꾸면 전체 시맨틱 레이어가 자동으로 업데이트됩니다.

## 4단계: 복잡한 버튼 컴포넌트 만들기

이번에는 본격적인 스트레스 테스트였습니다. Claude에게 버튼 컴포넌트를 만들어 달라고 했는데, 단순한 버튼이 아니라 디자인 시스템의 원칙을 제대로 적용한 컴포넌트를 요청했습니다.

### 사용한 프롬프트

> 내 Figma 파일에 다음 사양에 맞는 button component를 만들어줘.  
>   
> Variants: — Type: Primary, Secondary, Tertiary, Danger — Size: Small(32px height), Medium(40px height), Large(48px height) — State: Default, Hover, Active, Disabled — Layout: Label only, Label + Leading icon, Label + Trailing icon, Icon only, Label + Leading icon + Trailing icon  
>   
> Requirements: — 모든 color, spacing, radius에는 방금 만든 variable token을 사용해줘 — dimension token에서 적절한 padding과 gap 값을 가져와 올바르게 auto-layout을 적용해줘 — typography system에서 적절한 text style을 사용해줘 — icon은 간단한 placeholder icon을 사용하되 small은 16x16, medium은 20x20, large는 24x24로 만들어줘 — variant를 쉽게 전환할 수 있도록 component property를 제대로 설정해줘 — naming convention은 Button/\[Type\]/\[Size\]/\[State\]/\[Layout\]으로 만들어줘.”

> 원문  
> “Create a button component in my Figma file with the following specifications:  
>   
> Variants: — Type: Primary, Secondary, Tertiary, Danger — Size: Small (32px height), Medium (40px height), Large (48px height) — State: Default, Hover, Active, Disabled — Layout: Label only, Label + Leading icon, Label + Trailing icon, Icon only, Label + Leading icon + Trailing icon  
>   
> Requirements: — Use the variable tokens we just created for all colours, spacing, and radius — Apply proper auto-layout with appropriate padding and gap values from our dimension tokens — Use the correct text styles from our typography system — For icons, use a simple placeholder icon (16x16 for small, 20x20 for medium, 24x24 for large) — Make sure component properties are properly set up for easy variant switching — Add proper naming convention: Button/\[Type\]/\[Size\]/\[State\]/\[Layout\]”

### 결과

이 작업은 Claude가 처리하는 데 훨씬 오래 걸렸고 사용량 한도도 상당히 많이 소모했습니다. 하지만 작업이 끝났을 때는 120개가 넘는 배리언트로 구성된 완전한 버튼 컴포넌트 세트가 만들어져 있었습니다.

### 잘된 부분

오토 레이아웃 구조가 정확했습니다. 적절한 padding과 gap이 적용됐고 모두 dimension token을 사용하고 있었습니다.

컬러 적용도 정확했습니다. Primary 버튼은 primary color를, Danger 버튼은 error red를 사용했고 모두 semantic token을 참조했습니다.

Text style이 올바르게 적용돼 있었습니다.

배리언트를 전환할 수 있도록 component property도 제대로 설정돼 있었습니다.

네이밍 규칙도 일관적이었습니다.

### 직접 수정해야 했던 부분

아이콘 - Claude는 실제 아이콘을 만드는 데 약합니다. placeholder shape을 만들어주기는 했지만 완벽하지 않았습니다. 간단한 별이나 화살표 아이콘을 지정하고 해당 형태를 사용하라고 구체적으로 요청하는 편을 추천합니다.

Loading state - 로딩 스피너 위치가 어긋나 있었습니다. absolute positioning과 관련된 문제였고 수동으로 금방 수정할 수 있었습니다.

일부 padding 불일치 - 몇몇 배리언트에서 padding 값이 조금씩 달랐습니다. 2분 정도면 정리할 수 있는 수준이었습니다.

**솔직한 평가:** 모든 배리언트, 올바른 토큰 적용, 오토 레이아웃까지 포함해 제가 처음부터 만들었다면 보통 2~3시간은 걸렸을 컴포넌트입니다. Claude는 그 작업의 약 85%를 제대로 처리했습니다. 나머지 15%는 간단한 수작업으로 다듬으면 됐습니다. 전체적으로 절약한 시간은 상당했습니다.

## 5단계: 디자인 시스템을 활용해 화면 디자인하기

마지막 테스트입니다. Claude가 방금 만든 디자인 시스템을 사용해 실제 화면까지 디자인할 수 있을까요?

이번에는 Claude에게 로그인 페이지를 만들어 달라고 요청했습니다. 여기서 핵심은 모든 것을 새로 만드는 것이 아니라 이미 만들어둔 컴포넌트와 변수를 사용하게 하는 것이었습니다.

### 사용한 프롬프트

> 우리가 만든 design system을 사용해서 내 Figma 파일에 login screen을 디자인해줘. 다음 사양을 따라줘.  
>   
> \- Frame: 1440x900 desktop size — Layout: Split screen — 왼쪽에는 브랜드 visual/illustration 영역, 오른쪽에는 login form — 오른쪽 form 구성: 상단 logo placeholder, “Welcome back” heading(heading-2 text style 사용), email input field, show/hide toggle이 있는 password input field, “Forgot password?” text link, primary login button(우리 button component의 large size, primary type 사용), “Or continue with” divider, social login button(Google, Apple), 하단 “Don’t have an account? Sign up” text — 모든 color, spacing, typography에 우리 variable token을 사용 — 전체에 올바른 auto-layout을 적용 — 왼쪽 영역: background-secondary color를 사용하고 중앙에 illustration placeholder를 배치”

> 원문  
> “Design a login screen in my Figma file using the design system we’ve created. Use the following specifications:  
>   
> \- Frame: 1440x900 desktop size — Layout: Split screen — left side with a branded visual/illustration area, right side with the login form — Right side form includes: Logo placeholder at top, “Welcome back” heading (use heading-2 text style), email input field, password input field with show/hide toggle, “Forgot password?” text link, primary login button (use our button component — large size, primary type), “Or continue with” divider, social login buttons (Google, Apple), “Don’t have an account? Sign up” text at bottom — Use our variable tokens for all colours, spacing, and typography — Apply proper auto-layout throughout — Left side: Use background-secondary colour with a centered placeholder for illustration”

### 결과

Claude는 완성된 로그인 화면을 만들어냈습니다. 전체적인 레이아웃은 탄탄했습니다. split-screen 구조가 제대로 잡혀 있었고 폼도 잘 정리돼 있었으며, 화면 전반에서 우리가 만든 디자인 토큰을 사용했습니다.

### 인상적이었던 부분

버튼처럼 보이도록 새 사각형을 만든 것이 아니라 실제로 우리가 만든 버튼 컴포넌트를 사용했습니다.

타이포그래피 위계도 정확했습니다. heading, body, caption 모두 기존 시스템의 text style을 사용했습니다.

spacing도 일관적이었고 dimension token을 적용했습니다.

전체 구성이 전문적이었고 실제 제품에 적용할 수 있는 수준의 기반을 갖추고 있었습니다.

오토 레이아웃도 제대로 적용돼 있어 반응형으로 발전시키기 좋은 구조였습니다.

### 조정이 필요했던 부분

소셜 로그인 버튼의 시각적인 완성도를 조금 더 다듬어야 했습니다.

왼쪽 illustration placeholder는 예상대로 단순했습니다.

폼의 spacing과 alignment를 약간 조정해야 했습니다.

하지만 기본 구조는 탄탄했습니다. 버리고 다시 만들어야 할 목업이 아니라, 조금 다듬어서 실제로 사용할 수 있는 결과물이었습니다.

## 솔직한 결론

![image.png](https://img1.kakaocdn.net/thumb/R1280x0.fpng/?fname=http://t1.kakaocdn.net/brunch/service/user/hxsO/image/GTTR4gvz8ugr3RLtc4xmGI4NkIc.png)

이 워크플로우를 오후 내내 사용해본 뒤 내린 결론은 이렇습니다.

### Claude + Figma가 특히 잘하는 것

Variable/token system - AI가 정말 강한 영역입니다. 직접 만들면 몇 시간이 걸릴 전체 토큰 아키텍처를 몇 분 만에 만들 수 있고 구조도 정확합니다.

Component scaffolding - 복잡한 컴포넌트의 기본 구조를 올바른 오토 레이아웃, 프로퍼티, 토큰 사용 방식까지 포함해 만들어주기 때문에 엄청난 시간을 절약할 수 있습니다.

Screen composition - 기존 디자인 시스템의 컴포넌트와 토큰을 활용해 구조적인 레이아웃을 만드는 작업은 실제로 상당히 유용합니다.

Design system consistency - 프롬프트에서 규칙을 미리 정의하기 때문에 Claude는 많은 디자이너가 직접 작업하는 것보다 더 일관되게 규칙을 적용합니다.

### 아직 부족한 부분

시각적 디테일 - AI에는 아직 감각이 없습니다. 결과물의 구조는 정확하지만 디자인을 세련돼 보이게 만드는 섬세한 디테일은 부족합니다.

아이콘과 일러스트레이션 - Claude는 제대로 된 아이콘을 만드는 데 약합니다. 항상 참고할 아이콘을 제공하거나 플러그인을 사용하는 편이 좋습니다.

사용량 한도 - 복잡한 컴포넌트는 Claude 사용량을 빠르게 소모합니다. 작업 세션을 전략적으로 계획해야 합니다.

예상치 못한 positioning - 일부 absolute positioning과 overflow 처리는 직접 정리해야 합니다.

### 결론

이 워크플로우가 디자인 사고 자체를 대신하지는 않습니다. 하지만 실행 단계에 들어가는 시간을 극적으로 줄여줍니다. 디자인 시스템 구축에 필요한 기계적인 작업의 70~85% 정도는 처리해준다고 봅니다. 덕분에 전략, 사용자 플로우, 엣지 케이스, 시각적인 완성도처럼 실제로 중요한 의사결정에 더 많은 시간을 쓸 수 있습니다.

이 워크플로우를 일찍 익힌 디자이너는 분명 속도 면에서 큰 이점을 얻게 될 겁니다. 디자인의 완성도를 포기해서가 아니라, 자신의 역량을 제대로 써야 할 부분에 집중할 수 있기 때문입니다.

---

### 빠르게 참고하기: 프롬프트 팁

여러 방식으로 충분히 실험해본 결과, Claude + Figma에서 가장 효과적이었던 프롬프트 패턴은 다음과 같습니다.

토큰 사용을 명확하게 지시하기 - 항상 “우리가 만든 variable token을 사용해”라고 말하세요. 그렇지 않으면 Claude가 값을 직접 하드코딩할 수 있습니다.

네이밍 규칙을 지정하기 - Claude는 여러분이 정한 네이밍 패턴을 그대로 따릅니다. 구체적으로 지정하지 않으면 이름이 일관되지 않을 수 있습니다.

복잡한 작업은 단계별로 나누기 - variable + component + screen을 한 프롬프트에서 한꺼번에 요청하지 마세요. 순서대로 나눠서 진행하세요.

기존 요소를 구체적으로 참조하기 - 이미 있는 요소를 재사용하고 싶다면 “button을 만들어줘”가 아니라 “우리 button component를 사용해”라고 말하세요.

치수를 명확하게 지정하기 - “medium size”라고만 하는 것보다 “height 40px, vertical padding 12px, horizontal padding 16px”라고 지정하는 편이 훨씬 낫습니다.

항상 결과를 검토하기 - Variables 패널, Layers 패널, component property를 확인하세요. AI는 전체 구조는 잘 만들지만 세부 사항은 사람이 확인해야 합니다.

## 다음은 무엇일까

이건 시작에 불과합니다. Figma의 MCP 연동이 더 성숙하고 Claude가 디자인 의도를 더 잘 이해하게 된다면 앞으로는 다음과 같은 워크플로우도 가능할 것 같습니다.

사용자 플로우를 자연어로 설명하면 연결된 전체 화면 세트가 생성됩니다.

디자인 시스템 감사가 자동으로 이루어져 Claude가 모든 프레임의 토큰 준수 여부를 검사합니다.

컴포넌트를 만들면서 관련 문서도 함께 자동 생성됩니다.

디자인과 동시에 핸드오프 스펙이 실시간으로 만들어집니다.

아직 그 단계까지 온 것은 아닙니다. 하지만 이번 실험을 해보고 나니, 대부분의 디자이너가 생각하는 것보다 훨씬 가까이 와 있다는 확신이 들었습니다.

이 워크플로우를 직접 시도해본다면 무엇을 만들었는지 듣고 싶습니다. 무엇이 잘됐고, 무엇이 망가졌고, 무엇이 예상 밖이었는지 댓글로 경험을 공유해주세요.
