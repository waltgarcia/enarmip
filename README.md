# ENARM•AI

> AI-powered study platform for the ENARM (Examen Nacional de Residencias Médicas) — the national residency entrance exam in Mexico.

ENARM•AI helps medical students and physicians prepare with AI-generated clinical cases, timed mock exams, thematic study sessions, flashcards, and a curated question bank grounded in Mexican clinical practice guidelines (GPC / CENETEC).

---

## Features

| Module | Description |
|---|---|
| **Dashboard** | Performance charts by specialty, streak tracker, and recent activity |
| **Guidelines** | Upload & manage GPC PDFs; the AI uses them as the primary source for questions |
| **Generate Cases** | Upload a PDF (or pick a guideline) → Claude generates 3-tier clinical vignettes aligned to ENARM format |
| **Thematic Study** | Guided study sessions with explanations, per-specialty, powered by Claude |
| **Exam** | Standard mode (immediate feedback) and Simulacro mode (timed, blind); keyboard shortcuts 1-5 / Enter / N |
| **Results** | Detailed breakdown with charts, topic heatmap, and per-question review |
| **Flashcards** | Spaced-repetition deck with AI micro-lessons on wrong answers |
| **Admin** | Approve/reject generated questions, manage the question bank, manage user roles |

**Cross-cutting quality**
- Bilingual ES / EN — toggle in the top bar, persisted in `localStorage`
- Toast notifications (success / error / info / warning)
- Offline detection banner
- Lazy-loaded pages with Suspense spinner
- Mobile-first: sidebar collapses to a bottom tab bar on < 768 px
- Keyboard shortcuts in Exam (keys `1`–`5`, `Enter`, `N`)
- `document.title` updated per route; scroll-to-top on navigation

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + Vite |
| Routing | React Router v6 |
| Styling | Tailwind CSS v3 (custom design system) |
| Charts | Recharts |
| Icons | Lucide React |
| Backend / Auth / Storage | Supabase (PostgreSQL, Auth, Storage) |
| AI | Anthropic Claude 3.5 Sonnet |
| PDF parsing | pdf.js (CDN) |
| Confetti | canvas-confetti |

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- A [Supabase](https://supabase.com) project
- An [Anthropic](https://console.anthropic.com) API key

### 1 — Clone & install

```bash
git clone https://github.com/waltgarcia/enarmip.git
cd enarmip
npm install
```

### 2 — Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

> **Security note:** The Anthropic key is used directly from the browser in this prototype. For production, proxy Claude calls through a Supabase Edge Function or similar server-side handler so the key is never exposed to clients.

### 3 — Set up the database

Open your Supabase project → **SQL Editor** and run the migrations in order:

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_add_guidelines_source.sql
```

#### Storage bucket

Create a storage bucket named `guidelines-pdfs` with **authenticated uploads** (the app scopes files under `{userId}/`).

#### Row-Level Security (RLS)

Enable RLS on all tables. Suggested policies:

```sql
-- profiles: users can read/update their own row
alter table profiles enable row level security;
create policy "own profile" on profiles
  using (auth.uid() = id) with check (auth.uid() = id);

-- question_bank: approved questions are public-readable
alter table question_bank enable row level security;
create policy "approved public" on question_bank
  for select using (approved = true);
create policy "owner insert" on question_bank
  for insert with check (auth.uid() is not null);

-- guidelines: public rows are public-readable
alter table guidelines enable row level security;
create policy "public guidelines" on guidelines
  for select using (is_public = true or auth.uid() = uploaded_by);
create policy "authenticated insert" on guidelines
  for insert with check (auth.uid() is not null);
```

> Adjust these to match your application's access requirements.

### 4 — Run locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | ESLint (max-warnings 0) |

---

## Project Structure

```
src/
├── context/
│   ├── AuthContext.jsx      # Supabase auth + profile
│   ├── LangContext.jsx      # Bilingual ES/EN + translations
│   └── ToastContext.jsx     # Global toast system
├── hooks/
│   └── useDebounce.js       # 300 ms debounce hook
├── lib/
│   ├── claude.js            # Anthropic API helpers
│   └── supabase.js          # Supabase client + storage helpers
├── components/
│   ├── layout/
│   │   ├── AppLayout.jsx
│   │   ├── Sidebar.jsx
│   │   ├── TopBar.jsx       # Language toggle + user menu
│   │   └── BottomTabBar.jsx # Mobile bottom navigation
│   ├── ProtectedRoute.jsx
│   └── ScrollToTop.jsx
└── pages/
    ├── Login.jsx / Signup.jsx
    ├── Dashboard.jsx
    ├── Guidelines.jsx
    ├── Generate.jsx
    ├── Study.jsx
    ├── Exam.jsx
    ├── Results.jsx
    ├── Flashcards.jsx
    └── Admin.jsx
supabase/
└── migrations/
    ├── 001_initial_schema.sql
    └── 002_add_guidelines_source.sql
public/
└── favicon.svg
```

---

## Database Schema (overview)

| Table | Purpose |
|---|---|
| `profiles` | Extends `auth.users` — full name, role (`student` / `admin` / `institution`), institution |
| `guidelines` | Uploaded GPC PDFs metadata + file path in Supabase Storage |
| `question_bank` | Clinical vignettes with options, explanations, metadata, and approval state |
| `exam_sessions` | Exam attempt headers (mode, count, duration, score) |
| `exam_answers` | Per-question answer records linked to a session |

---

## Roles

| Role | Access |
|---|---|
| `student` | Full exam / study / flashcards; can upload guidelines and submit generated questions for review |
| `institution` | Same as student |
| `admin` | All of the above + Admin panel (approve/reject questions, manage users) |

First admin must be promoted manually in the Supabase `profiles` table (`role = 'admin'`).

---

## Design System

| Token | Value |
|---|---|
| Background | `#0a0e1a` |
| Surface | `#111827` |
| Accent Blue | `#3b82f6` |
| Accent Cyan | `#06b6d4` |
| Success | `#22c55e` |
| Warning | `#f59e0b` |
| Error | `#ef4444` |
| Heading font | Syne |
| Body font | DM Sans |
| Border radius | 12 px |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes and push
4. Open a Pull Request — the CI checks ESLint before merge

---

## License

This project is released under the **MIT License**. See [LICENSE](LICENSE) for details.

