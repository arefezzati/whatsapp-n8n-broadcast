# ByteExport Landing Page - Design System Specification

## AI Agent İçin Tasarım Dokümantasyonu
Bu dokümanda ByteExport landing page'inin tüm tasarım elementleri, renk kombinasyonları, efektler, animasyonlar ve stil özellikleri detaylı şekilde tanımlanmıştır.

---

## 1. COLOR PALETTE (Renk Paleti)

### Primary Colors (Ana Renkler)
```css
--primary-dark: #001D6C      /* Ana marka rengi - Koyu lacivert */
--primary-medium: #003399    /* Orta ton mavi */
--primary-light: #0047AB     /* Açık mavi ton */
```

### Background Colors (Arkaplan Renkleri)
```css
--bg-main: rgb(248, 249, 250)           /* Ana sayfa arkaplanı - Çok açık gri */
--bg-white: #FFFFFF                     /* Beyaz arkaplan */
--bg-gradient-start: #EBF5FF            /* Gradient başlangıç - Açık mavi */
--bg-gradient-end: #E8E9FF              /* Gradient bitiş - Açık mor */
```

### Text Colors (Metin Renkleri)
```css
--text-primary: #0F172A        /* Ana metin rengi - Koyu slate */
--text-secondary: #475569      /* İkincil metin - Orta slate */
--text-tertiary: #64748B       /* Üçüncül metin - Açık slate */
--text-white: #FFFFFF          /* Beyaz metin */
```

### Accent Colors (Vurgu Renkleri)
```css
--accent-green: #10B981        /* Başarı/onay rengi - Yeşil */
--accent-red: #EF4444          /* Hata rengi - Kırmızı */
--accent-yellow: #FCD34D       /* Yıldız/uyarı rengi - Sarı */
```

### Border Colors (Kenarlık Renkleri)
```css
--border-light: #E2E8F0        /* Açık kenarlık - Slate 200 */
--border-medium: #CBD5E1       /* Orta kenarlık - Slate 300 */
--border-primary: rgba(0, 29, 108, 0.2)   /* Primary renk kenarlık (20% opacity) */
--border-primary-strong: rgba(0, 29, 108, 0.4)   /* Güçlü primary kenarlık (40% opacity) */
```

### Platform Brand Colors (Platform Markaları)
```css
--instagram: #E1306C
--whatsapp: #25D366
--telegram: #2AABEE
--youtube: #FF0000
--tiktok: #000000
```

---

## 2. TYPOGRAPHY (Tipografi)

### Font Family
```css
font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

### Font Sizes (Boyutlar)
```css
/* Headings */
--text-xs: 13px           /* Küçük etiketler, altbilgi */
--text-sm: 14px           /* Küçük metin */
--text-base: 15-16px      /* Normal metin */
--text-lg: 17-18px        /* Büyük metin */
--text-xl: 20px           /* Başlık alt seviye */
--text-2xl: 24px          /* Küçük başlık */
--text-3xl: 28-32px       /* Orta başlık */
--text-4xl: 36-40px       /* Büyük başlık */
--text-5xl: 48-52px       /* Ana başlık (Desktop) */
--text-6xl: 56-64px       /* Hero başlık (Desktop) */

/* Mobile Adjustments */
--text-hero-mobile: 32px  /* Hero başlık (Mobile) */
--text-4xl-mobile: 28px   /* Büyük başlık (Mobile) */
--text-3xl-mobile: 24px   /* Orta başlık (Mobile) */
```

### Font Weights (Kalınlık)
```css
--font-normal: 400        /* Normal metin */
--font-medium: 500        /* Orta kalınlık */
--font-semibold: 600      /* Yarı kalın */
--font-bold: 700          /* Kalın başlıklar */
```

### Line Heights (Satır Yüksekliği)
```css
--leading-tight: 1.1      /* Başlıklar için sıkı */
--leading-relaxed: 1.625  /* Paragraflar için rahat */
--leading-normal: 1.5     /* Normal metin */
```

### Letter Spacing (Harf Aralığı)
```css
--tracking-tight: -0.025em   /* Başlıklar için sıkı */
--tracking-normal: 0         /* Normal metin */
--tracking-wide: 0.025em     /* Etiketler için geniş */
```

---

## 3. SPACING & LAYOUT (Boşluklar ve Düzen)

### Spacing Scale (Boşluk Ölçeği)
```css
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
--space-8: 32px
--space-10: 40px
--space-12: 48px
--space-16: 64px
--space-20: 80px
--space-24: 96px
```

### Container & Grid
```css
--container-max-width: 1152px  /* 6xl (max-w-6xl) */
--container-padding-mobile: 24px  /* px-6 */
--container-padding-desktop: 32px /* px-8 */

/* Grid Gaps */
--gap-base: 24px          /* gap-6 */
--gap-large: 32px         /* gap-8 */
```

### Section Padding
```css
/* Desktop */
--section-padding-y: 64-96px   /* py-16 md:py-24 */

/* Mobile */
--section-padding-y-mobile: 48-64px  /* py-12 md:py-16 */
```

---

## 4. BORDER RADIUS (Köşe Yuvarlaklığı)

```css
--radius-sm: 8px          /* rounded-lg - Küçük elementler */
--radius-md: 12px         /* rounded-xl - Butonlar, inputlar */
--radius-lg: 16px         /* rounded-2xl - Kartlar */
--radius-xl: 24px         /* rounded-3xl - Paneller */
--radius-full: 9999px     /* rounded-full - Yuvarlak badge, avatar */
```

---

## 5. SHADOWS (Gölgeler)

### Base Shadows
```css
/* Hafif gölge - Kartlar için */
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);

/* Orta gölge - Paneller için */
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);

/* Güçlü gölge - Pop-up elementler */
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);

/* Çok güçlü gölge - Hero elementler */
--shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
```

### Custom Neon Shadows (Özel Neon Gölgeler)
```css
/* Normal panel neon glow */
--shadow-neon-normal: 0 0 24px -16px rgba(0, 29, 108, 0.25);

/* Highlighted panel neon glow */
--shadow-neon-highlight: 0 0 40px -12px rgba(0, 29, 108, 0.5);

/* Button shadow */
--shadow-button: 0 8px 16px -4px rgba(0, 29, 108, 0.3);
```

---

## 6. GRADIENTS (Gradyanlar)

### Background Gradients
```css
/* Ana sayfa arkaplan gradient */
background: linear-gradient(135deg, #EBF5FF 0%, #FFFFFF 50%, #E8E9FF 100%);

/* Overlay gradient (derinlik efekti) */
background: linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.5) 50%, #FFFFFF 100%);
```

### Element Gradients
```css
/* Primary button gradient */
background: linear-gradient(135deg, #001D6C 0%, #003399 100%);

/* Neon panel border gradient (normal) */
background: linear-gradient(135deg, 
  rgba(0,29,108,0.4) 0%, 
  rgba(0,51,153,0.2) 50%, 
  rgba(0,29,108,0.4) 100%
);

/* Neon panel border gradient (highlighted) */
background: linear-gradient(135deg, 
  rgba(0,29,108,0.6) 0%, 
  rgba(0,51,153,0.4) 50%, 
  rgba(0,29,108,0.6) 100%
);

/* SVG flow line gradient */
<linearGradient id="flowLine">
  <stop offset="0%" stopColor="#001D6C" stopOpacity="0"/>
  <stop offset="50%" stopColor="#001D6C" stopOpacity="0.35"/>
  <stop offset="100%" stopColor="#001D6C" stopOpacity="0"/>
</linearGradient>
```

---

## 7. EFFECTS & ANIMATIONS (Efektler ve Animasyonlar)

### Backdrop Effects
```css
/* Glassmorphism effect */
backdrop-filter: blur(12px);
background: rgba(255, 255, 255, 0.8);
border: 1px solid rgba(0, 29, 108, 0.2);
```

### Transition Speeds
```css
--transition-fast: 150ms
--transition-base: 200ms
--transition-slow: 300ms
--transition-slower: 500ms

/* Easing functions */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)
--ease-out: cubic-bezier(0, 0, 0.2, 1)
--ease-spring: cubic-bezier(0.68, -0.55, 0.265, 1.55)
```

### Hover Effects (Üzerine Gelme Efektleri)

#### Buttons
```css
/* Primary button hover */
.button-primary:hover {
  background: #003399;
  transform: scale(1.05);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* Ghost button hover */
.button-ghost:hover {
  background: #F8FAFC;
  transform: scale(1.05);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

#### Cards
```css
.card:hover {
  transform: scale(1.05) translateY(-10px);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Scroll Animations (Framer Motion)
```javascript
// Card entrance animation
{
  initial: { opacity: 0, y: 60, scale: 0.8 },
  whileInView: { opacity: 1, y: 0, scale: 1 },
  viewport: { once: true, margin: "-100px" },
  transition: { 
    duration: 0.6, 
    delay: index * 0.1,
    type: "spring",
    stiffness: 100,
    damping: 15
  }
}

// Parallax scroll effect
{
  yBlob: useTransform(scrollYProgress, [0, 1], [0, -120]),
  yPhone: useTransform(scrollYProgress, [0, 1], [0, -60]),
  rotatePhone: useTransform(scrollYProgress, [0, 1], [0, -6])
}
```

### SVG Animations
```xml
<!-- Pulse animation (opacity) -->
<animate 
  attributeName="opacity" 
  values="0.3;0.8;0.3" 
  dur="5.2s" 
  repeatCount="indefinite"
/>

<!-- Scale animation -->
<animate 
  attributeName="r" 
  values="30;35;30" 
  dur="2.6s" 
  repeatCount="indefinite"
/>

<!-- Dash offset animation (flow effect) -->
<animate 
  attributeName="stroke-dasharray" 
  values="0,400;200,200;400,0;200,200;0,400" 
  dur="5.2s" 
  repeatCount="indefinite"
/>

<!-- Rotate animation -->
<animateTransform
  attributeName="transform"
  type="rotate"
  values="0;360"
  dur="20s"
  repeatCount="indefinite"
/>
```

### Loading States
```css
/* Skeleton loader */
@keyframes skeleton-loading {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    #F1F5F9 0%,
    #E2E8F0 50%,
    #F1F5F9 100%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
}
```

---

## 8. COMPONENT STYLES (Bileşen Stilleri)

### NeonPanel (Ana Kart Bileşeni)
```css
.neon-panel {
  /* Outer gradient border */
  background: linear-gradient(135deg, 
    rgba(0,29,108,0.4) 0%, 
    rgba(0,51,153,0.2) 50%, 
    rgba(0,29,108,0.4) 100%
  );
  padding: 1px;
  border-radius: 24px;
}

.neon-panel-inner {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 29, 108, 0.2);
  border-radius: calc(24px - 1px);
  padding: 32px;
}

/* Highlighted variant */
.neon-panel--highlight {
  background: linear-gradient(135deg, 
    rgba(0,29,108,0.6) 0%, 
    rgba(0,51,153,0.4) 50%, 
    rgba(0,29,108,0.6) 100%
  );
  box-shadow: 0 0 40px -12px rgba(0, 29, 108, 0.5);
}
```

### Buttons
```css
/* Primary Button */
.button-primary {
  background: #001D6C;
  color: #FFFFFF;
  padding: 16px 24px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 16px;
  box-shadow: 0 8px 16px -4px rgba(0, 29, 108, 0.3);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.button-primary:hover {
  background: #003399;
  transform: scale(1.05);
}

/* Ghost Button */
.button-ghost {
  background: #FFFFFF;
  color: #0F172A;
  border: 1px solid #CBD5E1;
  padding: 16px 24px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 16px;
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.button-ghost:hover {
  background: #F8FAFC;
  transform: scale(1.05);
}

/* Icon spacing in buttons */
.button-icon {
  margin-right: 12px;
  width: 20px;
  height: 20px;
}
```

### Badges
```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid #CBD5E1;
  border-radius: 9999px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #0F172A;
}

.badge-icon {
  width: 16px;
  height: 16px;
  color: #001D6C;
}

/* Mini tag variant */
.mini-tag {
  background: rgba(0, 29, 108, 0.1);
  border: 1px solid rgba(0, 29, 108, 0.3);
  color: #001D6C;
}
```

### Form Inputs
```css
.input {
  background: #FFFFFF;
  border: 1px solid #CBD5E1;
  border-radius: 12px;
  padding: 16px 20px;
  font-size: 16px;
  color: #0F172A;
  outline: none;
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.input:focus {
  border-color: #001D6C;
  box-shadow: 0 0 0 2px rgba(0, 29, 108, 0.1);
}

.input::placeholder {
  color: #94A3B8;
}

/* Textarea */
.textarea {
  resize: none;
  min-height: 96px;
}
```

### Stats Cards
```css
.stat-card {
  /* Gradient border wrapper */
  background: linear-gradient(135deg, 
    rgba(0,29,108,0.6) 0%, 
    rgba(0,51,153,0.3) 50%, 
    rgba(0,29,108,0.5) 100%
  );
  padding: 1px;
  border-radius: 16px;
}

.stat-card-inner {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(0, 29, 108, 0.2);
  border-radius: calc(16px - 1px);
  padding: 24px;
  text-align: center;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #001D6C;
  letter-spacing: -0.025em;
}

.stat-label {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  color: #64748B;
  margin-top: 4px;
}
```

---

## 9. BACKGROUND PATTERNS (Arkaplan Desenleri)

### Grid Pattern
```xml
<svg viewBox="0 0 1200 420">
  <defs>
    <linearGradient id="grid">
      <stop offset="0%" stopColor="rgba(0,29,108,0.12)"/>
      <stop offset="50%" stopColor="rgba(0,51,153,0.08)"/>
      <stop offset="100%" stopColor="rgba(0,29,108,0.04)"/>
    </linearGradient>
  </defs>
  
  <!-- Vertical lines: 32px spacing -->
  <line x1="32" y1="0" x2="32" y2="420" 
        stroke="url(#grid)" strokeWidth="1"/>
  
  <!-- Horizontal lines: 30px spacing -->
  <line x1="0" y1="30" x2="1200" y2="30" 
        stroke="url(#grid)" strokeWidth="1"/>
</svg>
```

### Tech Pattern
```xml
<pattern id="techPattern" width="40" height="40" patternUnits="userSpaceOnUse">
  <!-- Dots at intersections -->
  <circle cx="20" cy="20" r="2" fill="currentColor" opacity="0.3"/>
  
  <!-- Cross lines -->
  <path d="M10 20h20M20 10v20" 
        stroke="currentColor" 
        strokeWidth="0.5" 
        opacity="0.2"/>
</pattern>
```

### Floating Elements
```javascript
// Floating boxes - animated with Framer Motion
{
  width: "80px",
  height: "80px",
  border: "1px solid rgba(0,29,108,0.15)",
  borderRadius: "16px",
  background: "rgba(0,29,108,0.08)",
  
  animate: { 
    y: [0, -150, 0],
    x: [0, Math.sin(i) * 50, 0],
    rotate: [0, 360],
    scale: [0.5, 1, 0.5],
    opacity: [0.1, 0.4, 0.1]
  },
  
  transition: { 
    duration: 19.5 + Math.random() * 13, 
    repeat: Infinity,
    ease: "easeInOut"
  }
}
```

---

## 10. RESPONSIVE BREAKPOINTS (Ekran Boyutları)

```css
/* Mobile First Approach */
--breakpoint-sm: 640px    /* Small devices */
--breakpoint-md: 768px    /* Tablets */
--breakpoint-lg: 1024px   /* Small laptops */
--breakpoint-xl: 1280px   /* Desktops */
--breakpoint-2xl: 1536px  /* Large screens */

/* Common mobile adjustments */
@media (max-width: 768px) {
  /* Font sizes reduce by ~20-30% */
  /* Padding/margins reduce to 60-75% */
  /* Grid columns: 1 column on mobile */
  /* Hide complex animations */
}
```

---

## 11. ACCESSIBILITY (Erişilebilirlik)

### Focus States
```css
.focusable:focus-visible {
  outline: 2px solid #001D6C;
  outline-offset: 2px;
  border-radius: 4px;
}
```

### Color Contrast Ratios
```
Primary text on white: 19.5:1 (AAA)
Secondary text on white: 7.9:1 (AA)
Primary button text: 13.2:1 (AAA)
```

### Motion Preferences
```javascript
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Disable complex animations when reduced motion is preferred
style={reduceMotion ? {} : { y: yPhone, rotate: rotatePhone }}
```

---

## 12. ICON USAGE (İkon Kullanımı)

### Icon Library: Lucide React
```javascript
import { 
  Rocket, Globe2, Languages, TimerReset, 
  Share2, Video, Sparkles, Smartphone,
  Hash, CheckCircle2, MessageSquare, PhoneCall,
  ShieldCheck, ArrowRight, Building2, LineChart
} from "lucide-react";
```

### Icon Sizes
```css
--icon-xs: 16px    /* Mini icons */
--icon-sm: 20px    /* Default icons */
--icon-md: 24px    /* Section headers */
--icon-lg: 32px    /* Hero elements */
```

### Icon Colors
```css
/* In buttons and cards */
color: #001D6C;

/* In platform badges */
color: [platform-specific-color];

/* Disabled state */
color: #94A3B8;
opacity: 0.5;
```

---

## 13. SPECIAL EFFECTS (Özel Efektler)

### Neon Glow Animation
```css
@keyframes neon-pulse {
  0%, 100% {
    box-shadow: 0 0 24px -16px rgba(0, 29, 108, 0.25);
  }
  50% {
    box-shadow: 0 0 40px -12px rgba(0, 29, 108, 0.5);
  }
}

.neon-element {
  animation: neon-pulse 3s ease-in-out infinite;
}
```

### Scroll Indicator
```css
.scroll-indicator {
  background: rgba(0, 29, 108, 0.1);
  border: 1px solid rgba(0, 29, 108, 0.4);
  border-radius: 9999px;
  padding: 16px;
  backdrop-filter: blur(4px);
}

.scroll-indicator-arrow {
  animation: bounce 2s ease-in-out infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(8px); }
}
```

### Blob Glow Effect
```xml
<svg>
  <defs>
    <radialGradient id="blobGlow">
      <stop offset="0%" stopColor="#001D6C" stopOpacity="0.6"/>
      <stop offset="40%" stopColor="#003399" stopOpacity="0.4"/>
      <stop offset="70%" stopColor="#001D6C" stopOpacity="0.2"/>
      <stop offset="100%" stopColor="#001D6C" stopOpacity="0"/>
    </radialGradient>
    <filter id="blur">
      <feGaussianBlur stdDeviation="45"/>
    </filter>
  </defs>
  <circle cx="300" cy="300" r="260" 
          fill="url(#blobGlow)" 
          filter="url(#blur)">
    <animateTransform
      attributeName="transform"
      type="scale"
      values="1;1.1;1"
      dur="5.2s"
      repeatCount="indefinite"
    />
  </circle>
</svg>
```

---

## 14. MOTION LIBRARY SETTINGS (Framer Motion)

### Default Animation Config
```javascript
const animationConfig = {
  initial: { opacity: 0, y: 60, scale: 0.8 },
  whileInView: { opacity: 1, y: 0, scale: 1 },
  viewport: { once: true, margin: "-100px" },
  transition: { 
    duration: 0.6,
    type: "spring",
    stiffness: 100,
    damping: 15
  }
};
```

### Stagger Configuration
```javascript
const staggerChildren = {
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  transition: {
    staggerChildren: 0.1, // 100ms delay between children
    delayChildren: 0.2    // 200ms initial delay
  }
};
```

---

## 15. USAGE EXAMPLES (Kullanım Örnekleri)

### Creating a Card
```jsx
<div className="rounded-3xl p-[1px] bg-gradient-to-br from-[#001D6C]/40 via-[#003399]/20 to-[#001D6C]/40">
  <div className="rounded-[calc(1.5rem-1px)] bg-white/80 backdrop-blur-xl border border-[#001D6C]/20 p-8">
    {/* Card content */}
  </div>
  <div className="pointer-events-none absolute inset-0 rounded-3xl shadow-[0_0_24px_-16px_rgba(0,29,108,0.25)]" />
</div>
```

### Creating a Button
```jsx
<button className="inline-flex items-center justify-center gap-3 rounded-xl px-6 py-4 font-semibold text-base bg-[#001D6C] text-white hover:bg-[#003399] hover:scale-105 shadow-lg shadow-[#001D6C]/30 transition-all duration-200">
  <Rocket className="w-5 h-5" />
  Button Text
</button>
```

### Creating an Animated Section
```jsx
<motion.div
  initial={{ opacity: 0, y: 60 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
  transition={{ duration: 0.6 }}
>
  {/* Section content */}
</motion.div>
```

---

## 16. PERFORMANCE OPTIMIZATIONS

### Image Optimization
```jsx
<img 
  src="./image.png" 
  alt="Description"
  loading="lazy"
  className="w-full h-auto"
  onError={(e) => {
    e.target.style.display = 'none';
    // Fallback logic
  }}
/>
```

### Intersection Observer for Visibility
```javascript
useEffect(() => {
  const observer = new IntersectionObserver(
    ([entry]) => setIsVisible(entry.isIntersecting),
    { threshold: 0.1 }
  );
  if (ref.current) observer.observe(ref.current);
  return () => observer.disconnect();
}, []);
```

### Reduce Motion Check
```javascript
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

---

## 17. BEST PRACTICES (En İyi Uygulamalar)

1. **Consistent Spacing**: Her zaman 4'ün katları kullan (4px, 8px, 12px, 16px, 24px, 32px, etc.)

2. **Color Opacity**: Opacity değerleri için standart oranlar:
   - 0.1 (10%) - Çok hafif arkaplanlar
   - 0.2 (20%) - Hafif kenarlıklar
   - 0.4 (40%) - Orta kenarlıklar
   - 0.6 (60%) - Güçlü vurgular
   - 0.8 (80%) - Ana elementler

3. **Animation Durations**: Standart süreler:
   - 150-200ms: Buton hover, quick transitions
   - 300-500ms: Kart animasyonları
   - 600-1000ms: Scroll animasyonları
   - 2-5 saniye: Dekoratif animasyonlar
   - 10+ saniye: Arka plan animasyonları

4. **Z-Index Hierarchy**:
   ```css
   --z-background: 0
   --z-base: 10
   --z-content: 20
   --z-overlay: 30
   --z-header: 100
   ```

5. **Mobile First**: Her zaman mobil tasarımdan başla, sonra desktop için genişlet

---

## ÖZET - AI Agent için Hızlı Referans

### Ana Renkler
- Primary: `#001D6C` (koyu lacivert)
- Secondary: `#003399` (orta mavi)
- Background: `rgb(248,249,250)` (açık gri)
- Text: `#0F172A` (koyu slate)

### Tipografi
- Font: System font stack
- Başlıklar: 600-700 weight, tight leading
- Paragraflar: 400-500 weight, relaxed leading
- Boyutlar: 13px-64px arası responsive ölçekleme

### Efektler
- Border radius: 8px (küçük) → 24px (büyük)
- Shadows: Subtle to prominent (neon glow dahil)
- Backdrop blur: 12px glassmorphism
- Transitions: 200ms standard, spring animations

### Animasyonlar
- Framer Motion: Scroll-triggered, stagger, parallax
- SVG: Dash offset, opacity pulse, scale
- CSS: Hover scale(1.05), translateY(-10px)

### Layout
- Container: 1152px max-width, 24-32px padding
- Grid: 1-3 columns, responsive
- Spacing: 24px-96px section padding

Bu spesifikasyon, herhangi bir AI ajanının ByteExport landing page'ini yeniden oluşturması veya benzer bir tema uygulaması için yeterli detayı içermektedir.
