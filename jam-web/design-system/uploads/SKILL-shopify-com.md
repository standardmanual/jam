---
name: design-shopify-com
description: Design system extracted from Shopify (https://www.shopify.com/shop?utm_medium=website&utm_source=shop-website&utm_campaign=shop_app_footer_for_brands). Use when building UI that should match this brand's visual identity.
triggers:
  - "Shopify"
  - "shopify-com"
  - "design like Shopify"
  - "Shopify風"
source: https://www.shopify.com/shop?utm_medium=website&utm_source=shop-website&utm_campaign=shop_app_footer_for_brands
extractedAt: 2026-08-13T07:50:06.426Z
tags: ["light", "rounded", "accented", "bold-typography", "sans-serif"]
---
# Design System Inspired by Shopify

> Auto-extracted from `https://www.shopify.com/shop?utm_medium=website&utm_source=shop-website&utm_campaign=shop_app_footer_for_brands` on 2026-08-13

## 1. Visual Theme & Atmosphere

Friendly, approachable design with rounded shapes and generous whitespace.

The hero section leads with "Reach the world’s best Shoppers" followed by "Sell to millions of high-intent shoppers on Shop. Just by joining Shopify.".

**Key Characteristics:**
- Inter-Variable as the heading font
- Inter-Variable as the body font for all running text
- Heading weight 300, letter-spacing -2.4px
- Light/white background (#ffffff) as the primary canvas
- Primary accent `#5433eb` used for CTAs and brand highlights
- 3 shadow level(s) detected — tinted shadows
- Rounded corners (8px+) creating a friendly, approachable feel
- Tags: light, rounded, accented, bold-typography, sans-serif

## 2. Color Palette & Roles

### Primary
- **Primary Accent** (`#5433eb`) · `--color-primary`: Brand color, CTA backgrounds, link text, interactive highlights.
- **Secondary Accent** (`#008060`) · `--color-secondary`: Secondary brand, hover states, complementary highlights.
- **Background** (`#ffffff`) · `--color-bg`: Page background, primary canvas.
- **Background Secondary** (`#000000`) · `--color-bg-secondary`: Cards, surfaces, alternating sections.

### Text
- **Text Primary** (`#000000`) · `--color-text`: Headings and body text.
- **Text Secondary** (`#666666`) · `--color-text-secondary`: Muted text, captions, placeholders.

### Borders & Surfaces
- **Border** (`#e5e5e5`) · `--color-border`: Dividers, outlines, input borders.

### Full Extracted Palette

| # | Hex | CSS Variable | Role | Area | Contrast |
|---|---|---|---|---|---|
| 1 | `#ffffff` | `--palette-1` | button | large | text-dark |
| 2 | `#000000` | `--palette-2` | button | large | text-light |
| 3 | `#5433eb` | `--palette-3` | button | medium | text-light |
| 4 | `#008060` | `--palette-4` | text-accent | small | text-light |

## 3. Typography Rules

- **Heading Font:** `Inter-Variable`, sans-serif
- **Body Font:** `Inter-Variable`, sans-serif

### Type Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing |
|---|---|---|---|---|---|
| H1 | Inter-Variable | 96px | 300 | 103.68px | -2.4px |
| H2 | Inter-Variable | 56px | 330 | 60.48px | -0.56px |
| H3 | Inter-Variable | 24px | 400 | 31.2px | -0.24px |
| H4 | Inter-Variable | 28px | 360 | 33.6px | -0.28px |
| Body | Inter-Variable | 16px | 400 | 24px | normal |
| Small | Inter-Variable | 14px | 400 | 20px | normal |

### Type Scale

| Token | Size | Suggested Usage |
|---|---|---|
| Display | `96px` | headings |
| H1 | `56px` | headings |
| H2 | `44px` | headings |
| H3 | `28px` | headings |
| H4 | `24px` | headings |
| Body L | `20px` | body / supporting text |
| Body | `18.2858px` | body / supporting text |
| Small | `18px` | body / supporting text |
| XS | `16px` | body / supporting text |
| Caption | `14px` | body / supporting text |

## 4. Component Stylings

### Primary Button

```css
.btn-primary {
  background: #ffffff;
  color: #000000;
  border-radius: 9999px;
  padding: 8px 20px;
  font-size: 16px;
  font-weight: 400;
  border: 2px solid rgba(0, 0, 0, 0);
  cursor: pointer;
}
```

### Ghost Button

```css
.btn-ghost {
  background: transparent;
  color: #18181b;
  border-radius: 0px;
  padding: 0px 0px;
  font-size: 14px;
  font-weight: 400;
  border: none;
  cursor: pointer;
}
```

### Pill Button

```css
.btn-pill {
  background: transparent;
  color: #000000;
  border-radius: 9999px;
  padding: 8px 13px;
  font-size: 16px;
  font-weight: 400;
  border: 2px solid rgb(212, 212, 216);
  cursor: pointer;
}
```

### Pill Button 2

```css
.btn-pill-2 {
  background: #000000;
  color: #ffffff;
  border-radius: 9999px;
  padding: 8px 20px;
  font-size: 16px;
  font-weight: 400;
  border: 2px solid rgba(0, 0, 0, 0);
  cursor: pointer;
}
```

### Ghost Button 2

```css
.btn-ghost-2 {
  background: transparent;
  color: #000000;
  border-radius: 0px;
  padding: 0px 0px;
  font-size: 16px;
  font-weight: 400;
  border: none;
  cursor: pointer;
}
```

### Pill Button 3

```css
.btn-pill-3 {
  background: #5433eb;
  color: #ffffff;
  border-radius: 9999px;
  padding: 12px 24px;
  font-size: 18px;
  font-weight: 400;
  border: 2px solid rgba(0, 0, 0, 0);
  cursor: pointer;
}
```

### Card

```css
.card {
  background: #5433eb;
  border-radius: 48px;
  padding: 128px;
}
```

## 5. Layout Principles

- **Base spacing unit:** `10px` — use multiples (20px, 30px, 40px, etc.)

### Spacing Scale (extracted from real elements)

| Token | Value | Role |
|---|---|---|
| spacing-1 | `10px` | element |
| spacing-2 | `8px` | element |
| spacing-3 | `40px` | card |
| spacing-4 | `12px` | element |
| spacing-5 | `16px` | element |
| spacing-6 | `128px` | section |
| spacing-7 | `80px` | section |
| spacing-8 | `24px` | card |

### Border Radius Scale

| Token | Value | Element |
|---|---|---|
| radius-button | `8px` | button |
| radius-card | `16px` | card |
| radius-button | `12px` | button |
| radius-card | `48px` | card |
| radius-subtle | `4px` | subtle |
| radius-button | `10px` | button |

## 6. Depth & Elevation

| Level | Shadow | Usage |
|---|---|---|
| Low | `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0...` | Cards, subtle elevation |
| Low | `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0...` | Cards, subtle elevation |
| Low | `rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 0px, rgba(0, 0, 0...` | Cards, subtle elevation |


## 7. Do's and Don'ts

### Do
- Use `#ffffff` as the primary background color
- Use `Inter-Variable` for all headings and `Inter-Variable` for body text
- Use `#5433eb` as the single dominant accent/CTA color
- Maintain `10px` as the base spacing unit — all gaps should be multiples
- Use rounded corners (`8px`+) consistently for all interactive elements
- Make headlines large and bold — typography is the hero element
- Apply the shadow system for elevation — use the extracted shadow values
- Use weight 300 for headings to match the brand's typographic voice

### Don't
- Don't use colors outside the extracted palette without justification
- Don't substitute Inter-Variable/Inter-Variable with generic alternatives
- Don't use irregular spacing — stick to 10px grid
- Don't use dark/black backgrounds — this is a light-themed design
- Don't use sharp corners — they feel hostile in this rounded design language
- Don't use pure black (#000000) for text — use `#000000` instead
- Don't add decorative elements not present in the original design — no badges, ribbons, banners, or ornaments unless the source site uses them
- Don't invent UI patterns the source site doesn't have — if the original has no NEW badge, don't add one just because a red is in the palette

## 8. Responsive Behavior

| Breakpoint | Width | Notes |
|---|---|---|
| Mobile | < 640px | Single column, stack sections, reduce font sizes ~80% |
| Tablet | 640–1024px | 2-column where appropriate, maintain spacing ratios |
| Desktop | 1024–1440px | Full layout as designed |
| Wide | > 1440px | Max-width container, center content |

- Touch targets: minimum 44×44px on mobile
- Maintain 10px base unit across breakpoints — only scale multipliers

## 9. Agent Prompt Guide

### Quick Color Reference

```
Background:  #ffffff
Text:        #000000
Accent:      #5433eb
Secondary:   #008060
Border:      #e5e5e5
```

### Example Prompts

1. "Build a hero section with a `#ffffff` background, `Inter-Variable` heading in `#000000`, and a `#5433eb` CTA button with 9999px radius."
2. "Create a pricing card using background `#000000`, border `#e5e5e5`, `Inter-Variable` for text, and 30px padding."
3. "Design a navigation bar — `#ffffff` background, `#000000` links, `#5433eb` for active state."
4. "Build a feature grid with 3 columns, 30px gap, each card using the card component style."
5. "Create a footer with `#000000` background, `#ffffff` text, and 20px padding."

### Iteration Guide

1. Start with layout structure (sections, grid, spacing)
2. Apply colors from the palette — background first, then text, then accents
3. Set typography — font families, sizes from the type scale, weights
4. Add components — buttons, cards, inputs using the specs above
5. Apply border-radius consistently across all elements
6. Add shadows for depth — use the extracted shadow values, not defaults
7. Check responsive behavior — test mobile and tablet layouts
8. Final pass — verify all colors match, spacing is consistent, fonts are correct
