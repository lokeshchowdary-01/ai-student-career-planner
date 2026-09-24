import os
from pathlib import Path
from datetime import date, timedelta
from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row

# Load database configuration
dotenv_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=dotenv_path, override=True)
db_url = os.getenv("DATABASE_URL")

if not db_url:
    raise ValueError("DATABASE_URL is not set in backend/.env")


def create_and_seed_learning_planner():
    with psycopg.connect(db_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            print("Creating tables for Personalized Learning Planner...")

            # 1. Learning Resources Table
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS learning_resources (
                    id SERIAL PRIMARY KEY,
                    skill_name VARCHAR(100) NOT NULL,
                    title VARCHAR(200) NOT NULL,
                    url TEXT NOT NULL,
                    resource_type VARCHAR(50) NOT NULL,
                    difficulty VARCHAR(20) NOT NULL,
                    estimated_hours INT NOT NULL DEFAULT 5,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_resources_skill_name ON learning_resources (skill_name);
                """
            )

            # 2. Learning Milestones Table
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS learning_milestones (
                    id SERIAL PRIMARY KEY,
                    skill_name VARCHAR(100),
                    category VARCHAR(50) NOT NULL,
                    title VARCHAR(250) NOT NULL,
                    completed BOOLEAN NOT NULL DEFAULT FALSE,
                    completed_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_milestones_category ON learning_milestones (category);
                CREATE INDEX IF NOT EXISTS idx_milestones_completed ON learning_milestones (completed);
                """
            )

            # 3. Study Activity Logs Table
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS study_activity_logs (
                    id SERIAL PRIMARY KEY,
                    activity_date DATE UNIQUE NOT NULL,
                    minutes_spent INT NOT NULL DEFAULT 60,
                    activities_completed INT NOT NULL DEFAULT 1,
                    focus_area VARCHAR(100),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_activity_date ON study_activity_logs (activity_date);
                """
            )
            conn.commit()
            print("Tables created successfully.")

            # Seed 1: Learning Resources
            cur.execute("SELECT COUNT(*) AS count FROM learning_resources;")
            if cur.fetchone()["count"] == 0:
                print("Seeding curated learning resources...")
                resources = [
                    # FastAPI
                    ("FastAPI", "FastAPI Official Tutorial & User Guide", "https://fastapi.tiangolo.com/tutorial/", "Official Docs", "Beginner", 6),
                    ("FastAPI", "Building High-Performance Async Microservices with FastAPI", "https://fastapi.tiangolo.com/advanced/", "Interactive Lab", "Intermediate", 8),
                    # PostgreSQL
                    ("PostgreSQL", "PostgreSQL Tutorial for Backend Developers", "https://www.postgresqltutorial.com/", "Interactive Tutorial", "Beginner", 7),
                    ("PostgreSQL", "Use The Index, Luke! - Relational Database Indexing Guide", "https://use-the-index-luke.com/", "Deep Dive", "Advanced", 10),
                    # Docker
                    ("Docker", "Docker Get Started & Containerization Essentials", "https://docs.docker.com/get-started/", "Official Docs", "Beginner", 5),
                    ("Docker", "Multi-Stage Builds & Container Security Best Practices", "https://docs.docker.com/build/building/multi-stage/", "Deep Dive", "Intermediate", 6),
                    # PyTorch
                    ("PyTorch", "PyTorch Deep Learning: A 60 Minute Blitz", "https://pytorch.org/tutorials/beginner/deep_learning_60min_blitz.html", "Interactive Tutorial", "Beginner", 5),
                    ("PyTorch", "Fine-Tuning Transformer Models using PyTorch & HuggingFace", "https://huggingface.co/docs/transformers/training", "Video Course", "Advanced", 12),
                    # React.js
                    ("React.js", "React Official Docs: Quick Start & Thinking in React", "https://react.dev/learn", "Official Docs", "Beginner", 6),
                    ("React.js", "Advanced React Architecture & Custom Hooks Design Patterns", "https://react.dev/learn/reusing-logic-with-custom-hooks", "Deep Dive", "Intermediate", 8),
                    # Python
                    ("Python", "Python Concurrency and Asyncio Masterclass", "https://docs.python.org/3/library/asyncio.html", "Official Docs", "Intermediate", 6),
                    # Git & CI/CD
                    ("Git & CI/CD", "GitHub Actions Workflow Automation & CI/CD Guide", "https://docs.github.com/en/actions", "Official Docs", "Beginner", 4),
                    # Redis & Caching
                    ("Redis & Caching", "Redis University: Distributed Caching Architecture", "https://redis.io/learn", "Course", "Intermediate", 5),
                    # Vector Databases
                    ("Vector Databases", "Vector Search Foundations & Embedding Similarity with Milvus", "https://milvus.io/docs", "Interactive Lab", "Intermediate", 6),
                    # AWS Cloud
                    ("AWS Cloud", "AWS Cloud Practitioner & Serverless Architecture", "https://aws.amazon.com/training/", "Course", "Beginner", 10),
                    # Kubernetes
                    ("Kubernetes", "Kubernetes Hands-On Cluster Orchestration & Helm", "https://kubernetes.io/docs/tutorials/", "Interactive Lab", "Advanced", 14),
                ]
                cur.executemany(
                    """
                    INSERT INTO learning_resources (skill_name, title, url, resource_type, difficulty, estimated_hours)
                    VALUES (%s, %s, %s, %s, %s, %s);
                    """,
                    resources
                )
                conn.commit()
                print(f"Seeded {len(resources)} learning resources.")
            else:
                print("Learning resources table already contains data.")

            # Seed 2: Learning Milestones
            cur.execute("SELECT COUNT(*) AS count FROM learning_milestones;")
            if cur.fetchone()["count"] == 0:
                print("Seeding initial curriculum learning milestones...")
                milestones = [
                    ("CS Core", "CS Core: Data Structures & Algorithms", True, "Python"),
                    ("CS Core", "CS Core: Operating Systems & Concurrency", True, "Python"),
                    ("CS Core", "CS Core: Computer Networks & Distributed Systems", True, "Microservices"),
                    ("Web Development", "Modern Web: Advanced Async JavaScript & DOM", True, "JavaScript"),
                    ("Web Development", "Modern Web: React Architecture & State Machines", True, "React.js"),
                    ("Web Development", "Modern Web: TypeScript Strict Typing & Generics", True, "TypeScript"),
                    ("Backend & Systems", "Backend: RESTful Microservices & Authentication", True, "FastAPI"),
                    ("Backend & Systems", "Backend: Relational Schema Design & Query Optimization", True, "PostgreSQL"),
                    ("AI & Machine Learning", "AI/ML: Deep Learning & Neural Network Foundations", True, "PyTorch"),
                    ("AI & Machine Learning", "AI/ML: Transformer Architectures & Attention", True, "PyTorch"),
                    ("AI & Machine Learning", "AI/ML: Retrieval-Augmented Generation (RAG) Pipelines", True, "Vector Databases"),
                    ("Cloud & DevOps", "Cloud & DevOps: Containerization with Docker", True, "Docker"),
                    ("Cloud & DevOps", "Cloud & DevOps: Automated GitHub Actions CI/CD", True, "Git & CI/CD"),
                    ("Cloud & DevOps", "Cloud & DevOps: AWS Serverless & Cloud Storage", True, "AWS Cloud"),
                    ("Backend & Systems", "System Design: Microservices Scalability Patterns", True, "Microservices"),
                    ("Backend & Systems", "System Design: Caching with Redis & Message Queues", True, "Redis & Caching"),
                    ("Portfolio & Career", "Project: Publish Production Open Source Tool", True, None),
                    ("Portfolio & Career", "Portfolio: Personal Technical Blog & Case Studies", True, None),
                    ("AI & Machine Learning", "AI/ML: Fine-tuning Open LLMs with LoRA/QLoRA", False, "PyTorch"),
                    ("Cloud & DevOps", "Cloud: Kubernetes Cluster Orchestration & Helm", False, "Kubernetes"),
                    ("Backend & Systems", "System Design: Multi-Region Active Replication", False, "Microservices"),
                    ("Portfolio & Career", "Career: Complete 50 Mock Technical Architecture Interviews", False, None),
                    ("Portfolio & Career", "Career: Submit Senior Capstone & Apply to Target Labs", False, None),
                ]
                cur.executemany(
                    """
                    INSERT INTO learning_milestones (category, title, completed, skill_name)
                    VALUES (%s, %s, %s, %s);
                    """,
                    milestones
                )
                conn.commit()
                print(f"Seeded {len(milestones)} learning milestones.")
            else:
                print("Learning milestones table already contains data.")

            # Seed 3: Study Activity Logs (past 21 days for realistic streak/heatmap)
            cur.execute("SELECT COUNT(*) AS count FROM study_activity_logs;")
            if cur.fetchone()["count"] == 0:
                print("Seeding past study activity logs for streak & heatmap...")
                today = date(2026, 9, 22)
                activity_logs = [
                    (today - timedelta(days=20), 75, 2, "CS Core Algorithms"),
                    (today - timedelta(days=19), 90, 2, "Operating Systems"),
                    (today - timedelta(days=18), 60, 1, "Computer Networks"),
                    (today - timedelta(days=17), 120, 3, "JavaScript ES6+"),
                    (today - timedelta(days=16), 45, 1, "React.js State"),
                    (today - timedelta(days=15), 90, 2, "TypeScript Generics"),
                    # Sunday rest on day 14
                    (today - timedelta(days=13), 80, 2, "FastAPI & Pydantic"),
                    (today - timedelta(days=12), 110, 3, "PostgreSQL Indexing"),
                    (today - timedelta(days=11), 60, 1, "Dockerizing Microservices"),
                    (today - timedelta(days=10), 95, 2, "GitHub Actions CI/CD"),
                    (today - timedelta(days=9), 50, 1, "AWS S3 & Cloud"),
                    (today - timedelta(days=8), 120, 3, "PyTorch Foundations"),
                    # Sunday rest on day 7
                    (today - timedelta(days=6), 75, 2, "Transformer Attention"),
                    (today - timedelta(days=5), 90, 2, "Redis Caching"),
                    (today - timedelta(days=4), 105, 3, "Vector Search Milvus"),
                    (today - timedelta(days=3), 60, 1, "RAG Pipeline Lab"),
                    (today - timedelta(days=2), 90, 2, "System Design Patterns"),
                    (today - timedelta(days=1), 120, 3, "Career Gap Analysis"),
                    (today, 85, 2, "Personalized Learning Planner"),
                ]
                cur.executemany(
                    """
                    INSERT INTO study_activity_logs (activity_date, minutes_spent, activities_completed, focus_area)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (activity_date) DO NOTHING;
                    """,
                    activity_logs
                )
                conn.commit()
                print(f"Seeded {len(activity_logs)} daily study activity records.")
            else:
                print("Study activity logs table already contains data.")


if __name__ == "__main__":
    create_and_seed_learning_planner()
