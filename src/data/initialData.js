/**
 * Initial Seed Data for Student Career & Skill Planner
 */
export const INITIAL_DATA = {
  profile: {
    name: "Alex Rivera",
    badge: "Undergraduate Fellow",
    bio: "Computer Science & Artificial Intelligence Senior at Horizon Tech Institute. Passionate about scalable distributed systems, deep learning agents, and intuitive user interfaces.",
    careerGoal: "Full-Stack AI & Cloud Systems Engineer",
    goalTarget: "Target: Winter 2026 • Top Tech / Research Labs",
    goalDesc: "Focusing on building end-to-end autonomous agent architectures, real-time distributed microservices, and high-performance Web APIs.",
    targetDate: "December 2026",
    targetIndustries: "AI Platforms, Cloud Infrastructure, Fintech",
    targetLocations: "Remote",
    gpa: "3.92 / 4.0",
    university: "Horizon Tech Institute",
    classYear: "Class of 2026",
    avatar: null
  },
  skills: [
    { id: "s1", name: "Python", category: "AI & Data", level: "Advanced" },
    { id: "s2", name: "JavaScript / ES6+", category: "Frontend", level: "Advanced" },
    { id: "s3", name: "React.js", category: "Frontend", level: "Advanced" },
    { id: "s4", name: "TypeScript", category: "Frontend", level: "Intermediate" },
    { id: "s5", name: "Node.js & Express", category: "Backend", level: "Advanced" },
    { id: "s6", name: "FastAPI", category: "Backend", level: "Intermediate" },
    { id: "s7", name: "PostgreSQL & SQL", category: "Backend", level: "Intermediate" },
    { id: "s8", name: "PyTorch & Transformers", category: "AI & Data", level: "Intermediate" },
    { id: "s9", name: "Vector DBs (Milvus/Pinecone)", category: "AI & Data", level: "Intermediate" },
    { id: "s10", name: "Docker & Containers", category: "DevOps & Cloud", level: "Intermediate" },
    { id: "s11", name: "AWS Cloud (S3, Lambda)", category: "DevOps & Cloud", level: "Intermediate" },
    { id: "s12", name: "Git & CI/CD Pipelines", category: "DevOps & Cloud", level: "Advanced" },
    { id: "s13", name: "GraphQL APIs", category: "Backend", level: "Beginner" },
    { id: "s14", name: "Modern CSS & Responsive UI", category: "Frontend", level: "Advanced" }
  ],
  projects: [
    {
      id: "p1",
      title: "Agentic Research Assistant",
      desc: "Autonomous multi-agent research synthesizer that queries arXiv, generates citation graphs, and produces executive summaries.",
      tags: ["Python", "LangChain", "FastAPI", "ChromaDB"],
      status: "Completed",
      link: "https://github.com/alexrivera/agentic-research"
    },
    {
      id: "p2",
      title: "CloudScale Distributed KV-Store",
      desc: "High-throughput distributed key-value store implementing Raft consensus for fault-tolerant state machine replication.",
      tags: ["Go", "gRPC", "Raft", "Docker"],
      status: "Completed",
      link: "https://github.com/alexrivera/cloudscale-kv"
    },
    {
      id: "p3",
      title: "NextGen FinTech Analytics Hub",
      desc: "Real-time portfolio tracking dashboard with streaming WebSockets, candlestick rendering, and automated risk scoring.",
      tags: ["TypeScript", "React", "Chart.js", "Tailwind"],
      status: "Completed",
      link: "https://github.com/alexrivera/fintech-hub"
    },
    {
      id: "p4",
      title: "VisionGuard Edge AI Pipeline",
      desc: "Real-time edge object detection and anomaly alerting pipeline optimized with ONNX runtime for low-latency edge nodes.",
      tags: ["PyTorch", "ONNX", "OpenCV", "C++"],
      status: "Completed",
      link: "https://github.com/alexrivera/vision-guard"
    },
    {
      id: "p5",
      title: "NeuralSearch Vector Engine",
      desc: "Low-latency semantic search engine indexing 1M+ technical documents with hybrid BM25 and dense bi-encoder embeddings.",
      tags: ["Python", "FastAPI", "Milvus", "Redis"],
      status: "In Progress",
      link: "https://github.com/alexrivera/neuralsearch"
    },
    {
      id: "p6",
      title: "Autonomous Code Refactor Bot",
      desc: "GitHub Action bot that analyzes pull requests, flags algorithmic complexity bottlenecks, and auto-generates test suites.",
      tags: ["TypeScript", "Node.js", "GitHub API"],
      status: "In Progress",
      link: "https://github.com/alexrivera/refactor-bot"
    }
  ],
  milestones: [
    { id: "m1", category: "CS Core", title: "CS Core: Data Structures & Algorithms", completed: true },
    { id: "m2", category: "CS Core", title: "CS Core: Operating Systems & Concurrency", completed: true },
    { id: "m3", category: "CS Core", title: "CS Core: Computer Networks & Distributed Systems", completed: true },
    { id: "m4", category: "Web Development", title: "Modern Web: Advanced Async JavaScript & DOM", completed: true },
    { id: "m5", category: "Web Development", title: "Modern Web: React Architecture & State Machines", completed: true },
    { id: "m6", category: "Web Development", title: "Modern Web: TypeScript Strict Typing & Generics", completed: true },
    { id: "m7", category: "Backend & Systems", title: "Backend: RESTful Microservices & Authentication", completed: true },
    { id: "m8", category: "Backend & Systems", title: "Backend: Relational Schema Design & Query Optimization", completed: true },
    { id: "m9", category: "AI & Machine Learning", title: "AI/ML: Deep Learning & Neural Network Foundations", completed: true },
    { id: "m10", category: "AI & Machine Learning", title: "AI/ML: Transformer Architectures & Attention", completed: true },
    { id: "m11", category: "AI & Machine Learning", title: "AI/ML: Retrieval-Augmented Generation (RAG) Pipelines", completed: true },
    { id: "m12", category: "Cloud & DevOps", title: "Cloud & DevOps: Containerization with Docker", completed: true },
    { id: "m13", category: "Cloud & DevOps", title: "Cloud & DevOps: Automated GitHub Actions CI/CD", completed: true },
    { id: "m14", category: "Cloud & DevOps", title: "Cloud & DevOps: AWS Serverless & Cloud Storage", completed: true },
    { id: "m15", category: "Backend & Systems", title: "System Design: Microservices Scalability Patterns", completed: true },
    { id: "m16", category: "Backend & Systems", title: "System Design: Caching with Redis & Message Queues", completed: true },
    { id: "m17", category: "Portfolio & Career", title: "Project: Publish Production Open Source Tool", completed: true },
    { id: "m18", category: "Portfolio & Career", title: "Portfolio: Personal Technical Blog & Case Studies", completed: true },
    { id: "m19", category: "AI & Machine Learning", title: "AI/ML: Fine-tuning Open LLMs with LoRA/QLoRA", completed: false },
    { id: "m20", category: "Cloud & DevOps", title: "Cloud: Kubernetes Cluster Orchestration & Helm", completed: false },
    { id: "m21", category: "Backend & Systems", title: "System Design: Multi-Region Active Replication", completed: false },
    { id: "m22", category: "Portfolio & Career", title: "Career: Complete 50 Mock Technical Architecture Interviews", completed: false },
    { id: "m23", category: "Portfolio & Career", title: "Career: Submit Senior Capstone & Apply to Target Labs", completed: false }
  ]
};
