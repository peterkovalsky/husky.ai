# Husky AI Design System

A modern, Canva-inspired design system with Husky AI's unique brand identity. Features purple-to-cyan gradients, glassmorphism effects, and smooth micro-animations.

## Table of Contents

- [Brand Colors](#brand-colors)
- [Gradients](#gradients)
- [Typography](#typography)
- [Components](#components)
- [CSS Utilities](#css-utilities)
- [Usage Examples](#usage-examples)

---

## Brand Colors

### Primary (Husky Purple)

Our signature purple palette, used for primary actions and brand elements.

| Token | Hex | Usage |
|-------|-----|-------|
| husky-50 | `#f5f3ff` | Lightest backgrounds |
| husky-100 | `#ede9fe` | Light backgrounds |
| husky-200 | `#ddd6fe` | Borders, dividers |
| husky-300 | `#c4b5fd` | Hover states |
| husky-400 | `#a78bfa` | Secondary elements |
| husky-500 | `#8b5cf6` | **Primary brand color** |
| husky-600 | `#7c3aed` | Hover primary |
| husky-700 | `#6d28d9` | Active states |
| husky-800 | `#5b21b6` | Dark accents |
| husky-900 | `#4c1d95` | Darkest |

### Secondary (Cyan)

Accent color for CTAs and highlights.

| Token | Hex | Usage |
|-------|-----|-------|
| cyan-400 | `#22d3ee` | Light accent |
| cyan-500 | `#06b6d4` | **Secondary color** |
| cyan-600 | `#0891b2` | Hover secondary |

### Semantic Colors

| Status | Color | Usage |
|--------|-------|-------|
| Success | `#22c55e` | Ready states, confirmations |
| Warning | `#f59e0b` | Queued states, cautions |
| Error | `#ef4444` | Failed states, errors |
| Info | `#3b82f6` | Processing states, information |

---

## Gradients

### Hero Gradient (Canva-inspired)

```css
/* Main hero gradient */
background: linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 50%, #a5f3fc 100%);

/* Tailwind class */
className="bg-gradient-hero"
```

### Husky Brand Gradient

```css
/* Primary brand gradient */
background: linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%);

/* Tailwind class */
className="bg-gradient-husky"
```

### Status Gradients

```css
/* Job status gradients */
.status-queued    /* Amber gradient */
.status-processing /* Blue-cyan gradient */
.status-building   /* Purple gradient */
.status-ready      /* Green gradient */
.status-failed     /* Red gradient */
```

---

## Typography

### Font Stack

```css
/* Sans (default) */
font-family: 'Inter', system-ui, -apple-system, sans-serif;

/* Display (headings) */
font-family: 'Cal Sans', 'Inter', system-ui, sans-serif;

/* Monospace (code) */
font-family: 'JetBrains Mono', 'Fira Code', monospace;
```

### Type Scale

| Class | Size | Usage |
|-------|------|-------|
| text-xs | 0.75rem | Labels, hints |
| text-sm | 0.875rem | Secondary text |
| text-base | 1rem | Body text |
| text-lg | 1.125rem | Lead text |
| text-xl | 1.25rem | Subtitles |
| text-2xl | 1.5rem | Section titles |
| text-3xl | 1.875rem | Page titles |
| text-4xl | 2.25rem | Large headings |
| text-5xl | 3rem | Hero headings |

### Gradient Text

```tsx
import { GradientText } from '@/design-system';

<GradientText as="h1" className="text-5xl font-bold">
  Welcome to Husky AI
</GradientText>

// Or with CSS class
<h1 className="text-gradient text-5xl font-bold">
  Welcome to Husky AI
</h1>
```

---

## Components

### GradientButton

Modern button with gradient backgrounds.

```tsx
import { GradientButton } from '@/design-system';

<GradientButton>Create App</GradientButton>
<GradientButton variant="secondary">Learn More</GradientButton>
<GradientButton variant="glass">Settings</GradientButton>
```

**Props:**
- `variant`: 'primary' | 'secondary' | 'glass'
- `gradientText`: boolean - Use gradient text instead of solid

---

### GlassCard

Glassmorphism card with frosted glass effect.

```tsx
import { GlassCard } from '@/design-system';
import { CardBody } from '@heroui/react';

<GlassCard>
  <CardBody>Content here</CardBody>
</GlassCard>

<GlassCard hoverable gradientBorder>
  <CardBody>Interactive card with gradient border</CardBody>
</GlassCard>
```

**Props:**
- `intensity`: 'light' | 'medium' | 'heavy'
- `hoverable`: boolean - Enable hover animation
- `gradientBorder`: boolean - Animated gradient border on hover

---

### CategoryChip

Pill-shaped category buttons (like Canva's Design, Image, Doc buttons).

```tsx
import { CategoryChip } from '@/design-system';

<CategoryChip icon={<DesignIcon />}>Design</CategoryChip>
<CategoryChip active>Image</CategoryChip>
<CategoryChip gradient>Code</CategoryChip>
```

**Props:**
- `icon`: ReactNode - Icon before label
- `active`: boolean - Selected state
- `gradient`: boolean - Use gradient style

---

### AIPromptInput

Large AI prompt input with animated gradient border.

```tsx
import { AIPromptInput, CategoryChip } from '@/design-system';

<AIPromptInput
  placeholder="Describe your idea, and I'll bring it to life"
  startContent={<PlusButton />}
  endContent={<SendButton />}
  bottomContent={
    <div className="flex gap-2">
      <CategoryChip>Design</CategoryChip>
      <CategoryChip>Image</CategoryChip>
    </div>
  }
/>
```

---

### StatusBadge

Job status indicator with optional animations.

```tsx
import { StatusBadge } from '@/design-system';

<StatusBadge status="processing" />
<StatusBadge status="building" gradient animated />
<StatusBadge status="ready" />
```

**Status values:** 'queued' | 'processing' | 'building' | 'ready' | 'failed'

---

### HeroBackground

Gradient background for hero sections.

```tsx
import { HeroBackground } from '@/design-system';

<HeroBackground variant="gradient">
  <h1>Welcome to Husky AI</h1>
</HeroBackground>

<HeroBackground variant="subtle">
  <div>Subtle background</div>
</HeroBackground>
```

**Variants:** 'gradient' | 'subtle' | 'pattern'

---

### SkeletonLoader

Shimmer loading placeholder.

```tsx
import { SkeletonLoader, SkeletonCard } from '@/design-system';

<SkeletonLoader width={200} height={20} />
<SkeletonLoader width="100%" height={100} rounded="xl" />

<SkeletonCard lines={3} showAvatar />
```

---

## CSS Utilities

### Glassmorphism

```html
<!-- Basic glass effect -->
<div class="glass">...</div>

<!-- Light glass -->
<div class="glass-light">...</div>

<!-- Glass card with shadow -->
<div class="glass-card">...</div>
```

### Gradients

```html
<!-- Background gradients -->
<div class="gradient-hero">...</div>
<div class="gradient-hero-subtle">...</div>
<div class="gradient-husky">...</div>

<!-- Text gradients -->
<span class="text-gradient">Gradient text</span>

<!-- Border gradients -->
<div class="gradient-border">...</div>
<div class="gradient-border-animated">...</div>
```

### Custom Buttons

```html
<button class="btn-husky">Primary Action</button>
<button class="btn-glass">Glass Button</button>
```

### Cards

```html
<div class="card-husky">Static card</div>
<div class="card-husky-interactive">Clickable card</div>
```

### Input Styles

```html
<input class="input-husky" placeholder="Standard input" />
<textarea class="input-ai-prompt" placeholder="AI prompt"></textarea>
```

### Category Chips

```html
<button class="chip-category">Normal</button>
<button class="chip-category active">Active</button>
<button class="chip-category-gradient">Gradient</button>
```

### Animations

```html
<!-- Fade/slide animations -->
<div class="animate-in">Fade in</div>
<div class="animate-slide-up">Slide up</div>
<div class="animate-scale-in">Scale in</div>

<!-- Pulse animation for loading states -->
<div class="animate-pulse-husky">Pulsing</div>

<!-- Shimmer skeleton loading -->
<div class="skeleton" style="width: 200px; height: 20px;"></div>
```

### Custom Shadows

```html
<div class="shadow-husky">Purple glow</div>
<div class="shadow-husky-lg">Larger purple glow</div>
<div class="shadow-cyan">Cyan glow</div>
<div class="shadow-glass">Glass shadow</div>
```

### Scrollbars

```html
<!-- Custom styled scrollbar -->
<div class="scrollbar-husky overflow-auto">...</div>

<!-- Hidden scrollbar -->
<div class="scrollbar-hidden overflow-auto">...</div>
```

---

## Usage Examples

### Hero Section

```tsx
import { HeroBackground, GradientText, GradientButton } from '@/design-system';

function HeroSection() {
  return (
    <HeroBackground variant="gradient" className="py-20 px-8">
      <div className="max-w-4xl mx-auto text-center">
        <GradientText as="h1" className="text-5xl font-bold mb-6">
          Build Beautiful Apps with AI
        </GradientText>
        <p className="text-xl text-zinc-600 mb-8">
          Describe your idea, and we'll bring it to life
        </p>
        <GradientButton size="lg">
          Get Started
        </GradientButton>
      </div>
    </HeroBackground>
  );
}
```

### Project Card

```tsx
import { GlassCard, StatusBadge } from '@/design-system';
import { CardBody, CardHeader } from '@heroui/react';

function ProjectCard({ project }) {
  return (
    <GlassCard hoverable>
      <CardHeader className="flex justify-between">
        <h3 className="font-semibold">{project.name}</h3>
        <StatusBadge status={project.status} />
      </CardHeader>
      <CardBody>
        <p className="text-sm text-zinc-500">{project.description}</p>
      </CardBody>
    </GlassCard>
  );
}
```

### AI Prompt Interface

```tsx
import { AIPromptInput, CategoryChip } from '@/design-system';
import { Button } from '@heroui/react';

function PromptInterface() {
  return (
    <AIPromptInput
      placeholder="Describe your app idea..."
      endContent={
        <Button isIconOnly color="primary" radius="full">
          <SendIcon />
        </Button>
      }
      bottomContent={
        <div className="flex flex-wrap gap-2">
          <CategoryChip active>Web App</CategoryChip>
          <CategoryChip>Mobile</CategoryChip>
          <CategoryChip>Dashboard</CategoryChip>
        </div>
      }
    />
  );
}
```

---

## Design Principles

1. **Modern & Clean**: Minimalist design with purposeful use of gradients and glass effects
2. **Consistent Spacing**: Use Tailwind's spacing scale (4, 6, 8 for gaps, 4, 6 for padding)
3. **Smooth Animations**: 200ms default transition duration with ease-out timing
4. **Accessible**: Maintain contrast ratios, focus states, and keyboard navigation
5. **Responsive**: Mobile-first approach with sm/md/lg/xl breakpoints

---

## Tailwind Classes Reference

### Colors
- `bg-husky-{50-900}` - Background colors
- `text-husky-{50-900}` - Text colors
- `border-husky-{50-900}` - Border colors

### Gradients
- `bg-gradient-hero` - Hero gradient
- `bg-gradient-husky` - Brand gradient
- `bg-gradient-{status}` - Status gradients

### Shadows
- `shadow-husky` - Purple glow shadow
- `shadow-husky-lg` - Large purple glow
- `shadow-cyan` - Cyan glow
- `shadow-glass` - Glass shadow

### Animations
- `animate-fade-in` - Fade in
- `animate-slide-up` - Slide up
- `animate-scale-in` - Scale in
- `animate-shimmer` - Shimmer effect
- `animate-gradient` - Animated gradient
