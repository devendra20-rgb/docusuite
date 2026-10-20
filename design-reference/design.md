# DocuSuite — Precision Document Studio Design Specification

```yaml
name: Precision Document Studio
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#5c3f40'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#906f70'
  outline-variant: '#e5bdbe'
  surface-tint: '#be0037'
  primary: '#b80035'
  on-primary: '#ffffff'
  primary-container: '#e11d48'
  on-primary-container: '#fffaf9'
  inverse-primary: '#ffb3b6'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#62595a'
  on-tertiary: '#ffffff'
  tertiary-container: '#7b7172'
  on-tertiary-container: '#fff9f9'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdada'
  primary-fixed-dim: '#ffb3b6'
  on-primary-fixed: '#40000c'
  on-primary-fixed-variant: '#920028'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#eddfe0'
  tertiary-fixed-dim: '#d0c3c5'
  on-tertiary-fixed: '#211a1b'
  on-tertiary-fixed-variant: '#4d4546'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.025em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.005em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  margin-desktop-wide: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
```

## Brand & Aesthetic Principles

The design system establishes a high-performance, distraction-free environment for document manipulation, conversion, and workflow automation. It caters to knowledge workers, students, legal operators, and researchers who demand immediate clarity, swift execution, and absolute confidence when processing critical files.

The design movement combines **Minimalism** with **Modern Tactile Utility**:
- **Pristine Canvas:** Pure white and soft slate foundation surfaces prevent cognitive fatigue and keep direct attention on document artifacts.
- **Architectural Accents:** A focused crimson red serves strictly as an intentional functional accent for primary actions, critical signals, and verified progression, steering clear of noisy, over-saturated layouts.
- **Micro-tactility:** Interactive zones, file targets, and tool cards balance structural boundary lines with featherlight ambient drop shadows to produce an intuitive, responsive working surface.

---

## Palette Architecture

- **Primary (`#E11D48`):** Ruby Crimson. Drives primary workflow triggers, convert buttons, batch actions, and high-priority active markers.
- **Secondary (`#0F172A`):** Deep Slate Ink. Establishes primary typography, tool icons, system bars, and structural anchors.
- **Tertiary (`#FFF1F2`):** Rose Tint Surface. Acts as contextual support for active tool toggles, drag-hover highlights, and soft warnings.
- **Neutral (`#64748B`):** Cool Slate. Anchors secondary body text, metadata, subtle borders, and inactive visual scaffolding.

### Functional & Surface Tokens
- **Canvas Base:** `#FFFFFF`
- **Surface Muted:** `#F8FAFC` (Panels, empty workspace trays)
- **Surface Subdued:** `#F1F5F9` (Hover states, segmented rail switchers)
- **Border Default:** `#E2E8F0` (Structural containers, cards, tables)
- **Border Subtle:** `#F1F5F9` (Internal component separators)
- **State - Success:** `#16A34A` (Background: `#F0FDF4`, Border: `#BBF7D0`)
- **State - Processing:** `#2563EB` (Background: `#EFF6FF`, Border: `#BFDBFE`)
- **State - Error:** `#DC2626` (Background: `#FEF2F2`, Border: `#FECACA`)

---

## Typography Hierarchy Rules

- **Headings & Display:** `Plus Jakarta Sans`. Titles above 20px enforce negative tracking (`-0.01em` down to `-0.03em`) to maintain sharp, compact visual rhythm.
- **Body & Data:** `Inter`. File names, timestamps, technical indicators, and file sizes rely exclusively on `body-sm` and `label-md` using tabular numerical alignment where relevant.
- **Badges & Tags:** Uppercase text is strictly limited to `label-sm` when designating tool file-format tags (e.g., `PDF`, `DOCX`, `XLSX`).

---

## Elevation & Depth

- **Level 0 (Base Canvas):** `#FFFFFF` flat surface.
- **Level 1 (Tool Cards & Utility Blocks):** Surface `#FFFFFF`, bordered by 1px solid `#E2E8F0`, with `box-shadow: 0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.03)`.
- **Level 2 (Active Dropzones, File Previews, Dropdowns):** Surface `#FFFFFF`, bordered by 1px solid `#E2E8F0`, with `box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.04)`. Hover transitions shift down to a subtle ruby-tinted glow (`rgba(225, 29, 72, 0.08)`).
- **Level 3 (Modal Sheets & Document Viewers):** Surface `#FFFFFF`, bordered by 1px solid `#E2E8F0`, with `box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04)`.

---

## Component Standards

### Buttons
- **Primary:** Background `#E11D48`, text `#FFFFFF`, border none, radius `0.75rem`, padding `0.625rem 1.25rem`. Hover: `#BE123C`. Active: `#9F1239`. Focus: outline 2px solid `#E11D48` offset 2px.
- **Secondary:** Background `#FFFFFF`, text `#0F172A`, border 1px solid `#E2E8F0`, radius `0.75rem`. Hover: Background `#F8FAFC`, border `#CBD5E1`.
- **Subtle / Ghost:** Background transparent, text `#64748B`, radius `0.5rem`. Hover: Background `#F1F5F9`, text `#0F172A`.

### Drag-and-Drop Dropzones
- **Resting:** Background `#F8FAFC`, border 2px dashed `#CBD5E1`, border-radius `1.5rem`, inner padding `3rem 2rem`. Centered crimson icon badge in `#FFF1F2`.
- **Drag-Over:** Background `#FFF1F2`, border 2px dashed `#E11D48`, scale transform `1.005`, transitional ease 150ms.
- **Error Drop:** Background `#FEF2F2`, border 2px dashed `#DC2626`.
