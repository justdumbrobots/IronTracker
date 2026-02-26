# CLAUDE.md — AI Assistant Guide for IronTracker

## Project Overview

IronTracker is a **Progressive Web App (PWA)** for workout tracking. It is a zero-dependency, vanilla JavaScript application that uses Firebase (Authentication, Firestore, Cloud Storage) as its backend. There is no build step — files are served directly from the repository via GitHub Pages.

**Live URL:** https://justdumbrobots.github.io/IronTracker/

---

## Repository Structure

```
IronTracker/
├── index.html            # App shell and all view markup (489 lines)
├── app.js                # Complete application logic (1,879 lines)
├── styles.css            # All styles with CSS variable theme system (1,240 lines)
├── firebase-config.js    # Firebase SDK initialization and exports (23 lines)
├── EXERCISE_DATABASE.js  # 203 exercise definitions with metadata (1,223 lines)
├── service-worker.js     # PWA offline caching (28 lines)
├── manifest.json         # PWA metadata (26 lines)
└── README.md             # User-facing project documentation
```

No `node_modules`, no `package.json`, no build tool configuration. This is intentional.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Language | Vanilla JavaScript (ES6 modules) |
| Markup | HTML5 |
| Styling | CSS3 with custom properties (no preprocessor) |
| Auth | Firebase Authentication (email/password + Google) |
| Database | Cloud Firestore (NoSQL) |
| File Storage | Firebase Cloud Storage |
| Hosting | GitHub Pages |
| Offline | Service Workers + Cache API |
| SDK | Firebase 10.8.0 (loaded via CDN ES modules) |

---

## Firestore Data Model

All user data lives under a **single document** per user:

```
users/{uid}/data/workout_data
├── workoutPlans: Array<Plan>
├── workoutHistory: Array<Workout>
├── exerciseLibrary: Array<string>
├── selectedPlanId: number | null
├── bodyWeightEntries: Array<{date: string, weight: number}>
├── bodyWeightGoal: number | null
├── restTimerSettings: {default: number, exerciseOverrides: Object}
└── lastUpdated: ISO timestamp string
```

Public plan library lives in a separate top-level collection:

```
public_plans/{planId}
├── name: string
├── description: string
├── difficulty: 'beginner' | 'intermediate' | 'advanced' | 'specialized'
├── daysPerWeek: number
├── days: Array<Day>
├── tags: Array<string>
└── id: string
```

There are no migration files — Firestore's flexible schema means data shape is defined and evolved directly in `app.js`.

---

## State Management

Global mutable state is declared at the top of `app.js` (lines 27–56):

```javascript
let workoutPlans = [];
let workoutHistory = [];
let currentWorkout = null;
let selectedPlanId = null;
let exerciseLibrary = [];
let bodyWeightEntries = [];
let bodyWeightGoal = null;
let restTimerSettings = {};
let progressPhotos = [];
let profilePhotoURL = null;
let currentUser = null;
let unsubscribeSnapshot = null;
// ... plus timer/interval state
```

**Data flow:**

```
User Action
  → Update in-memory global state
  → Call saveToFirebase()
  → Write to Firestore

Firestore change (including own writes)
  → onSnapshot() fires
  → Global state updated
  → UI re-rendered
```

`localStorage` is used only for: `theme` preference (`dark`/`light`) and PWA install prompt dismissal.

---

## Application Architecture

`app.js` is organized into logical sections separated by comment dividers (`// ═════`):

1. **Authentication Module** (~lines 61–195) — login, signup, Google auth, profile management
2. **Data Persistence** — `saveToFirebase()`, `onSnapshot()` listener, `loadData()`
3. **View Routing** — `showView(viewName)` swaps active sections in `index.html`
4. **Workout Plans** — CRUD for plans, multi-day rotation, plan library browser
5. **Active Workout Logging** — set/rep/weight input, rest timer, elapsed time
6. **Progress Tracking** — PRs, volume charts (Canvas API), workout history
7. **Body Weight Tracking** — weight entries, goal, trend chart (Canvas API)
8. **Progress Photos** — Firebase Storage upload/list/delete
9. **Exercise Library** — search/filter across `EXERCISE_DATABASE.js`
10. **Settings** — rest timer defaults, CSV export, account management

`index.html` contains all view markup with sections toggled via CSS `display` — there is no client-side router library.

---

## Code Conventions

### Naming
- **Variables and functions:** `camelCase`
- **UI-facing text:** `UPPERCASE` (stylistic brand choice throughout the app)
- **Constants:** no formal ALL_CAPS convention; just camelCase globals

### HTML Generation
Use template literals with `Array.map().join('')`:
```javascript
container.innerHTML = items.map(item => `
  <div class="item">${escapeHtml(item.name)}</div>
`).join('');
```

### Security — Always Escape User Content
The `escapeHtml()` function must be used on **all** user-supplied strings before inserting into the DOM. Never use `.innerHTML` with raw user data.

```javascript
function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}
```

### User Feedback
Use the toast notification system for all action feedback:
```javascript
showToast('Message text', 'success' | 'error' | 'info');
```
Do not use `alert()` or `confirm()`.

### Styling Conventions
- Use existing CSS custom properties (variables) for colors and spacing — do not hardcode values
- Dark/light theme is implemented via `:root` variable overrides; toggled with the `light-theme` class on `<body>`
- Responsive breakpoints: `768px` (tablet) and `480px` (mobile)
- Animations defined as `@keyframes` in `styles.css`; do not use inline JS animation

### Firebase Operations
- Always `await` Firestore operations and wrap in `try/catch`
- Use `updateDoc()` for partial updates; use `setDoc()` only for initial document creation
- Real-time sync is via `onSnapshot()`; avoid polling

---

## Development Workflow

### Running Locally
Open `index.html` directly in a browser, or serve with any static file server:
```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```
No install step, no build step, no compilation.

### Making Changes
1. Edit the relevant file (`app.js`, `index.html`, `styles.css`, etc.)
2. Reload the browser — changes take effect immediately
3. Test on mobile viewport sizes (the app is primarily mobile-first)

### Deployment
Deployment is automatic via GitHub Pages — any push to `master` deploys the live app. There is no staging environment.

### Service Worker Cache
After changes to cached assets, bump the cache version in `service-worker.js`:
```javascript
const CACHE_NAME = 'iron-track-v2'; // increment version
```
Otherwise users on the PWA may see stale files.

---

## Testing

There is no automated test suite. Testing is done manually in the browser. When making changes:

- Test authentication flows (login, signup, logout, Google auth)
- Test data persistence (create a workout, reload, verify data survives)
- Test offline behavior (disable network in DevTools, verify cached assets load)
- Test on mobile viewport (DevTools device emulation at 375px width)
- Verify no console errors or unhandled promise rejections

---

## Key Files Reference

| File | What to edit it for |
|------|-------------------|
| `app.js` | All business logic, event handlers, UI rendering, Firebase operations |
| `index.html` | Adding new UI sections/views, modifying form structure |
| `styles.css` | All visual styling changes, new animations, theme variables |
| `EXERCISE_DATABASE.js` | Adding or modifying pre-loaded exercises |
| `firebase-config.js` | Firebase project configuration (rarely changed) |
| `service-worker.js` | Cache strategy changes, bumping cache version |
| `manifest.json` | PWA metadata (name, icons, theme color) |

---

## Common Pitfalls

1. **Do not introduce npm dependencies.** This project has zero external dependencies by design. Use vanilla JS and Web APIs.
2. **Do not add a build step.** Files must remain directly servable without compilation.
3. **Always escape HTML** from user input before `.innerHTML` insertion — the `escapeHtml()` helper exists for this purpose.
4. **Bump the service worker cache version** when modifying `app.js`, `styles.css`, or `index.html`, or PWA users will get cached stale files.
5. **Firestore is the single source of truth.** Do not try to maintain separate local state that diverges from Firestore — rely on `onSnapshot()` to keep state in sync.
6. **The app is mobile-first.** Always verify changes look correct at 375px–480px viewport width.
7. **Do not push to `master` without testing** — it deploys immediately to the live site.
