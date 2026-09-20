import type { Project } from './projects';

type ProjectCaseStudy = Partial<Pick<Project, 'description' | 'image' | 'github' | 'live'>> & {
  body?: string;
  appendix: string;
};

export const PROJECT_CASE_STUDIES: Record<string, ProjectCaseStudy> = {
  firstweek: {
    description: 'Indexed 46 curated sections across 5 private projects, with project-scoped retrieval, verified citations, and 129 recorded frontend tests.',
    image: '/images/first-week-home-page.png',
    live: 'https://first-week-blue.vercel.app/showcase',
    body: `## Overview

FirstWeek is a source-grounded onboarding workspace for setup instructions, architecture, reading paths, responsibilities, and project questions. Private answers are restricted to the current member's company and project evidence; the public showcase uses a separate authored dataset and never exposes private content.

## System architecture

\`\`\`text
React / Vite browser
        │ HttpOnly session + question
        ▼
Express membership gateway ─────► PostgreSQL workspace state
        │ exact company/project scope
        ▼
Python FastAPI retrieval service
        ├── SQLite FTS5 / BM25
        ├── optional MiniLM cosine scan
        ├── RRF fusion (k=60)
        └── maintained project evidence
        │
        ▼
Constrained LLM prompt ──► citation validation
        │
        ▼
Gateway rechecks membership + evidence version
        │
        ▼
Saved cited answer
\`\`\`

## Tech stack and why

- **React, Vite, and i18n:** fast workspace UI with English/Japanese support.
- **Express and Prisma:** keeps authentication, membership, and evidence scoping outside the model.
- **PostgreSQL:** durable users, projects, memberships, sources, responsibilities, and conversations.
- **FastAPI:** small internal boundary around retrieval and generation.
- **SQLite FTS5 + optional MiniLM:** atomic local indexes and exact search suit the current 46-section corpus without operating a vector database.
- **Upstash counters on the public path:** atomic quotas bound anonymous provider use.
`,
    appendix: `
## Problem and motivation

Setup notes, architecture decisions, ownership, and issue context were scattered across repositories and colleagues' memory. I chose retrieval over fine-tuning because project knowledge changes frequently and must remain removable, citable, and restricted to the member's current company and project scope.

## Outcomes

- Indexed **46 curated sections across 5 private projects**; the separate public showcase contains 6 authored snapshots.
- Recorded checks include **129 frontend tests passed**, 13/13 gateway HTTP checks, 15/15 RAG API checks, and 16/16 public-provider checks.
- Answers are rejected when citation IDs do not match the supplied evidence. These are engineering-verification metrics, not proof of reduced onboarding time.

## Hard decisions and trade-offs

- **Authorization before retrieval:** the Express gateway derives membership scope instead of letting the browser or model select it. This adds a service hop but keeps access control outside the model.
- **Curated guides before raw-repository ingestion:** reviewed evidence is easier to trust and exclude secrets from, but maintainers must refresh it.
- **SQLite exact search before pgvector:** atomic local rebuilds suit the current 46-section corpus; tenant-scoped approximate search becomes necessary as the corpus grows.

## Limitations and what I would change

There is no measured reduction in onboarding time, citation validation does not prove that every claim is entailed, and public keyword search can miss synonyms. I would next add a labeled onboarding evaluation set, automate repository refresh with deletion propagation, and run a protected hosted preview against real provider and Redis services.
`,
  },
  'ai-pr-review-agent': {
    description: 'Reviewed a recorded 76-chunk repository with 4 specialist agents for $0.002247, routing two critical 0.90-confidence findings to human approval.',
    appendix: `
## Problem and motivation

A single general review prompt makes coverage, confidence, and failure hard to inspect. I split the work into security, quality, testing, and documentation specialists so each finding has a clear concern, retrieved repository context, and an explicit human-approval path.

## Outcomes

- A committed run indexed **76 chunks** and found two critical SQL-injection issues at **0.90 confidence**, correctly sending the review to the human queue.
- Four recorded specialist calls cost **$0.002247** in total; one call used 3,168 input tokens and 126 output tokens.
- **26 infrastructure-independent tests passed** in the documentation check. No precision/recall or time-saved claim is made yet.

## Hard decisions and trade-offs

- **Four specialists over one prompt:** narrower responsibilities and better traces, at the cost of four model calls and more orchestration paths.
- **Hybrid pgvector + full-text retrieval with RRF:** recovers both semantic context and exact identifiers without a trained reranker, but doubles retrieval work per specialist.
- **Fail-soft agents, fail-conservative posting:** one specialist may degrade without crashing the graph, while empty or uncertain aggregate results never auto-post.

## Limitations and what I would change

Webhook deduplication and GitHub-post idempotency are process-local, chunks are not syntax-aware, and retrieval failures can silently fall back to diff-only review. I would move idempotency to Redis/PostgreSQL, add AST-aware chunking and stale-chunk deletion, and build a labeled multi-repository evaluation set.
`,
  },
  moneyplant: {
    description: 'Turns Telegram messages into reversible transactions through a 5-minute correction window, backed by 15 API routes and 21 core parser/ingestion checks.',
    appendix: `
## Problem and motivation

Personal-finance capture fails when logging takes longer than the purchase itself. I chose Telegram as the input surface and kept amount parsing deterministic, using AI only for ambiguous categories after masking monetary values.

## Outcomes

- The web application exposes **15 API route files** across auth, ingestion, pending actions, transactions, holdings, analytics, valuation, Telegram linking, seeding, and export.
- The core test file covers **21 cases**, including Indian amount formats, masking, keyword categorization, ingestion, and AMFI matching.
- Pending entries remain editable for **5 minutes** and the bot checks for expiry every 30 seconds. User volume and categorization accuracy have not been measured.

## Hard decisions and trade-offs

- **Deterministic amount parsing:** reproducible rupee/Indian-unit handling and no model arithmetic, but multi-number messages remain ambiguous.
- **Keyword-first categorization:** common entries avoid model latency and cost; substring matching can still misclassify.
- **Integer paise:** exact currency aggregation, with conversion required at every API boundary.

## Limitations and what I would change

Multiple expenses in one message, OCR, WhatsApp input, stock repricing, and full integration tests are not implemented. I would add an explicit grammar for multi-entry messages, provider timeouts and cost controls, per-user isolation tests, and a visible review state for uncertain categories.
`,
  },
  'rag-builder': {
    description: 'Indexed 1,174 PDF chunks into an inspectable 15.99 MB CSV and retrieves the top 5 with local 768-dimension embeddings before Gemini generation.',
    body: `## Overview

RAG Builder is a learning project that makes the full PDF retrieval path visible: extraction, sentence splitting, chunk construction, embeddings, CSV persistence, top-k retrieval, prompt assembly, and Gemini generation. It deliberately avoids LangChain and a vector database so each intermediate artifact remains inspectable.

## System architecture

\`\`\`text
PDF
 │ PyMuPDF page extraction
 ▼
spaCy sentencizer
 │ groups of 10 sentences, no overlap
 ▼
all-mpnet-base-v2 embeddings (768 dimensions)
 │
 ▼
CSV: chunks + page metadata + vectors

User query
 │ same embedding model
 ▼
dot-product scan
 │ top 5 chunks
 ▼
context + question ──► Gemini ──► terminal answer
\`\`\`

## Tech stack and why

- **Python:** direct access to the ML and data tooling used at every stage.
- **PyMuPDF:** page-level PDF text extraction with minimal loader code.
- **spaCy sentencizer:** sentence boundaries without downloading a statistical language model.
- **Sentence Transformers \`all-mpnet-base-v2\`:** local document and query embeddings.
- **Pandas CSV + PyTorch:** inspectable persistence and a transparent exhaustive ranking operation.
- **Gemini:** hosted generation avoids the hardware cost of running the final LLM locally.
`,
    appendix: `
## Problem and motivation

High-level RAG frameworks hid the mechanics I wanted to understand: PDF extraction, chunk construction, embedding persistence, similarity scoring, context assembly, and generation. I therefore built the pipeline directly and kept its intermediate vectors in a CSV rather than a managed vector store.

## Outcomes

- The committed artifact contains **1,174 chunks**, each with a **768-value** embedding.
- The inspectable embedding CSV is **15,987,491 bytes** and default retrieval returns **5 chunks**.
- No labeled retrieval accuracy, answer-faithfulness, latency, or user metric is committed, so the page does not claim one.

## Hard decisions and trade-offs

- **Direct implementation over LangChain:** every transformation stays visible, but loaders, retries, tracing, and provider abstraction remain manual.
- **CSV over a vector database:** zero service setup and inspectable data, at the cost of full-file parsing and linear scans.
- **Ten-sentence chunks with no overlap:** deterministic and simple, but committed chunk estimates vary from 30.25 to 689.25 tokens and boundary context can be lost.
- **Dot product, top-k 5:** transparent retrieval, but it is not guaranteed to be cosine similarity because embeddings are not explicitly normalized.

## Limitations and what I would change

There is no OCR, relevance threshold, reranker, hybrid lexical recovery, citation validation, or automated test suite. I would use token-bounded overlapping chunks, normalize embeddings, preserve true page metadata, add abstention and page citations, and evaluate retrieval on a versioned question set.
`,
  },
  'personal-site': {
    description: 'Improved measured request throughput by 16.2% and reduced post-load memory by 11% while serving project case studies, public writing, and private logs.',
    github: 'https://github.com/Dev-an01/personal-site',
    body: `## Overview

This site combines recruiter-friendly project evidence, public technical writing, and private learning logs in one Next.js application. Visitors can switch between three complete visual identities while the factual content, routes, and accessibility requirements remain stable.

## System architecture

\`\`\`text
Browser
  │
  ▼
Next.js 16 App Router
  ├── portfolio pages + projects.json
  ├── blog API ───────────────► MongoDB Atlas
  ├── authenticated logs ─────► MongoDB Atlas
  └── activity APIs ──────────► GitHub / coding profiles
             │
             └── MongoDB cache with stale-on-error fallback

Single-owner login
  └── environment credentials ─► signed HttpOnly JWT cookie
\`\`\`

## Tech stack and why

- **Next.js 16 and React 19:** one deployment for pages, server routes, image optimization, and API handlers.
- **TypeScript:** shared contracts across UI and server code.
- **MongoDB Atlas + Mongoose:** runtime-editable blogs, private logs, and cached external activity.
- **Versioned JSON:** project case studies deploy atomically with the code.
- **Custom CSS + Tailwind tooling:** three visual identities share one factual component structure.
- **Vercel or Docker:** managed serverless deployment and a resource-capped self-hosted path.
`,
    appendix: `
## Problem and motivation

Projects, technical writing, and private learning notes needed different access and update models but one coherent home. I kept stable project evidence in Git, editable writing in MongoDB, and private logs behind a small single-owner authentication boundary.

## Outcomes

In a local production-equivalent run of 1,000 requests at concurrency 25, throughput rose from **5,347.65 to 6,213.42 requests/second (+16.2%)**, mean request time fell **13.9%**, and post-load RSS fell **11.0%**. Missing-MongoDB failure time fell from about 30 seconds to **5.02 seconds**. These are regression measurements, not public traffic claims.

## Hard decisions and trade-offs

- **One Next.js deployment:** shared TypeScript and simple routing, but no independently scalable API service.
- **Git projects, MongoDB writing:** reviewable deployments plus runtime editing, but two content models.
- **Single-owner JWT auth:** small enough for this portfolio, but unsuitable for multiple users or account recovery.
- **Stale-on-error external cache:** provider failures keep the last result visible, at the cost of freshness.

## Limitations and what I would change

Runtime project writes do not suit immutable serverless filesystems, API bodies lack schema validation, Markdown assumes trusted authors, and the fallback JWT secret should fail closed in production. I would move all editable content to durable storage, add validation and login throttling, expose cache age, align container/runtime Node versions, and add auth/API/browser smoke tests.
`,
  },
};

export const MOVIE_ENQUIRER: Project = {
  slug: 'movie-enquirer',
  name: 'Movie Enquirer',
  category: 'AI',
  description: 'Searches 5,000 movies across 72,909 semantic chunks with BM25, MiniLM, RRF, optional reranking, and source-visible LLM answers.',
  techStack: ['Python', 'BM25', 'MiniLM', 'NumPy', 'OpenRouter', 'Streamlit'],
  image: '/images/movie-enquirer.png',
  github: 'https://github.com/Dev-an01/movie-enquirer',
  live: 'https://movie-enquirer-byanand.streamlit.app/',
  featured: true,
  longDescription: `## Problem and motivation

The project began as a decision to learn retrieval mechanics instead of hiding them behind a RAG framework or hosted vector database. A 5,000-record local corpus is large enough to make ranking meaningful while remaining small enough to inspect, cache, and search in one process.

## System architecture

\`\`\`text
data/movies.json (5,000 movies)
        ├── tokenize + stem ──► inverted index + BM25 statistics
        └── 4-sentence chunks, 1-sentence overlap
                    └── all-MiniLM-L6-v2 ──► 72,909 local vectors

Natural-language query
        ├── BM25 lexical ranking ───────────────┐
        └── MiniLM cosine scan ─────────────────┤
                                                ▼
                                      RRF (k=60) fusion
                                                │
                                      optional reranker
                                                │
                                         top 5 movies
                                      ┌─────────┴─────────┐
                                      ▼                   ▼
                                Search cards       OpenRouter answer
                                                   + visible sources
\`\`\`

## Outcomes

- Searches **5,000 movie records** represented by **72,909 semantic chunks**.
- The whole-movie embedding cache is about 7.3 MB and the chunk cache about 53 MB.
- Default retrieval returns **5 results** and fuses lexical and semantic ranks with RRF \`k=60\`.
- A 10-case local golden set exists, but no aggregate accuracy or answer-faithfulness result is committed, so none is claimed.

## Tech stack and why

- **Hand-built BM25 and an inverted index:** preserves exact titles and rare keywords while exposing lexical scoring internals.
- **Sentence Transformers MiniLM + NumPy:** local semantic retrieval without a hosted embedding service.
- **Pickle, JSON, and NumPy caches:** minimal infrastructure for a static 5,000-movie learning corpus.
- **RRF:** combines BM25 and cosine ranks without pretending their raw scores share a scale.
- **OpenRouter:** optional generation after retrieval; search itself remains local.
- **Streamlit:** ships the Python retrieval code as a public demo without adding a separate API and frontend.

## Hard decisions and trade-offs

- **Four-sentence chunks with one-sentence overlap:** better local matches and boundary continuity, but 72,909 vectors increase storage and scan time.
- **Exhaustive local scan over a vector database:** inspectable and service-free, but no approximate index, metadata filters, or multi-user scaling.
- **RRF over weighted score fusion:** avoids score normalization, but gives up direct control over the relative magnitude of lexical and semantic signals.
- **Synchronous generation:** simple to follow, but no streaming, cancellation, or consistent model behavior on the free route.

## Limitations and what I would change

Cache files are not fingerprinted to the corpus/model settings, movie IDs assume list position, out-of-domain queries have no relevance threshold, and citations are not programmatically checked against retrieved IDs. I would version caches, remove ID-position coupling, add abstention tests and bounded retries, and preserve comparative BM25/semantic/hybrid/reranked results on a larger committed evaluation set.
`,
};
