# Mathswiz implementation task list

## Phase 0 — Secure and stabilize

- [x] 0.1 Audit authentication and registration paths
- [x] 0.2 Harden authentication
  - [x] Hash passwords in both registration endpoints
  - [x] Verify passwords with bcrypt during login
  - [x] Remove the universal test OTP and OTP login UI
  - [x] Prevent login from creating unknown student accounts
  - [x] Reject pending, rejected, and blocked accounts
  - [x] Remove fallback authentication credentials and secrets
  - [x] Fail closed when SSO processing fails
  - [x] Preserve database roles for normal SSO users
  - [x] Route parents to the parent dashboard
  - [x] Validate public registration roles and input
  - [x] Omit passwords from registration responses
  - [x] Hash administrator-initiated password resets
  - [x] Add focused authentication regression tests
- [x] 0.3 Audit and enforce role authorization on every API endpoint
  - [x] Inventory all 131 API route files
  - [x] Protect the complete `/api` namespace in middleware
  - [x] Return API-appropriate `401` and `403` responses
  - [x] Restrict Admin, teacher, student, and parent namespaces by role
  - [x] Define method-aware access for shared question APIs
  - [x] Preserve documented Admin/teacher cross-namespace workflows
  - [x] Require student authentication for payment verification
  - [x] Default all future/unclassified APIs to authenticated access
  - [x] Add four-role and anonymous authorization regression tests
- [x] 0.4 Add ownership checks for teacher, batch, student, and parent data
  - [x] Scope teacher batch lists and batch details to their owner
  - [x] Restrict test lists, assignments, and direct student assignments by teacher ownership
  - [x] Restrict enrollment approval, student addition, fees, coupons, and batch broadcasts
  - [x] Prevent teachers from reading or changing another teacher's live classes
  - [x] Prevent Microsoft Teams synchronization from taking over another teacher's batch
  - [x] Restrict knowledge folders, chunks, duplicate checks, and RAG generation by content owner
  - [x] Restrict student batches, attempts, analytics, leaderboards, coupons, payments, and messages
  - [x] Require an active assignment before a student can start a published test
  - [x] Validate peer-challenge participants and shared batch membership
  - [x] Restrict parent link and unlink actions to the signed-in parent
  - [x] Add cross-account ownership regression tests
- [x] 0.5 Replace process-local rate limiting with a persistent store
  - [x] Replace request-local maps with atomic Redis counters
  - [x] Share limits across serverless instances through the Redis REST API
  - [x] Apply separate authentication, AI, and general API tiers
  - [x] Key authenticated limits by user and anonymous limits by client IP
  - [x] Return `429` with retry and remaining-limit headers
  - [x] Fail closed for authentication and AI routes when Redis is unavailable in production
  - [x] Keep local development usable before Redis credentials are configured
  - [x] Document deployment variables and add limiter regression tests
- [x] 0.6 Remove mock/randomized production data and repair broken actions
  - [x] Replace teacher engagement charts with real six-week assessment results
  - [x] Replace randomized active-user counts with recent activity records
  - [x] Replace fabricated doubt counts with open teacher queries
  - [x] Replace student rank estimates with actual cohort rankings
  - [x] Persist real student batch-join requests
  - [x] Remove dummy study-material responses
  - [x] Stop mock file uploads from reporting false success
  - [x] Replace mock fee reminders and suspension notices with in-app notifications
  - [x] Remove placeholder Admin identity creation from batch actions
  - [x] Connect and validate the banner creation workflow
  - [x] Add honest empty states and regression tests for real metrics and enrollment
- [x] 0.7 Add audit logging for sensitive operations
  - [x] Add an indexed, actor-linked audit log schema and production migration
  - [x] Sanitize passwords, tokens, cookies, secrets, and API keys from audit metadata
  - [x] Capture actor, role, target, IP address, user agent, timestamp, and safe change context
  - [x] Log account status/role changes, approvals, payments, test submissions, question moderation, website content, and parent links
  - [x] Enforce direct authorization and ownership checks uncovered during audit instrumentation
  - [x] Add audit metadata regression tests
- [x] 0.8 Add monitoring, backup/recovery checks, and critical end-to-end tests
  - [x] Add public liveness and dependency-aware readiness endpoints
  - [x] Verify PostgreSQL and production Redis without exposing secrets
  - [x] Document external uptime monitoring and deployment checks
  - [x] Add a live schema and migration recovery-readiness check
  - [x] Document the backup policy, storage caveat, incident recovery, and quarterly restore drills
  - [x] Add browser tests for login, providers, four role routes, API denial, and health
  - [x] Fix login form accessibility exposed by browser testing

## Phase 2 progress

- [x] Audit existing course, homework, mastery, and intervention capabilities
- [x] Secure practice submissions and mastery updates
- [x] Add the homework assignment MVP on the existing test workflow
  - [x] Distinguish homework from tests and store teacher instructions
  - [x] Validate ownership, publication, scheduling, deadlines, and attempt limits
  - [x] Display homework clearly for teachers and students
  - [x] Audit homework assignment creation
  - [x] Apply and verify the additive production migration
  - [x] Add focused homework and assignment-access tests
- [x] Add homework feedback and teacher review for subjective submissions
  - [x] Preserve written and image-based subjective answers
  - [x] Queue homework responses for teacher review
  - [x] Scope submission access to the owning teacher
  - [x] Store marks, feedback, reviewer, and review timestamp
  - [x] Recalculate attempt totals transactionally and audit reviews
  - [x] Add and verify the teacher homework review interface
- [x] Introduce course, module, lesson, and enrollment models
  - [x] Add course, module, lesson, enrollment, and lesson-progress schema
  - [x] Add teacher-owned course, module, lesson, publishing, and enrollment APIs
  - [x] Restrict enrollment to students in the teacher's approved batches
  - [x] Add student-only published course access and lesson-progress updates
  - [x] Apply and verify the additive production migration
  - [x] Add course ownership and student progress regression tests
- [x] Update mastery from submitted tests and add mastery history/views
  - [x] Add an immutable mastery-event history linked to attempts and questions
  - [x] Update mastery from practice, tests, and objective homework answers
  - [x] Keep submission, responses, mastery state, and history transactional
  - [x] Prevent concurrent resubmission from applying mastery twice
  - [x] Add student self-service mastery and history API
  - [x] Add teacher batch/student mastery API with enrollment ownership checks
  - [x] Apply and verify the additive production migration
  - [x] Add student and teacher mastery dashboard panels
- [x] Add intervention detection, assignment, tracking, and notifications
  - [x] Detect mastery topics below the teacher intervention threshold
  - [x] Scope intervention assignment to approved students in teacher-owned batches
  - [x] Track assigned, in-progress, completed, and cancelled support plans
  - [x] Notify students when support is assigned or updated
  - [x] Add teacher and student intervention workspaces and dashboard navigation
  - [x] Audit teacher intervention assignments and updates
  - [x] Apply and verify the additive production migration
  - [x] Add intervention ownership and progression regression tests

## Product roadmap — trusted, teacher-guided mathematics practice

Mathswiz's core experience is a continuous **study → practice → mock test → analyse → revise** loop, supported by a structured content library. Its differentiator is not question-bank size alone: students receive dependable solutions, teachers guide learning and flag errors, and administrators retain the full content-review history.

### Phase 1 — Student learning loop

- [x] Establish the shared design system and role-based Today dashboards
  - [x] Establish shared color, spacing, radius, shadow, and focus tokens
  - [x] Build a reusable Today dashboard hierarchy
  - [x] Add role-specific summaries, priorities, and quick actions for all four roles
  - [x] Consolidate duplicate legacy dashboard cards and headers
  - [x] Standardize navigation, empty states, loading states, and responsive behavior
  - [x] Add accessibility and visual regression coverage
- [x] Establish courses, homework, mastery, and intervention foundations
- [ ] Build topic learning paths that sequence concepts, worked examples, guided practice, timed quizzes, and recovery practice
- [ ] Create a “My Mistakes” notebook that automatically captures wrong or flagged questions and schedules retries
- [ ] Add student bookmarks, personal revision lists, and flashcards/formula cards
- [ ] Show per-topic mastery based on accuracy, question difficulty, and time taken

### Phase 2 — Teacher-led practice and assessment

- [ ] Build a teacher test builder with chapter, skill, difficulty, question-count, and time filters
- [ ] Let teachers assign targeted remedial practice to individual students and groups
- [ ] Add class heatmaps for weak concepts, common wrong answers, and students needing support
- [ ] Support reusable teacher collections for worksheets, revision packs, mock exams, and homework

### Phase 3 — Feedback, revision, and analytics

- [ ] Deliver rich post-test reports with solutions, time spent, confidence, error type, and a recommended next action
- [ ] Add adaptive Smart Practice that selects questions from each student's weak skills
- [ ] Create a weekly revision planner with spaced repetition and pending tasks
- [ ] Provide exam-mode mock tests with an exam-style timer and performance trends

### Phase 4 — Parent and school insight

- [ ] Build a parent dashboard for weekly learning time, completed work, strengths, risks, and teacher comments
- [ ] Provide parent action cards answering “What can I do this week?” rather than reporting raw marks alone
- [ ] Add administrator reporting for curriculum coverage, class performance, content quality, and teacher activity
- [ ] Send actionable alerts for prolonged inactivity, repeated concept difficulty, and upcoming assessments

### Phase 5 — Motivation and content trust

- [ ] Add opt-in, teacher-moderated class leaderboards that reward improvement and consistency rather than marks alone
- [ ] Add streaks, milestone badges, and moderated class challenges
- [ ] Implement the question-quality workflow: draft, AI-generated candidate solution, external verification, approval, and audit history
- [ ] Display a verified-solution badge so students and teachers can distinguish reviewed content from pending AI suggestions

## Phase QB — Whole-book Mathematics ingestion

- [x] Add a first-class catalog for books, editions, chapters, and exercises
- [x] Preserve question source pages, printed numbering, and book lineage
- [x] Track whole-book ingestion stages and verification status
- [x] Add Admin-only book registration and catalog APIs with audit logging
- [x] Add the Admin Book Ingestion Library screen
- [x] Add book, chapter, and exercise filters to question retrieval
- [x] Apply and verify the additive database migration
- [ ] Add secure original-PDF storage and resumable whole-book upload
  - [x] Add private pilot storage, PDF signature/size validation, hashing, duplicate detection, and atomic ingestion records
  - [x] Add whole-PDF upload controls to the Admin Book Library
  - [ ] Replace pilot filesystem storage with durable private object storage before production
  - [ ] Add multipart/resumable transfer for unstable connections and very large books
- [ ] Build page rendering, layout detection, and mathematical OCR adapters
  - [x] Add free local PDF page inventory and representative structural sampling
  - [x] Auto-route digital-math, mixed-layout assessment, image-book, and photographed-book sources
  - [x] Add resumable private archival page rendering with progress checkpoints
  - [x] Add first-pass page classification and conservative content, graph/figure, and table candidates
  - [x] Add source-profile-aware two-column detection and native question-number candidates
  - [x] Add non-destructive photographed-page contrast enhancement, sharpening, and deskew measurement
  - [x] Convert reliable native markers into bounded question regions and option markers
  - [x] Route unresolved image-only pages explicitly to mathematical vision without guessed question boxes
  - [x] Add per-run layout summaries for question regions, page types, enhancements, and vision-required pages
  - [ ] Add profile-specific geometry detection for question, option, answer, solution, graph, figure, and table regions
  - [ ] Add provider adapters and formula/layout reconciliation
    - [x] Add page-scoped Gemini vision and Mathpix OCR benchmark adapters
    - [x] Store raw evidence, structured output, latency, quality metrics, failures, and audit logs
    - [x] Require an explicit Admin action and prevent duplicate credit usage by default
    - [x] Run the controlled pilot benchmark and score results against the source pages
    - [x] Select Gemini for primary image-page structuring and Mathpix for targeted formula-region evidence
    - [ ] Run a 100-page shadow extraction and measure verified-question yield, cost, and review time
      - [x] Prepare a private stratified 25-page sample for each of the four source profiles
      - [x] Exclude detected promotional/non-content pages and verify 100 unique source-image hashes
      - [x] Add resumable per-call checkpoints, quota stops, content-hash validation, and hard 100/25 provider ceilings
      - [ ] Obtain explicit approval for the expanded 100-page Gemini and conditional 25-page Mathpix transfer
      - [ ] Execute the shadow run and complete mathematical/content QA scoring
- [ ] Build chapter/exercise/question inventory reconciliation
- [ ] Match questions to answers and detailed solutions with page evidence
- [x] Add deterministic and AI-assisted mathematical verification
  - [x] Run a full deterministic QA sweep (`question-qa.ts`) across every live `DRAFT`/`REPORTED` question (1,833 total)
  - [x] Independently re-derive and verify the mathematics by hand for the full backlog, not just the deterministic-clean subset
  - [x] Correct objectively-certain errors (rendering/delimiter defects, sign and arithmetic slips, merged/corrupted extraction rows, reversed inequalities, wrong trig values) with versioned history (`QuestionVersion`) and audit-log entries — 68 questions corrected
  - [x] Mark mathematically-confirmed questions ready for a second-model (Codex) confirmation pass rather than auto-approving — 482 questions marked `MATHEMATICALLY_VERIFIED`
- [ ] Add human review queues for ambiguity, duplicates, figures, and low confidence
  - [x] Flag every question needing human judgement (missing source material, unrecoverable diagrams, ambiguous wording, duplicate rows) with evidence and a suggested resolution, tracked via `reviewNotes` and tags — 1,351 questions flagged
  - [ ] Build a dedicated queue UI/workflow surface for these flags (currently queryable via tags/`reviewNotes`, no dedicated screen)
- [ ] Add teacher-facing book, chapter, and exercise selectors
- [ ] Run a representative Class 11/12 pilot and choose paid providers from measured results
