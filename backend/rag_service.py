import os
import math
from pathlib import Path
from typing import List, Dict, Any, Optional
import httpx
from dotenv import load_dotenv

dotenv_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=dotenv_path, override=True)

# Centralized API key and configuration retrieval
def get_gemini_api_key() -> Optional[str]:
    load_dotenv(dotenv_path=dotenv_path, override=True)
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if key.startswith("GEMINI_API_KEY="):
        key = key[len("GEMINI_API_KEY="):].strip()
    key = key.strip("\"' \t")
    return key if key else None


def get_embedding_model() -> str:
    load_dotenv(dotenv_path=dotenv_path, override=True)
    return os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001").strip()


def generate_embedding(text: str) -> List[float]:
    """
    Generates a 768-dimensional dense embedding using Google Gemini API.
    Uses 'gemini-embedding-001' with outputDimensionality=768.
    """
    api_key = get_gemini_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not configured in backend/.env")

    model = get_embedding_model()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent?key={api_key}"
    payload = {
        "content": {
            "parts": [{"text": text.strip()[:2048]}]
        },
        "outputDimensionality": 768
    }

    last_error = None
    for attempt in range(2):
        try:
            with httpx.Client(timeout=15.0) as client:
                response = client.post(url, json=payload)
                if response.status_code != 200:
                    # Fallback to gemini-embedding-2 if model not found
                    if response.status_code == 404 and model != "gemini-embedding-2":
                        url_fb = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key={api_key}"
                        response = client.post(url_fb, json=payload)

                    if response.status_code != 200:
                        raise RuntimeError(f"Gemini Embedding API error ({response.status_code}): {response.text[:200]}")

                data = response.json()
                embedding = data.get("embedding", {}).get("values", [])
                if not embedding:
                    raise RuntimeError("Gemini Embedding API returned empty values vector.")

                # Normalize to 768 dimensions if needed
                return [float(v) for v in embedding[:768]]
        except Exception as e:
            last_error = e
            if attempt == 0:
                import time
                time.sleep(0.5)
                continue
            raise last_error


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Computes cosine similarity between two float vectors."""
    if len(v1) != len(v2) or not v1:
        return 0.0
    dot_product = sum(a * b for a, b in zip(v1, v2))
    norm_a = math.sqrt(sum(a * a for a in v1))
    norm_b = math.sqrt(sum(b * b for b in v2))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot_product / (norm_a * norm_b)


# =====================================================================
# STARTER CURRICULUM KNOWLEDGE BASE CHUNKS (Legally Safe, Educational)
# =====================================================================

STARTER_KNOWLEDGE_DOCUMENTS = [
    {
        "skill_name": "Docker",
        "title": "Docker Multi-Stage Builds & Optimization",
        "content": (
            "A Docker multi-stage build uses multiple FROM instructions in a single Dockerfile. "
            "Each FROM instruction can use a different base image and begins a new stage of the build. "
            "You can selectively copy artifacts from one stage to another, leaving behind everything you don't want "
            "in the final image (such as build tools, compilers, and devDependencies). This drastically reduces "
            "the attack surface and final image size, typically shrinking images from several gigabytes down to tens of megabytes."
        ),
        "source_url": "https://docs.docker.com/build/building/multi-stage/"
    },
    {
        "skill_name": "Docker",
        "title": "Container Isolation & Namespaces vs Virtual Machines",
        "content": (
            "Unlike virtual machines which virtualize hardware and run an entire guest operating system, "
            "Docker containers share the host kernel. Linux cgroups provide resource limitation (CPU, memory, disk I/O), "
            "while namespaces provide isolation for process trees (pid), networking (net), mounts (mnt), and user IDs (user). "
            "This makes containers lightweight, near-instant to start, and computationally efficient."
        ),
        "source_url": "https://docs.docker.com/get-started/overview/"
    },
    {
        "skill_name": "FastAPI",
        "title": "FastAPI Architecture, Pydantic & Dependency Injection",
        "content": (
            "FastAPI is a modern, high-performance web framework for building APIs with Python 3.8+ based on standard "
            "Python type hints. It is built on Starlette for ASGI web routing and Pydantic for data validation and serialization. "
            "FastAPI features a hierarchical Dependency Injection system using `Depends()`. Dependencies can manage database "
            "connections, enforce authentication, and reuse business logic across endpoints cleanly without boilerplate."
        ),
        "source_url": "https://fastapi.tiangolo.com/tutorial/dependencies/"
    },
    {
        "skill_name": "FastAPI",
        "title": "Async Endpoints & Concurrency in FastAPI",
        "content": (
            "In FastAPI, defining an endpoint with `async def` runs it directly on the main event loop, which is optimal "
            "for non-blocking I/O operations such as HTTP client requests (`httpx`) or asynchronous database drivers. "
            "Endpoints defined with standard `def` are run in an external threadpool, ensuring synchronous blocking operations "
            "do not stall the server's asynchronous event loop."
        ),
        "source_url": "https://fastapi.tiangolo.com/async/"
    },
    {
        "skill_name": "PostgreSQL",
        "title": "PostgreSQL ACID Guarantees & MVCC Internals",
        "content": (
            "PostgreSQL implements Multi-Version Concurrency Control (MVCC) to ensure transaction isolation with high concurrency. "
            "Instead of locking table rows for reading, each transaction sees a consistent snapshot of the database at a specific "
            "point in time. Writes do not block reads, and reads do not block writes. Dead tuples created by updates or deletes "
            "are reclaimed asynchronously by the autovacuum process."
        ),
        "source_url": "https://www.postgresql.org/docs/current/mvcc.html"
    },
    {
        "skill_name": "PostgreSQL",
        "title": "PostgreSQL Indexing: B-Tree, GIN, GiST, and BRIN",
        "content": (
            "PostgreSQL offers several index types tailored for specific query patterns. Standard B-Tree indexes handle equality "
            "and range comparisons (`<`, `<=`, `=`, `>=`, `>`). GIN (Generalized Inverted Index) excels at indexing composite items "
            "like JSONB keys, arrays, and full-text search. GiST supports geometric and custom spatial data, while BRIN indexes "
            "are ultra-compact for very large, naturally physically sorted sequential tables."
        ),
        "source_url": "https://www.postgresql.org/docs/current/indexes-types.html"
    },
    {
        "skill_name": "Python",
        "title": "Python Memory Model & The Global Interpreter Lock (GIL)",
        "content": (
            "CPython manages memory using reference counting supplemented by a generational cyclic garbage collector for detecting "
            "circular references. The Global Interpreter Lock (GIL) is a mutex that protects access to Python objects, preventing "
            "multiple native threads from executing Python bytecodes concurrently. For CPU-bound parallelism in Python, "
            "multiprocessing or sub-interpreters are used, while async/await handles I/O-bound concurrency."
        ),
        "source_url": "https://docs.python.org/3/c-api/init.html#thread-state-and-the-global-interpreter-lock"
    },
    {
        "skill_name": "Python",
        "title": "Python Decorators & Metaprogramming Patterns",
        "content": (
            "A decorator in Python is a callable that takes another function or class as an argument and extends its behavior "
            "without explicitly modifying its source code. Decorators leverage closures and first-class functions. Using "
            "`functools.wraps` preserves original function metadata (such as `__name__` and docstrings), essential for debugging "
            "and API documentation frameworks like FastAPI."
        ),
        "source_url": "https://docs.python.org/3/glossary.html#term-decorator"
    },
    {
        "skill_name": "Git",
        "title": "Git Rebase vs Merge & Branch Hygiene",
        "content": (
            "Git merge creates a new merge commit combining two diverging branches, preserving the complete historical timeline "
            "of commits as they occurred. In contrast, `git rebase` rewrites commit history by replaying local commits on top "
            "of the target base branch, yielding a clean, linear commit log. Rebasing should generally be avoided on shared public "
            "branches to prevent rewriting history for collaborators."
        ),
        "source_url": "https://git-scm.com/book/en/v2/Git-Branching-Rebasing"
    },
    {
        "skill_name": "REST APIs",
        "title": "Idempotency & HTTP Semantics in RESTful Architecture",
        "content": (
            "An HTTP method is idempotent if the side-effect of making N identical requests is the same as making a single request. "
            "GET, HEAD, PUT, and DELETE are idempotent according to RFC 7231, whereas POST is non-idempotent because repeated "
            "requests create multiple resources. RESTful APIs use standard HTTP status codes: 200 (OK), 201 (Created), 400 (Bad Request), "
            "401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 409 (Conflict), and 422 (Unprocessable Entity)."
        ),
        "source_url": "https://developer.mozilla.org/en-US/docs/Glossary/Idempotent"
    },
    {
        "skill_name": "React",
        "title": "React 18/19 Reconciliation & Virtual DOM Mechanics",
        "content": (
            "React represents user interfaces in memory using a Virtual DOM tree. When component state changes, React constructs "
            "a new Virtual DOM tree and executes its reconciliation algorithm (Fiber architecture) to compute the minimal set "
            "of DOM mutations required. Key props allow React to stably track elements across renders, avoiding unnecessary "
            "DOM recreations and preserving component state."
        ),
        "source_url": "https://react.dev/learn/preserving-and-resetting-state"
    },
    {
        "skill_name": "JavaScript",
        "title": "JavaScript Event Loop, Microtasks & Macrotasks",
        "content": (
            "JavaScript is single-threaded and non-blocking via the event loop. Asynchronous execution is divided into the "
            "Microtask queue (Promise callbacks, `queueMicrotask`, `process.nextTick`) and the Macrotask/Task queue (`setTimeout`, "
            "`setInterval`, I/O, UI rendering). Microtasks are always fully drained before the next macrotask is executed, "
            "ensuring promise resolutions complete before subsequent timer events fire."
        ),
        "source_url": "https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide"
    },
    {
        "skill_name": "Redis",
        "title": "Redis In-Memory Architecture & Caching Strategies",
        "content": (
            "Redis stores key-value pairs entirely in memory, delivering sub-millisecond read/write latency. Common caching "
            "patterns include Cache-Aside (application checks cache first, queries DB on miss, then populates cache) and "
            "Write-Through (writes update cache and DB synchronously). TTL (Time To Live) and eviction policies (such as allkeys-lru) "
            "ensure memory is bounded and stale data is systematically purged."
        ),
        "source_url": "https://redis.io/docs/manual/eviction/"
    },
    {
        "skill_name": "Kubernetes",
        "title": "Kubernetes Orchestration: Pods, Services & Ingress",
        "content": (
            "A Pod is the smallest deployable computing unit in Kubernetes, wrapping one or more tightly coupled containers. "
            "Deployments manage Pod replicas and rolling updates declaratively. Because Pod IP addresses are ephemeral, "
            "Services provide stable virtual IPs and load balancing across matched Pod labels. Ingress controllers route external "
            "HTTP/HTTPS traffic to internal cluster Services."
        ),
        "source_url": "https://kubernetes.io/docs/concepts/workloads/pods/"
    },
    {
        "skill_name": "Machine Learning",
        "title": "Loss Functions, Overfitting & Regularization",
        "content": (
            "Machine learning models minimize a loss function (e.g., Cross-Entropy for classification, Mean Squared Error for regression) "
            "via gradient descent optimization. Overfitting occurs when a model learns training noise rather than general patterns, "
            "exhibiting high training accuracy but poor validation performance. Regularization techniques (L1 Lasso, L2 Ridge, "
            "Dropout in neural networks, and Early Stopping) penalize model complexity to improve generalization."
        ),
        "source_url": "https://developers.google.com/machine-learning/crash-course/regularization-for-simplicity/l2-regularization"
    },
    {
        "skill_name": "Vector Databases",
        "title": "Dense Embeddings & Approximate Nearest Neighbors (ANN)",
        "content": (
            "Dense embeddings convert semantic meaning of text, audio, or images into high-dimensional real vectors. "
            "Similarity is measured using vector distance metrics: Cosine Distance, Euclidean (L2) Distance, or Dot Product. "
            "Exact nearest neighbor search scales as O(N), becoming prohibitively slow for millions of vectors. Approximate Nearest "
            "Neighbor (ANN) algorithms—such as HNSW (Hierarchical Navigable Small World) and IVF (Inverted File)—trade negligible "
            "accuracy for logarithmic query times."
        ),
        "source_url": "https://www.postgresql.org/docs/current/index.html"
    },
    {
        "skill_name": "RAG",
        "title": "Retrieval Augmented Generation (RAG) Architecture",
        "content": (
            "RAG pairs large language models with dynamic external knowledge retrieval. Rather than relying solely on static "
            "weights learned during pre-training, a RAG pipeline embeds the user query, searches a vector index for top-k relevant "
            "document chunks, and injects those retrieved passages into the LLM system prompt. This drastically reduces hallucinations, "
            "enables verifiable citations, and keeps answers grounded in current domain knowledge."
        ),
        "source_url": "https://research.ibm.com/blog/retrieval-augmented-generation-RAG"
    }
]


def ingest_knowledge_base(conn) -> Dict[str, Any]:
    """
    Ingests the curated starter educational curriculum into PostgreSQL.
    Generates real 768-dimensional dense embeddings via Gemini API and stores them.
    Skips chunks that already exist to avoid duplicate embedding generation costs.
    """
    inserted = 0
    skipped = 0

    with conn.cursor() as cur:
        for doc in STARTER_KNOWLEDGE_DOCUMENTS:
            # Check if this chunk title already exists
            cur.execute(
                "SELECT id FROM skill_documentation_chunks WHERE title = %s;",
                (doc["title"],)
            )
            existing = cur.fetchone()
            if existing:
                skipped += 1
                continue

            # Generate real embedding
            embedding_vector = generate_embedding(f"{doc['title']}: {doc['content']}")

            cur.execute(
                """
                INSERT INTO skill_documentation_chunks 
                (skill_name, title, content, source_url, chunk_index, embedding)
                VALUES (%s, %s, %s, %s, %s, %s);
                """,
                (
                    doc["skill_name"],
                    doc["title"],
                    doc["content"],
                    doc.get("source_url"),
                    0,
                    embedding_vector
                )
            )
            inserted += 1
        conn.commit()

    return {
        "status": "success",
        "inserted_count": inserted,
        "skipped_count": skipped,
        "total_documents": len(STARTER_KNOWLEDGE_DOCUMENTS)
    }


def search_knowledge_chunks(
    conn,
    query: str,
    top_k: int = 5,
    min_similarity: float = 0.50,
    user_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Performs real semantic search using query embeddings and cosine similarity against
    PostgreSQL documentation chunks.
    Filters out weak matches (< min_similarity = 0.50) so irrelevant questions do not receive unrelated documentation.
    Guarantees user isolation: Only retrieves public starter curriculum (user_id IS NULL)
    or private documents belonging specifically to the authenticated user (user_id = %s).
    Returns ranked chunks with similarity scores and metadata.
    """
    if not query or not query.strip():
        return []

    # Quick check: very short greetings or conversational queries don't need vector search
    stripped = query.strip().lower()
    if len(stripped.split()) <= 3 and any(w in stripped for w in ["hi", "hello", "hey", "morning", "evening", "thanks"]):
        return []

    query_embedding = None
    try:
        query_embedding = generate_embedding(query)
    except Exception as e:
        print(f"[RAG] Warning: Could not generate query embedding: {e}")

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, skill_name, title, content, source_url, 
                   COALESCE(topic, 'Engineering') AS topic, 
                   COALESCE(difficulty, 'Intermediate') AS difficulty, 
                   chunk_index, embedding
            FROM skill_documentation_chunks
            WHERE (user_id IS NULL OR user_id = %s);
            """,
            (user_id,)
        )
        rows = cur.fetchall()

    scored_chunks = []
    if query_embedding:
        for row in rows:
            chunk_embedding = row.get("embedding")
            if not chunk_embedding:
                continue
            sim = cosine_similarity(query_embedding, chunk_embedding)
            if sim >= min_similarity:
                # Bound content size to 1500 chars max to prevent excessive context injection
                bounded_content = row["content"][:1500] if row.get("content") else ""
                scored_chunks.append({
                    "id": row["id"],
                    "skill_name": row["skill_name"],
                    "title": row["title"],
                    "content": bounded_content,
                    "source_url": row["source_url"],
                    "topic": row.get("topic", "Engineering"),
                    "difficulty": row.get("difficulty", "Intermediate"),
                    "chunk_index": row["chunk_index"],
                    "similarity_score": round(float(sim), 4)
                })
    else:
        # Lexical fallback when external embedding API has a transient failure
        keywords = [k for k in query.lower().split() if len(k) > 2]
        for row in rows:
            haystack = (row.get("skill_name", "") + " " + row.get("title", "") + " " + row.get("content", "")).lower()
            matches = sum(1 for kw in keywords if kw in haystack)
            if matches > 0:
                score = round(0.55 + 0.1 * min(matches, 4), 4)
                bounded_content = row["content"][:1500] if row.get("content") else ""
                scored_chunks.append({
                    "id": row["id"],
                    "skill_name": row["skill_name"],
                    "title": row["title"],
                    "content": bounded_content,
                    "source_url": row["source_url"],
                    "topic": row.get("topic", "Engineering"),
                    "difficulty": row.get("difficulty", "Intermediate"),
                    "chunk_index": row["chunk_index"],
                    "similarity_score": score
                })

    # Sort descending by similarity score
    scored_chunks.sort(key=lambda x: x["similarity_score"], reverse=True)
    return scored_chunks[:top_k]
