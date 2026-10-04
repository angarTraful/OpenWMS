---
name: Data Core Narrative
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#cdc3d4'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#978d9d'
  outline-variant: '#4b4452'
  surface-tint: '#dab9ff'
  primary: '#dab9ff'
  on-primary: '#460283'
  primary-container: '#bb86fc'
  on-primary-container: '#4c0f89'
  inverse-primary: '#7743b5'
  secondary: '#ffb1c5'
  on-secondary: '#65002f'
  secondary-container: '#8b0e45'
  on-secondary-container: '#ff95b4'
  tertiary: '#75d1ff'
  on-tertiary: '#003548'
  tertiary-container: '#2aaadd'
  on-tertiary-container: '#003b50'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#eedbff'
  primary-fixed-dim: '#dab9ff'
  on-primary-fixed: '#2a0053'
  on-primary-fixed-variant: '#5e289b'
  secondary-fixed: '#ffd9e1'
  secondary-fixed-dim: '#ffb1c5'
  on-secondary-fixed: '#3f001b'
  on-secondary-fixed-variant: '#8b0e45'
  tertiary-fixed: '#c2e8ff'
  tertiary-fixed-dim: '#75d1ff'
  on-tertiary-fixed: '#001e2b'
  on-tertiary-fixed-variant: '#004d67'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: 0.05em
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 10px
    fontWeight: '400'
    lineHeight: 14px
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  margin-page: 1rem
  gutter-list: 0.5rem
  stack-sm: 0.25rem
  stack-md: 1rem
  stack-lg: 1.5rem
  touch-target: 3rem
---

## Brand & Style

The design system is engineered for high-density data management, logistics, and inventory oversight. It prioritizes utility and immediate legibility in fast-paced professional environments. 

The aesthetic is **Corporate Modern with a Data-Centric focus**, utilizing a "Deep Mode" interface that minimizes eye strain during prolonged use. It employs a structured, dark-themed hierarchy where information is layered through tonal shifts rather than complex shadows. The brand personality is efficient, precise, and authoritative, evoking a sense of real-time control over complex supply chains. Visual emphasis is placed on "Signal over Noise," using vibrant accent colors only to highlight actionable data, statuses, or active navigation states.

## Colors

The palette is anchored in a monochromatic dark grey scale to provide a high-contrast foundation for data visualization. 

- **Primary (Purple):** Reserved for active navigation states, primary buttons, and selected interactive elements.
- **Data Accents:** A diverse range of semantic colors (Red, Teal, Orange, Blue) is used for chart differentiation and inventory status indicators.
- **Surface Strategy:** The background uses a pure dark grey (#121212), while containers and list items use a slightly lighter elevation (#1E1E1E) to create subtle separation.
- **Typography:** Pure white is used for high-level headings, while mid-grey is used for secondary metadata to establish clear information hierarchy.

## Typography

The design system utilizes **Hanken Grotesk** for its exceptional legibility in data-heavy layouts and its modern, professional geometric character.

The scale is designed to handle dense information. **Headline-sm** is frequently used for section dividers (e.g., "LOTES") to provide clear boundaries without consuming excessive vertical space. Numeric data in charts and labels uses a slightly reduced font size with clear character separation to ensure that long strings of IDs or quantities remain readable.

## Layout & Spacing

This design system uses a **Fluid Grid** model optimized for vertical scrolling on mobile devices. 

- **Vertical Rhythm:** Content sections are separated by consistent 1.5rem gaps. Within cards or list items, a tighter 0.5rem spacing is used to maintain the relationship between labels and values.
- **Lists:** Inventory and filter lists utilize full-width rows with a 1px border separator to maximize the horizontal space for text.
- **Safe Areas:** A 1rem horizontal margin is maintained globally to prevent content from touching the edges of the device.
- **Interactive Zones:** All navigation and list items maintain a minimum 48px (3rem) touch target height to ensure accessibility in mobile-first environments.

## Elevation & Depth

The design system avoids heavy drop shadows, opting instead for **Tonal Layering** and **Line-based Separation**.

- **Level 0 (Base):** The #121212 background.
- **Level 1 (Surface):** List items and containers use a subtle #1E1E1E fill or are defined by thin 1px #333333 borders.
- **Level 2 (Overlays):** Tooltips and floating labels (like the chart value callout) use a white background with high-contrast text to pop against the dark theme.
- **Separators:** Horizontal rules are used extensively to define the hierarchy of "Filters," "Lotes," and "Depositos," ensuring the user can scan the vertical stack easily.

## Shapes

The shape language is primarily **Soft (0.25rem)** to maintain a professional, structured feel while slightly softening the technical nature of the data.

- **Standard Elements:** Input fields and list rows have minimal rounding (4px).
- **Interactive Bars:** Progress bars or chart "scrubbers" use slightly more pronounced rounding (8px) to signify they are draggable or interactive.
- **Navigation:** Bottom navigation tabs use square corners for the container but rounded indicators for the active state.

## Components

### Data Cards & Sections
Sections are introduced with a "Headline-sm" label in light grey. Content within these sections is often displayed in full-width rows with chevron indicators for drill-down actions.

### Charts & Visuals
- **Bar Charts:** Use thin, high-frequency bars in a single accent color (e.g., Chart Red). They include a horizontal scroll/scrub bar at the bottom for timeline navigation.
- **Donut/Pie Charts:** Use a multi-color palette for category differentiation, accompanied by thin lead-lines connecting segments to their text labels.
- **Tooltips:** High-contrast white boxes that appear over charts, featuring a colored "pill" indicator to correlate with the data point.

### Navigation
- **Top Bar:** Features a hamburger menu, brand icon, page title, and utility actions (Search, Refresh).
- **Bottom Navigation:** A high-density bar with 5 slots. The active state is indicated by a full-height background color fill (Primary Purple) and an icon + label combination.

### Lists & Filters
Filters are presented as a nested list. Each row displays a label and its current value/selection, with a right-aligned chevron. Active selection rows may include a small brand icon or colored indicator.