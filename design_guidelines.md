# Design Guidelines - Sports Media Platform

## Design Approach
**Reference-Based: iOS Material Design Aesthetic**
The application follows Apple's design language with SF Pro typography, generous spacing, and subtle material effects. The design prioritizes content clarity and smooth interactions.

## Core Design Elements

### A. Color Palette

**Light Mode:**
- Background: `40 5% 91%` (Light gray/beige)
- Foreground: `0 0% 8%` (Deep black for primary text)
- Card: `0 0% 100%` (Pure white cards)
- Primary: `0 0% 8%` (Deep black for impact)
- Secondary: `0 0% 60%` (Dark gray for AA compliance)
- Muted Background: `40 5% 95%` (Subtle variation)
- Muted Foreground: `0 0% 28%` (Extremely dark for AAA compliance)
- Border: `0 0% 80%` (Visible borders with 3:1 contrast)

**Dark Mode:**
- Background: `220 6% 32%` (Medium stone grey)
- Foreground: `0 0% 98%` (Near white text)
- Card: `0 0% 12%` (Dark card background)
- Primary: `0 0% 98%` (Light primary)
- Secondary: `0 0% 35%` (Lighter gray hierarchy)
- Muted Background: `0 0% 15%`
- Muted Foreground: `0 0% 78%` (AA compliant)
- Border: `0 0% 25%` (Lighter borders for visibility)

**Semantic Colors:**
- Green (Wins/Success): `text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400`
- Red (Losses/Errors): `text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400`
- Blue (Info/Roster): `text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400`
- Purple (Trades): `text-purple-600 bg-purple-50 dark:bg-purple-950 dark:text-purple-400`

### B. Typography

**Font Families:**
- Display: `-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif`
- Body: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif`

**Scale:**
- Hero Team Name: `text-6xl sm:text-7xl md:text-8xl lg:text-9xl xl:text-[10rem]` (Bold, uppercase)
- Section Headers: `text-xl font-semibold` (font-display)
- Card Titles: `text-sm font-semibold` (font-display)
- Body Text: `text-xs leading-relaxed` (font-body)
- Timestamps: `text-xs text-muted-foreground`

### C. Layout System

**Spacing Primitives (Tailwind units):**
- Section spacing: `py-8` 
- Component spacing: `gap-4 sm:gap-6`
- Element spacing: `space-y-2`, `space-y-3`, `space-y-4`
- Container padding: `px-4 sm:px-6 md:px-8 lg:px-12`

**Grid System:**
- Team Cards: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Horizontal Scrolling: `overflow-x-auto scrollbar-hide` for feeds

**Border Radius:**
- Cards/Components: `rounded-lg` (1rem as defined)
- Badges: `rounded-md`
- Small elements: `rounded-sm`

### D. Component Library

**Cards:**
- Material effect: `bg-white/10 backdrop-blur-md hover:bg-white/20`
- Border: `border-0 shadow-sm` or `border border-border/20`
- Transition: `transition-all duration-normal`
- Padding: `p-4` or `p-6` for larger cards

**Badges:**
- Category badges with semantic colors
- Variant: `outline` with custom color classes
- Size: `text-xs`

**Team Dashboard (Hero Section):**
- Centered layout with `max-w-2xl` container
- Giant team name in uppercase
- AI summary below in `text-muted-foreground`
- Scores widget at bottom with `max-w-sm sm:max-w-md`

**Scores Widget:**
- Card background: `bg-card/50 rounded-lg p-4 border border-border/20`
- Live game display with team names and scores
- Recent results with W/L badges and trending icons
- Status badges: `text-xs` with semantic colors

**Fan Experience Cards:**
- Width: `w-72 sm:w-80 flex-shrink-0`
- Header gradient: `bg-gradient-to-br from-accent/20 to-accent/5`
- Icon overlay with 40% opacity
- Type badges with semantic colors (watch_party: blue, tailgate: green, viewing: purple, meetup: orange)
- Attendee count badge: `bg-background/80`
- Event details with Calendar and MapPin icons

**Navigation:**
- Top navbar with transparent background
- Theme toggle button: `h-10 w-10` with Sun/Moon icons

### E. Animations

**Timing:**
- Fast: `0.15s` (micro-interactions)
- Normal: `0.25s` (standard transitions)
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)`

**Effects:**
- Card hover: `hover:shadow-md transition-shadow`
- Image zoom: `hover:scale-105 transition-transform`
- Loading spinner: `animate-spin`
- Live badge: `animate-pulse`

## Layout Specifications

**Team Dashboard Hero:**
- Full-width centered section
- Large team name (responsive scale)
- AI summary text below
- Scores widget centered at bottom
- Vertical spacing: `space-y-4`, `mt-8`

**Fan Experiences Section:**
- Section header with Star icon
- Horizontal scrolling feed
- Card width: `w-72 sm:w-80`
- Gap between cards: `gap-3 sm:gap-4`

**Theme Toggle:**
- Position: Top navigation bar
- Ghost button variant
- Icon rotation animation on toggle

**Responsive Breakpoints:**
- Mobile: Default (single column)
- SM: `640px` (2 columns where appropriate)
- MD: `768px` (wider padding)
- LG: `1024px` (3 columns, max spacing)
- XL: `1280px` (largest text sizes)

## Images
No hero images required. The design uses gradient overlays, icon graphics, and material blur effects for visual interest. Team names and scores are the primary visual focus.