# LearnOrbit: AI Student Career & Skill Planner

An intelligent, full-stack educational planning platform engineered with **React**, **FastAPI**, **PostgreSQL 16**, **pgvector/RAG**, and **Google Gemini AI**. The application analyzes real-time student skill levels against target engineering roles, calculates weighted readiness scores, orchestrates personalized multi-phase learning roadmaps, logs daily study streaks with a 12-week GitHub-style activity heatmap, and provides an AI Staff Engineer Mentor grounded in both student data and a technical knowledge base.

---

## 1. Project Overview

Students pursuing software engineering often struggle to identify exact skill gaps between their current competencies and industry expectations. LearnOrbit bridges this divide through:
- **Dynamic Skill Benchmarking**: Real-time evaluation of user skills against verified industry roles.
- **Strategic Learning Roadmaps**: Algorithmic sequencing of missing skills prioritized by industry weight and projected readiness gain.
- **Study Habit Formation**: Daily session logging, streak monitoring, and visual intensity heatmaps.
- **RAG-Powered AI Career Mentor**: A conversational assistant grounded in live student metrics and verified technical documentation via semantic vector search.
- **Production-Grade Multi-User Architecture**: Secure bcrypt authentication, session token lifecycle management, and user data isolation.

---

## 2. Core Features

### A. Skills CRUD & Inventory
- Full Create, Read, Update, Delete capabilities backed by PostgreSQL.
- Category filtering (`Frontend`, `Backend`, `AI & Data`, `DevOps & Cloud`).
- Multi-tier proficiency levels: `Beginner`, `Intermediate`, `Advanced`.

### B. Career Roles & Benchmark Alignment
- Predefined industry profiles:
  - Full-Stack AI & Cloud Systems Engineer
  - Backend & Distributed Systems Engineer
  - Frontend & Modern Web Architect
  - Data Scientist
  - AI/ML Engineer
- Required skill importance weightings (`Core`, `Important`, `Optional`).

### C. Skill-Gap & Readiness Engine
- Mathematical formula:
  $$\text{Readiness} = \frac{\sum (\text{Proficiency Multiplier} \times \text{Weight})}{\sum \text{Required Weights}} \times 100$$
  - Multipliers: `Advanced` = 1.0, `Intermediate` = 0.8, `Beginner` = 0.5, `Missing` = 0.0.
- Dynamic categorization of matched skills, missing competencies, and highest-impact next skills.

### D. Learning Planner & Curriculum Milestones
- Tailored milestones and curated educational resource links for missing skills.
- Interactive milestone toggle with optimistic UI updates.
- Projected cumulative readiness trajectory.

### E. Study Streak & 12-Week Heatmap
- GitHub-style 84-day activity grid with 4 intensity levels based on minutes studied.
- Current streak and longest streak calculations.
- Quick session logger with focus areas.

### F. RAG Knowledge Base & Semantic Search
- Knowledge base table `skill_documentation_chunks` in PostgreSQL.
- Dense 768-dimensional embeddings generated with Google Gemini (`gemini-embedding-001`).
- Cosine similarity vector search returning ranked passages with confidence scores.
- Support for native pgvector C-extension (`vector(768)` with HNSW index).

### G. AI Career Mentor
- Glassmorphic slide-out drawer with markdown parsing, code syntax blocks, and suggested prompt chips.
- Two-tier grounding: Live student PostgreSQL metrics + top relevant technical knowledge chunks retrieved via semantic search.
- Citation attribution and context highlight cards.

### H. Secure User Authentication
- `users` and `user_sessions` tables.
- Passwords salted and hashed with `bcrypt`.
- 64-character cryptographically secure session tokens.
- Graceful backward-compatible fallback for demo data (Alex Rivera, `id=1`).

---

## 3. Architecture Diagram

```
┌────────────────────────────────────────────────────────┐
│                   React 19 Frontend                    │
│    (Vite, Hash Router, Glassmorphic UI, AIChatDrawer)   │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / REST (JSON)
                            ▼
┌────────────────────────────────────────────────────────┐
│                  FastAPI Backend Server                │
│  - Auth & Session Dependency (Bearer Token)           │
│  - Pydantic v2 Request Validation & Error Handling    │
│  - Domain Business Logic (Readiness, Roadmap, Streak)  │
└──────────────┬─────────────────────────┬───────────────┘
               │                         │
               │ psycopg (dict_row)      │ HTTPS (httpx)
               ▼                         ▼
┌───────────────────────────┐ ┌──────────────────────────┐
│   PostgreSQL 16 Database  │ │    Google Gemini API     │
│  - users & sessions       │ │  - gemini-3.6-flash      │
│  - skills & career roles  │ │  - gemini-embedding-001  │
│  - milestones & activity  │ └──────────────────────────┘
│  - skill_documentation_   │
│    chunks (768-dim RAG)   │
└───────────────────────────┘
```

---

## 4. Technology Stack

- **Frontend**: React 19, Vite 6, Modern Vanilla CSS Design Tokens, HTML5.
- **Backend**: Python 3.12+, FastAPI 0.141, Uvicorn, psycopg 3.3 (PostgreSQL driver), Pydantic v2, python-dotenv, bcrypt.
- **Database**: PostgreSQL 16, pgvector extension compatible.
- **AI & Embeddings**: Google Gemini REST API (`gemini-3.6-flash` generation, `gemini-embedding-001` 768-dim embeddings).

---

## 5. Folder Structure

```
1st project/
├── .env.example                 # Root environment template
├── .gitignore                   # Git ignore file (excludes secrets, venv, dist, logs)
├── index.html                   # Single-page application root
├── package.json                 # Node dependencies and build scripts
├── vite.config.js               # Vite bundler configuration
│
├── backend/
│   ├── .env                     # Local secrets (ignored by git)
│   ├── .env.example             # Backend environment template
│   ├── main.py                  # Primary FastAPI API routing and application shell
│   ├── ai_service.py            # Gemini client, context builder, prompt engineering
│   ├── rag_service.py           # Embeddings, semantic search, starter knowledge ingestion
│   ├── auth_service.py          # Bcrypt hashing, token management, session resolver
│   ├── migrations.py            # Idempotent database schema migration runner
│   ├── test_suite.py            # Automated backend regression test suite (38 tests)
│   ├── seed_learning_planner.py # Seed data for roles, resources, milestones
│   └── pgvector_build/          # Precompiled pgvector library and install script
│       ├── vector.dylib
│       ├── vector.control
│       ├── vector--0.8.6.sql
│       └── install_pgvector.sh
│
└── src/
    ├── main.jsx                 # React root renderer
    ├── App.jsx                  # Main application container, navigation, state
    ├── styles.css               # Central design system, CSS tokens, dark/light theme
    ├── apiConfig.js             # Dynamic backend URL resolver (VITE_API_BASE_URL)
    ├── components/
    │   ├── Navbar.jsx           # App top bar with streak badges and drawer toggle
    │   ├── Sidebar.jsx          # Collapsible navigation sidebar
    │   ├── Modals.jsx           # Profile, Add Skill, Edit Skill modal dialogs
    │   └── AIChatDrawer.jsx     # Slide-out glassmorphic AI Mentor with markdown
    ├── data/
    │   └── initialData.js       # Fallback mock profiles and initial curriculum data
    └── pages/
        ├── DashboardView.jsx        # Executive summary, readiness cards, quick actions
        ├── SkillsView.jsx           # Full CRUD skill inventory with search & filter
        ├── CareerGoalView.jsx       # Target role selector, readiness breakdown, gaps
        ├── LearningPlannerView.jsx  # Interactive roadmap, milestone toggles, study logger
        ├── LearningProgressView.jsx # Progress overview and milestone statistics
        └── ProjectsView.jsx         # Portfolio project showcases
```

---

## 6. Local Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- Python 3.10+ (Python 3.12 / 3.14 compatible)
- PostgreSQL 16 installed and running locally
- Google Gemini API Key

### Step-by-Step Installation

1. **Clone repository and open directory**:
   ```bash
   cd "1st project"
   ```

2. **Frontend Dependencies**:
   ```bash
   npm install
   ```

3. **Backend Virtual Environment**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install fastapi uvicorn psycopg psycopg-binary python-dotenv pydantic httpx bcrypt
   ```

---

## 7. PostgreSQL Setup

1. Verify that PostgreSQL 16 is running on port `5432`:
   ```bash
   psql -U postgres
   ```
2. Create the project database:
   ```sql
   CREATE DATABASE student_career;
   ```

---

## 8. Environment Variables

Create `backend/.env` with your credentials:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/student_career
GEMINI_API_KEY=AIzaSyYourGeminiApiKeyHere
AI_PROVIDER=google-gemini
GEMINI_MODEL=gemini-3.6-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000
ENVIRONMENT=development
```

---

## 9. Google Gemini API Setup

1. Obtain a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Paste the key into `GEMINI_API_KEY` inside `backend/.env`.
3. The backend dynamically reloads changes to `.env` without requiring server restart.

---

## 10. Database Migrations & Seeding

Run the automated migration runner to initialize all tables, indexes, and starter curriculum:

```bash
./venv/bin/python backend/migrations.py
./venv/bin/python backend/seed_learning_planner.py
```

To ingest the 17 starter technical documentation chunks with real Gemini embeddings:
```bash
./venv/bin/python -c "
import sys; sys.path.append('backend')
from rag_service import ingest_knowledge_base
import psycopg; from psycopg.rows import dict_row; from dotenv import load_dotenv; import os
load_dotenv('backend/.env')
with psycopg.connect(os.getenv('DATABASE_URL'), row_factory=dict_row) as conn:
    print(ingest_knowledge_base(conn))
"
```

---

## 11. Running the Application

### Start Backend Server:
```bash
source venv/bin/activate
cd backend
uvicorn main:app --reload --port 8000
```
API will be live at: `http://127.0.0.1:8000`  
Interactive Swagger Docs: `http://127.0.0.1:8000/docs`

### Start Frontend Dev Server:
```bash
npm run dev
```
Application interface will be live at: `http://localhost:3000`

---

## 12. Native pgvector Setup (Optional)

The system automatically operates with native PostgreSQL vector arrays (`double precision[]`) and exact cosine similarity. To activate the precompiled native C-extension `pgvector` in PostgreSQL 16:
```bash
sudo ./backend/pgvector_build/install_pgvector.sh
```
Then execute in PostgreSQL:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## 13. RAG Architecture

```
User Prompt
    │
    ▼
Generate 768-dim Embedding (gemini-embedding-001)
    │
    ▼
PostgreSQL Cosine Similarity Search (skill_documentation_chunks)
    │
    ▼
Top Relevant Knowledge Chunks (Title, Content, Source)
    │
    ├─────────────────────────────┐
    ▼                             ▼
Technical Knowledge      Live Student Context
Passages (RAG)           (Readiness %, Missing Skills, Streak)
    │                             │
    └──────────────┬──────────────┘
                   ▼
            Google Gemini
         (gemini-3.6-flash)
                   │
                   ▼
            Grounded Answer
      (with Markdown & Citations)
```

---

## 14. Authentication System

- **Bcrypt Salted Hashing**: Plaintext passwords never stored.
- **Session Tokens**: 64-character cryptographically secure tokens stored with expiration in `user_sessions`.
- **Bearer Token Auth**: Send `Authorization: Bearer <token>` on protected endpoints.
- **Demo Mode**: Unauthenticated requests gracefully default to Alex Rivera (`user_id = 1`) to ensure seamless evaluation.

---

## 15. Complete API Reference

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/` | API status and feature flags | Public |
| `POST` | `/api/auth/register` | Register new user account | Public |
| `POST` | `/api/auth/login` | Login and receive session token | Public |
| `POST` | `/api/auth/logout` | Revoke session token | Bearer |
| `GET` | `/api/auth/me` | Current user profile | Bearer |
| `GET` | `/api/skills` | List all verified skills | Public / Scoped |
| `POST` | `/api/skills` | Create a new verified skill | Public / Scoped |
| `PUT` | `/api/skills/{id}` | Update skill proficiency | Public / Scoped |
| `DELETE` | `/api/skills/{id}` | Delete a skill | Public / Scoped |
| `GET` | `/api/career-roles` | List all 5 career benchmark roles | Public |
| `GET` | `/api/career-roles/{id}` | Details for specific career role | Public |
| `GET` | `/api/career-goal` | Active student career goal | Public / Scoped |
| `PUT` | `/api/career-goal` | Update active target role | Public / Scoped |
| `GET` | `/api/career-gap-analysis`| Calculate readiness and skill gaps | Public |
| `GET` | `/api/learning-resources` | Curated tutorials and guides | Public |
| `GET` | `/api/learning-milestones` | Curriculum milestones | Public / Scoped |
| `PUT` | `/api/learning-milestones/{id}`| Toggle milestone completed status | Public / Scoped |
| `POST` | `/api/study-activity` | Log a study session | Public / Scoped |
| `GET` | `/api/study-activity` | Streaks, totals, and recent logs | Public / Scoped |
| `GET` | `/api/learning-roadmap` | Sequenced multi-phase learning steps | Public |
| `POST` | `/api/rag/search` | Semantic vector search | Public |
| `POST` | `/api/rag/ingest` | Ingest starter curriculum chunks | Public |
| `GET` | `/api/ai/status` | Gemini configuration status | Public |
| `GET` | `/api/ai/suggested-prompts`| Dynamic career prompt suggestions | Public |
| `POST` | `/api/ai/chat` | AI Career Mentor with RAG | Public |
| `POST` | `/api/ai/rag-chat` | Dedicated RAG conversation endpoint | Public |

---

## 16. Automated Testing

Run the full end-to-end regression test suite:

```bash
./venv/bin/python backend/test_suite.py
```

Expected result:
```
==================================================
TEST SUMMARY: 38 PASSED, 0 FAILED
==================================================
```

Verify frontend production bundle:
```bash
npm run build
```

---

## 17. Production Deployment Preparation

- **Frontend (Vercel / Netlify / Cloudflare Pages)**:
  - Build Command: `npm run build`
  - Output Directory: `dist`
  - Environment Variable: `VITE_API_BASE_URL=https://api.yourdomain.com`
- **Backend (Render / Railway / Fly.io)**:
  - Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
  - Environment Variables: `DATABASE_URL`, `GEMINI_API_KEY`, `CORS_ORIGINS`, `ENVIRONMENT=production`, `SECRET_KEY`
- **Managed PostgreSQL (Supabase / Neon / AWS RDS)**:
  - Enable `vector` extension natively in dashboard or run `backend/migrations.py`.

---

## 18. Security Checklist

- [x] Parameterized SQL queries preventing SQL Injection across all routes.
- [x] Strict Pydantic input length and format validation.
- [x] Passwords hashed with `bcrypt` (never stored in plaintext).
- [x] Session tokens generated using `secrets.token_hex(32)`.
- [x] `GEMINI_API_KEY` stored exclusively in `backend/.env` (never exposed to frontend).
- [x] Input prompt limits (4,000 characters) and history turn bounding (20 turns) to prevent token abuse.
- [x] Strict CORS origin controls via `CORS_ORIGINS`.
- [x] All `.env` and secret files included in `.gitignore`.
