import os
import sys
from pathlib import Path
import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv
import bcrypt

dotenv_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=dotenv_path, override=True)

DATABASE_URL = os.getenv("DATABASE_URL")

def run_migrations():
    """
    Executes idempotent database migrations:
    1. Checks/Enables pgvector extension if available in Postgres libdir.
    2. Creates skill_documentation_chunks table for RAG knowledge base.
    3. Creates users and user_sessions tables for secure authentication.
    4. Adds user_id scoping to skills, student_career_goals, learning_milestones, study_activity_logs.
    5. Seeds default demo user Alex Rivera (id=1) to ensure 100% backward compatibility.
    """
    if not DATABASE_URL or "YOUR_PASSWORD" in DATABASE_URL:
        print("[Migrations] Error: DATABASE_URL not properly configured.")
        sys.exit(1)

    print(f"[Migrations] Connecting to database...")
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # 1. Attempt pgvector extension
            has_pgvector = False
            try:
                cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
                conn.commit()
                has_pgvector = True
                print("[Migrations] ✅ Native pgvector extension is ENABLED.")
            except Exception as e:
                conn.rollback()
                print(f"[Migrations] ℹ️ Native pgvector C-extension not pre-copied to libdir: {e.args[0] if e.args else e}")
                print("[Migrations] ℹ️ Using native PostgreSQL double precision[] array vector storage with cosine similarity.")

            # 2. Create skill_documentation_chunks table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS skill_documentation_chunks (
                    id SERIAL PRIMARY KEY,
                    skill_name VARCHAR(100) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    content TEXT NOT NULL,
                    source_url TEXT,
                    topic VARCHAR(100) DEFAULT 'General',
                    difficulty VARCHAR(50) DEFAULT 'Intermediate',
                    chunk_index INTEGER DEFAULT 0,
                    embedding DOUBLE PRECISION[] NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_chunks_skill ON skill_documentation_chunks(skill_name);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_chunks_title ON skill_documentation_chunks(title);")

            # Add topic and difficulty if upgrading existing table
            cur.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='skill_documentation_chunks' AND column_name='topic'
                    ) THEN
                        ALTER TABLE skill_documentation_chunks ADD COLUMN topic VARCHAR(100) DEFAULT 'Engineering';
                    END IF;
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='skill_documentation_chunks' AND column_name='difficulty'
                    ) THEN
                        ALTER TABLE skill_documentation_chunks ADD COLUMN difficulty VARCHAR(50) DEFAULT 'Intermediate';
                    END IF;
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name='skill_documentation_chunks' AND column_name='user_id'
                    ) THEN
                        ALTER TABLE skill_documentation_chunks ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
                        CREATE INDEX IF NOT EXISTS idx_chunks_user_id ON skill_documentation_chunks(user_id);
                    END IF;
                END $$;
            """)

            # If pgvector extension is enabled, add vector column and HNSW index
            if has_pgvector:
                try:
                    cur.execute("""
                        DO $$
                        BEGIN
                            IF NOT EXISTS (
                                SELECT 1 FROM information_schema.columns 
                                WHERE table_name='skill_documentation_chunks' AND column_name='embedding_vector'
                            ) THEN
                                ALTER TABLE skill_documentation_chunks ADD COLUMN embedding_vector vector(768);
                            END IF;
                        END $$;
                    """)
                    cur.execute("""
                        CREATE INDEX IF NOT EXISTS idx_chunks_hnsw 
                        ON skill_documentation_chunks USING hnsw (embedding_vector vector_cosine_ops);
                    """)
                    print("[Migrations] ✅ pgvector HNSW index initialized.")
                except Exception as e:
                    print(f"[Migrations] Note on vector index: {e}")

            # 3. Create users table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(150) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);")

            # 4. Create user_sessions table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS user_sessions (
                    token VARCHAR(64) PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMPTZ NOT NULL
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);")

            # 5. Add user_id column to existing tables for multi-user isolation
            tables_to_scope = [
                ("skills", "user_id"),
                ("student_career_goals", "user_id"),
                ("learning_milestones", "user_id"),
                ("study_activity_logs", "user_id")
            ]
            for tbl, col in tables_to_scope:
                cur.execute(f"""
                    DO $$
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns 
                            WHERE table_name='{tbl}' AND column_name='{col}'
                        ) THEN
                            ALTER TABLE {tbl} ADD COLUMN {col} INTEGER DEFAULT 1;
                        END IF;
                    END $$;
                """)

            # 5b. Fix unique constraints for proper per-user multi-tenancy
            try:
                cur.execute("ALTER TABLE study_activity_logs DROP CONSTRAINT IF EXISTS study_activity_logs_activity_date_key;")
                cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_study_user_date ON study_activity_logs (activity_date, user_id);")
                cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_career_goal ON student_career_goals (user_id);")
                print("[Migrations] ✅ Multi-user constraints configured on study_activity_logs and student_career_goals.")
            except Exception as e:
                print(f"[Migrations] Note on constraints: {e}")

            # 6. Seed Demo User Alex Rivera (id=1)
            cur.execute("SELECT id FROM users WHERE id = 1 OR email = 'alex.rivera@example.com';")
            demo_user = cur.fetchone()
            if not demo_user:
                demo_pw = "DemoPassword123!"
                salt = bcrypt.gensalt()
                hashed = bcrypt.hashpw(demo_pw.encode("utf-8"), salt).decode("utf-8")
                cur.execute("""
                    INSERT INTO users (id, name, email, password_hash)
                    VALUES (1, 'Alex Rivera', 'alex.rivera@example.com', %s)
                    ON CONFLICT (id) DO NOTHING;
                """, (hashed,))
                # Adjust sequence if needed
                cur.execute("SELECT setval(pg_get_serial_sequence('users', 'id'), coalesce(max(id), 1)) FROM users;")
                print("[Migrations] ✅ Seeded default demo user 'Alex Rivera' (alex.rivera@example.com).")
            else:
                print(f"[Migrations] Demo user exists (ID: {demo_user['id']}).")

            # 7. Create assessments table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS assessments (
                    id SERIAL PRIMARY KEY,
                    career_role_id INTEGER REFERENCES career_roles(id) ON DELETE CASCADE,
                    skill_name VARCHAR(100) NOT NULL,
                    question_type VARCHAR(50) NOT NULL,
                    question_text TEXT NOT NULL,
                    code_snippet TEXT,
                    options JSONB,
                    correct_answer TEXT NOT NULL,
                    explanation TEXT,
                    difficulty VARCHAR(50) DEFAULT 'Intermediate',
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_assessments_role ON assessments(career_role_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_assessments_skill ON assessments(skill_name);")

            # 8. Create assessment_attempts table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS assessment_attempts (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    career_role_id INTEGER REFERENCES career_roles(id) ON DELETE SET NULL,
                    score_percentage NUMERIC(5, 2) NOT NULL,
                    estimated_level VARCHAR(50) NOT NULL,
                    confidence_rating VARCHAR(50) NOT NULL,
                    total_questions INTEGER NOT NULL,
                    correct_count INTEGER NOT NULL,
                    skill_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
                    answers_payload JSONB,
                    attempt_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_attempts_user ON assessment_attempts(user_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_attempts_role ON assessment_attempts(career_role_id);")

            # 9. Create daily_plans table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS daily_plans (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    plan_date DATE NOT NULL,
                    available_minutes INTEGER DEFAULT 60,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT unq_user_plan_date UNIQUE (user_id, plan_date)
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_plans_user_date ON daily_plans(user_id, plan_date);")

            # 10. Create daily_tasks table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS daily_tasks (
                    id SERIAL PRIMARY KEY,
                    daily_plan_id INTEGER REFERENCES daily_plans(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    task_type VARCHAR(50) DEFAULT 'milestone',
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    skill_name VARCHAR(100),
                    estimated_minutes INTEGER DEFAULT 30,
                    status VARCHAR(50) DEFAULT 'pending',
                    reason TEXT,
                    milestone_id INTEGER,
                    project_id INTEGER,
                    resource_url TEXT,
                    started_at TIMESTAMPTZ,
                    completed_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_daily_tasks_plan ON daily_tasks(daily_plan_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_daily_tasks_user ON daily_tasks(user_id);")

            # 11. Create projects table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS projects (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    career_role_id INTEGER REFERENCES career_roles(id) ON DELETE SET NULL,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    target_skills TEXT[] DEFAULT '{}',
                    difficulty VARCHAR(50) DEFAULT 'Intermediate',
                    estimated_hours NUMERIC(6, 1) DEFAULT 20.0,
                    status VARCHAR(50) DEFAULT 'In Progress',
                    start_date DATE,
                    target_date DATE,
                    github_url TEXT,
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);")

            # 12. Create project_milestones table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS project_milestones (
                    id SERIAL PRIMARY KEY,
                    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    title VARCHAR(255) NOT NULL,
                    completed BOOLEAN DEFAULT FALSE,
                    completed_at TIMESTAMPTZ,
                    order_index INTEGER DEFAULT 0,
                    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_prj_milestones ON project_milestones(project_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_prj_milestones_user ON project_milestones(user_id);")

            # Seed Assessment Questions
            cur.execute("SELECT count(*) as count FROM assessments;")
            if cur.fetchone()["count"] == 0:
                cur.execute("SELECT id, name FROM career_roles;")
                all_roles = cur.fetchall()
                roles_map = {r["name"]: r["id"] for r in all_roles}
                backend_role_id = roles_map.get("Backend & Distributed Systems Engineer", 2)

                sample_questions = [
                    (
                        backend_role_id, "Python", "code_output",
                        "What is the output of the following generator function in Python?",
                        "def gen():\n    yield 1\n    yield 2\ng = gen()\nprint(next(g), next(g))",
                        '["1 2", "2 1", "Error", "None None"]',
                        "1 2",
                        "Generators in Python yield elements sequentially when next() is called.",
                        "Beginner"
                    ),
                    (
                        backend_role_id, "Python", "debugging",
                        "What bug occurs when using a mutable default argument like `lst=[]` in a Python function?",
                        "def append_item(val, lst=[]):\n    lst.append(val)\n    return lst",
                        '["Default list is evaluated once at definition time and shared across calls", "Raises a SyntaxError on execution", "The list is automatically cleared after return", "Causes an infinite recursion loop"]',
                        "Default list is evaluated once at definition time and shared across calls",
                        "Python default arguments are evaluated once at definition time, mutating the same list across invocations.",
                        "Intermediate"
                    ),
                    (
                        backend_role_id, "PostgreSQL", "concepts",
                        "Which index type is best suited for equality and range queries on standard scalar data in PostgreSQL?",
                        None,
                        '["B-tree", "Hash", "GIN", "BRIN"]',
                        "B-tree",
                        "B-tree is PostgreSQL's default and optimal index structure for comparison operators (<, <=, =, >=, >).",
                        "Intermediate"
                    ),
                    (
                        backend_role_id, "PostgreSQL", "code_output",
                        "What is the output of the query `SELECT COALESCE(NULL, 'fallback');`?",
                        "SELECT COALESCE(NULL, 'fallback');",
                        '["\'fallback\'", "NULL", "Error", "Empty string"]',
                        "'fallback'",
                        "COALESCE returns the first non-NULL expression among its arguments.",
                        "Beginner"
                    ),
                    (
                        backend_role_id, "Docker", "debugging",
                        "Why do multi-stage Docker builds reduce production image footprints?",
                        None,
                        '["They copy only compile artifacts into a slim runtime image, discarding build dependencies", "They automatically compress image layers with gzip", "They delete intermediate containers during build time", "They bypass OS kernel namespaces"]',
                        "They copy only compile artifacts into a slim runtime image, discarding build dependencies",
                        "Multi-stage builds leave build-time tools (like gcc, headers, dev dependencies) behind in early stages.",
                        "Intermediate"
                    ),
                    (
                        backend_role_id, "FastAPI", "mcq",
                        "Which library does FastAPI utilize for automatic request data validation and serialization?",
                        None,
                        '["Pydantic", "Marshmallow", "SQLAlchemy", "Celery"]',
                        "Pydantic",
                        "FastAPI leverages Pydantic models for request validation, error formatting, and serialization.",
                        "Beginner"
                    ),
                    (
                        backend_role_id, "Distributed Systems", "short_answer",
                        "Which architectural pattern decouples message producers from consumers to absorb load spikes asynchronously?",
                        None,
                        '["Message Queue / Event Broker", "Synchronous HTTP/2 streaming", "Shared database polling", "Thread pooling"]',
                        "Message Queue / Event Broker",
                        "Message queues like RabbitMQ or Kafka decouple services and buffer incoming traffic.",
                        "Advanced"
                    ),
                    (
                        backend_role_id, "Data Structures", "concepts",
                        "What is the average time complexity for key lookup in a hash table with a good hash function?",
                        None,
                        '["O(1)", "O(log n)", "O(n)", "O(n log n)"]',
                        "O(1)",
                        "Hash tables provide average O(1) constant time lookup by hashing keys directly to array buckets.",
                        "Beginner"
                    )
                ]

                for q in sample_questions:
                    cur.execute("""
                        INSERT INTO assessments 
                        (career_role_id, skill_name, question_type, question_text, code_snippet, options, correct_answer, explanation, difficulty)
                        VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s);
                    """, q)
                print(f"[Migrations] ✅ Seeded {len(sample_questions)} practical career assessment questions.")

            # Seed Demo Projects for Alex Rivera (user_id=1)
            cur.execute("SELECT count(*) as count FROM projects WHERE user_id = 1;")
            if cur.fetchone()["count"] == 0:
                cur.execute("""
                    INSERT INTO projects 
                    (user_id, career_role_id, title, description, target_skills, difficulty, estimated_hours, status, start_date, target_date, github_url, notes)
                    VALUES (
                        1, 2, 'Student REST API',
                        'Production-grade REST API backend with token authentication, PostgreSQL connection pooling, and Docker containerization.',
                        ARRAY['Python', 'FastAPI', 'PostgreSQL', 'REST', 'Testing', 'Docker'],
                        'Intermediate', 24.0, 'In Progress', CURRENT_DATE - 14, CURRENT_DATE + 14,
                        'https://github.com/alexrivera/student-rest-api',
                        'Focused on high-performance endpoint design and strict test coverage.'
                    ) RETURNING id;
                """)
                p1_id = cur.fetchone()["id"]
                p1_milestones = [
                    ("Requirements & API Spec", True),
                    ("PostgreSQL Database Schema", True),
                    ("FastAPI CRUD Endpoints", True),
                    ("Session Token Authentication", True),
                    ("Unit & Integration Testing", False),
                    ("Docker Containerization", False),
                    ("Cloud Deployment", False),
                    ("Technical README Documentation", False)
                ]
                for idx, (title, comp) in enumerate(p1_milestones):
                    cur.execute("""
                        INSERT INTO project_milestones (project_id, user_id, title, completed, completed_at, order_index)
                        VALUES (%s, 1, %s, %s, CASE WHEN %s THEN NOW() ELSE NULL END, %s);
                    """, (p1_id, title, comp, comp, idx))

                cur.execute("""
                    INSERT INTO projects 
                    (user_id, career_role_id, title, description, target_skills, difficulty, estimated_hours, status, start_date, target_date, github_url, notes)
                    VALUES (
                        1, 2, 'Distributed Task Worker & Cache Service',
                        'High-throughput asynchronous task queue using Redis pub/sub, worker threads, and dead-letter queue retry mechanisms.',
                        ARRAY['Python', 'Distributed Systems', 'Redis', 'Docker'],
                        'Advanced', 36.0, 'Planning', CURRENT_DATE - 3, CURRENT_DATE + 21,
                        'https://github.com/alexrivera/distributed-task-worker',
                        'Benchmarking queue latency under high concurrent load.'
                    ) RETURNING id;
                """)
                p2_id = cur.fetchone()["id"]
                p2_milestones = [
                    ("System Architecture Specification", True),
                    ("Redis Connection & Heartbeat", False),
                    ("Worker Concurrency Loop", False),
                    ("Dead-Letter Queue & Retries", False),
                    ("Load Testing & Latency Report", False)
                ]
                for idx, (title, comp) in enumerate(p2_milestones):
                    cur.execute("""
                        INSERT INTO project_milestones (project_id, user_id, title, completed, completed_at, order_index)
                        VALUES (%s, 1, %s, %s, CASE WHEN %s THEN NOW() ELSE NULL END, %s);
                    """, (p2_id, title, comp, comp, idx))

                print("[Migrations] ✅ Seeded initial showcase portfolio projects for demo student Alex Rivera.")

            conn.commit()
            print("[Migrations] ✅ All schema migrations completed successfully!")

if __name__ == "__main__":
    run_migrations()

