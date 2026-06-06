---
name: Care coordination narrative
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#45464c'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f1f1'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#575e70'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#141b2b'
  on-primary-container: '#7d8497'
  inverse-primary: '#c0c6db'
  secondary: '#a63b00'
  on-secondary: '#ffffff'
  secondary-container: '#fc6c29'
  on-secondary-container: '#5a1c00'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#370e00'
  on-tertiary-container: '#e55400'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce2f7'
  primary-fixed-dim: '#c0c6db'
  on-primary-fixed: '#141b2b'
  on-primary-fixed-variant: '#404758'
  secondary-fixed: '#ffdbce'
  secondary-fixed-dim: '#ffb599'
  on-secondary-fixed: '#370e00'
  on-secondary-fixed-variant: '#7f2b00'
  tertiary-fixed: '#ffdbce'
  tertiary-fixed-dim: '#ffb599'
  on-tertiary-fixed: '#370e00'
  on-tertiary-fixed-variant: '#7f2b00'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
  surface-section: '#F5F5F5'
  text-muted: '#4B5563'
typography:
  display:
    fontFamily: Inter
    fontSize: 64px
    fontWeight: '500'
    lineHeight: '1.08'
    letterSpacing: -0.03em
  display-mobile:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '500'
    lineHeight: '1.1'
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '500'
    lineHeight: '1.12'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '500'
    lineHeight: '1.65'
    letterSpacing: '0'
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '500'
    lineHeight: '1.6'
    letterSpacing: '0'
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: '0'
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.02em
  caption:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  max-width: 1440px
  margin-desktop: 3rem
  margin-tablet: 2rem
  margin-mobile: 1.25rem
  gutter: 1.5rem
  sidebar-width: 280px
  topbar-height: 72px
---

## Brand & Style

The design system is engineered for the caregiver experience, where clarity and reliability are paramount. It centers on a **Corporate / Modern** aesthetic that prioritizes information density and ease of navigation while maintaining a warm, human touch. The visual language is defined by precise spacing, professional neutrality, and a focus on coordination-heavy workflows.

Key characteristics include:
- **Calm Efficiency:** A palette of soft grays and intentional whites to reduce cognitive load during long sessions.
- **Trusted Vitality:** High-energy orange accents highlight critical actions and updates without creating alarm.
- **Refined Structure:** A sidebar-led navigation model and card-based content layout ensure that complex patient data remains organized and accessible.
- **Fluid Response:** Motion is used sparingly to reinforce the relationship between actions and outcomes, utilizing professional, non-linear easing.

## Colors

The color strategy uses high-contrast typography against soft, layered backgrounds to ensure maximum readability for caregivers.

- **Primary & Secondary Accents:** The vibrant orange (#F26522 and its variant #ff5f03) is reserved strictly for interaction points—buttons, active states, and critical badges.
- **Surface Layering:** The base background is a cool light gray (#EFEFEF), with section containers utilizing a slightly brighter #F5F5F5 to create subtle depth without relying on heavy borders.
- **Typography:** Text levels follow a strict hierarchy using Gray-900 (#111827) for headlines and core data, while Gray-600 (#4B5563) handles supportive descriptions and metadata.

## Typography

This design system utilizes **Inter** across all roles to maintain a systematic, utilitarian feel that is highly legible in data-heavy environments. 

Headings use medium weights and tight tracking to feel authoritative but modern. Body text is balanced with generous line heights (1.6x+) to ensure long-form reading—such as patient notes or care plans—is comfortable. Labels and interactive elements use slightly smaller, semi-bold weights to distinguish them from content.

## Layout & Spacing

The layout follows a **Fixed Grid** philosophy within a 1440px max-width container, ensuring consistent scanning patterns on wide monitors typical of professional settings.

- **Structure:** A persistent sidebar navigation handles primary application routing, while a topbar facilitates global actions like the patient selector.
- **Rhythm:** Spacing follows a strict 4px/8px baseline. Use 48px to 64px for section gaps on desktop, scaling down to 32px on mobile.
- **Adaptive Rules:** 
  - **Desktop:** Sidebar is fixed; content uses a multi-column grid (up to 12 columns).
  - **Tablet:** Sidebar collapses to an icon-only rail or drawer; cards reflow to 2-column layouts.
  - **Mobile:** Single column flow with 20px side margins; fixed top/bottom navigation bars for thumb-reachability.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** supplemented by light, ambient shadows. 

- **Level 0 (Base):** Light gray (#EFEFEF) represents the canvas.
- **Level 1 (Section):** White (#FFFFFF) or slightly off-white (#F5F5F5) cards sit on the canvas.
- **Level 2 (Active Cards):** Use a soft ambient shadow (`0px 2px 8px rgba(0,0,0,0.08)`) to lift interactive content.
- **Level 3 (Hover/Overlays):** On hover, shadows deepen to `0px 4px 16px rgba(0,0,0,0.12)` to provide tactile feedback.

Avoid heavy borders; use subtle 1px lines in Gray-200 or Gray-300 only when tonal separation is insufficient.

## Shapes

The shape language is consistently **Rounded**, striking a balance between professional geometry and approachable friendliness.

- **Standard Containers:** Use `rounded-2xl` (1rem) for primary cards and content sections to soften the "industrial" feel of the portal.
- **Interactive Elements:** Buttons and tags utilize a full pill shape (`rounded-full`) to clearly distinguish them from static information containers.
- **Identity:** Logographics and status indicators should be circular to maintain consistency with the "dark circular badge" motif.

## Components

### Buttons
- **Primary:** Pill-shaped, orange (#F26522) background, white text. Includes a text-roll animation on hover and a trailing icon in a white circle.
- **Secondary:** Pill-shaped, dark gray (#111827) background, white text. 
- **Tertiary/Ghost:** Transparent background with subtle Gray-200 border, pill-shaped.

### Cards
Cards are the primary container for patient data. They feature a white background, `rounded-2xl` corners, and the Level 2 shadow. Padding should be generous (min 24px) to ensure data doesn't feel cramped.

### Input Fields
Inputs should be clean with a light gray background or subtle border. Focus states must use the primary orange for the border or a subtle outer glow to indicate activity.

### Badges & Chips
- **Status Badges:** Dark circular badges with white centered text for "Featured" or "Alert" states.
- **Labels:** Pill-shaped with a 1px Gray-200 border for categories or metadata.

### Motion
Transitions must use the custom cubic-bezier: `cubic-bezier(0.25, 0.1, 0.25, 1)`. Typical durations should be 500ms for significant layout changes and 300ms for micro-interactions like hover states.