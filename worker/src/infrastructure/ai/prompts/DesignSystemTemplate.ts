/**
 * Design System generation prompt template.
 *
 * Instructs the AI to output a __DESIGN_SYSTEM__.md fenced block alongside
 * its code output.  The template defines the six required sections and
 * quality expectations.  The returned content is stored on the project
 * record and injected into subsequent builds for visual consistency.
 */

export function getDesignSystemGenerationPrompt(): string {
  return `
═══════════════════════════════════════════════════════════════════════════════
DESIGN SYSTEM — GENERATE FOR THIS PROJECT
═══════════════════════════════════════════════════════════════════════════════

You MUST output a <<<FILE:__DESIGN_SYSTEM__.md>>> block alongside your code.
This design system will be saved and used for all future iterations of this
project to maintain visual consistency.

Generate a UNIQUE design system tailored to the user's request, brand, and
content type. Do NOT produce a generic template — every section should reflect
specific creative choices for THIS project.

The design system MUST contain exactly these six sections:

## 1. Creative North Star
- A named design philosophy (e.g., "Organic Brutalism", "Minimal Warmth", "Bold Editorial")
- 2-3 sentences describing the overall visual direction, mood, and personality

## 2. Color Palette
- Primary color (hex) — the dominant brand color
- Secondary color (hex) — supporting color
- Accent color (hex) — for CTAs, highlights, interactive elements
- Surface hierarchy: base background, card/container background, overlay background (hex values)
- Text colors: primary text, secondary/muted text (hex values)
- Gradient rules (if any) — direction, color stops
- Glass/transparency rules (if any)

## 3. Typography
- Display font (for headings/hero text) — specific Google Font name
- Body font (for paragraphs/UI text) — specific Google Font name
- Size scale: display (hero), h1, h2, h3, body, small/label (rem values)
- Line-height rules (e.g., headings: 1.1, body: 1.6)
- Letter-spacing rules (e.g., headings: -0.02em, uppercase labels: 0.1em)
- Font weight usage (which weights for which contexts)

## 4. Elevation & Depth
- Shadow philosophy (e.g., "soft diffused shadows", "sharp drop shadows", "no shadows — flat design")
- Shadow values for cards, modals, hover states
- Border approach (e.g., "1px solid with low opacity", "no borders — use shadow separation", "bold 2px borders")
- Layering/z-index strategy

## 5. Component Patterns
- Buttons: primary style, secondary style, ghost/tertiary style (border-radius, padding, hover effects)
- Inputs: border style, focus state, placeholder style
- Cards: border-radius, padding, background, hover behavior
- Chips/Tags: style, size, color usage
- Spacing scale: base unit and multipliers (e.g., 4px base: xs=4, sm=8, md=16, lg=24, xl=32, 2xl=48)
- Border-radius scale (e.g., sm=4px, md=8px, lg=16px, xl=24px, full=9999px)
- Transition/animation defaults (duration, easing)

## 6. Do's and Don'ts
- 3-4 specific DO rules for this design system
- 3-4 specific DON'T rules for this design system
- These must be specific to the creative direction, not generic advice

Keep the design system concise but specific — aim for 400-800 words.
Every value should be a concrete decision, not a placeholder.

Example output format:
<<<FILE:__DESIGN_SYSTEM__.md>>>
## 1. Creative North Star
**Fluid Curator** — A gallery-like experience that ...
[rest of design system]
<<<END>>>
`;
}

export function getDesignSystemUpdatePrompt(): string {
  return `
═══════════════════════════════════════════════════════════════════════════════
DESIGN SYSTEM — UPDATE IF NEEDED
═══════════════════════════════════════════════════════════════════════════════

If the user's request changes the visual direction (e.g., "make it darker",
"use a different font", "change the color scheme"), you MUST output an updated
<<<FILE:__DESIGN_SYSTEM__.md>>> block reflecting the new design choices.

Only output __DESIGN_SYSTEM__.md if the design system needs to change.
If the user's request is purely functional (e.g., "add a contact form",
"fix the navigation link"), do NOT output __DESIGN_SYSTEM__.md.
`;
}
