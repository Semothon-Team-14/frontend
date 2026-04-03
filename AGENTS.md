# AGENTS.md

## Project Context

- This repository is a React Native (Expo) frontend project.
- Also follow monorepo coordination rules in `../AGENTS.md` for cross-repository work.
- Build UI and interaction flows from `../figma.pdf`.
- Build data integration from backend APIs in `../backend`.
- Keep implementation aligned with existing navigation structure in `src/navigation`.
- Do not change files in `../backend`.

## Git Workflow Rules

- When completing a user task, make git commits proactively without asking for permission.
- Push commits proactively without asking for permission.
- Always commit and push after finishing a task.
- If a single task changes multiple files, split the work into separate commits by file.
- Default rule: one changed file per commit.
- Do not combine unrelated file changes into a single commit, even if they were requested in one prompt.
- Use clear, specific commit messages that describe the change in that one file.

## Permission Rules

- Do not ask for permission before normal development operations such as editing files, creating commits, or pushing commits.
- Ask for permission before dangerous or destructive git operations.
- Dangerous operations include `git reset`, `git reset --hard`, `git revert`, force-push, history rewriting, or anything else that can discard or rewrite work.

## Change Safety

- This is a team project and the worktree may contain teammate changes that are not yet tracked by git.
- Never revert or overwrite user changes unless the user explicitly requests it.
- Preserve unrelated tracked and untracked changes and limit edits, staging, commits, and pushes to the files required for the current task.

## Frontend Implementation Conventions

- Use reusable UI components for repeated Figma patterns (headers, cards, chips, list rows, buttons, tab sections).
- Separate concerns:
- Screen composition and navigation in `src/navigation/screens`.
- Shared presentational components under a dedicated component folder when introduced.
- API calls in service modules (do not call fetch directly from deep UI subcomponents).
- Keep API DTO mapping explicit at the boundary between service and UI state.
- Keep loading, empty, error, and retry states explicit on data-driven screens.
- Avoid hardcoding server responses into UI components.
- Keep icons/images centralized in `src/icons` and `src/images` unless a new asset domain is clearly needed.
- Follow current package stack and avoid introducing heavy state/data libraries unless requested.

## API Integration Rules

- Backend is the single source of truth for API paths, methods, request/response shapes, and auth rules.
- Before implementing each feature, confirm controller request/response contracts from `../backend`.
- If backend and Figma conflict, treat backend contract as data truth and adjust UI mapping accordingly.
- Introduce typed API models (TypeScript interfaces/types) as integration points are added.
- Centralize base URL and auth token/header logic to avoid duplicated network setup.

## UI/Interaction Rules From Figma

- Figma PDF (`../figma.pdf`) is the source of truth for layout, spacing, typography, color, and interaction flow.
- Match Figma exactly for sizing, font family/weight/size/line-height, spacing, radius, and component placement unless the user explicitly approves a deviation.
- Reproduce navigation transitions, button hierarchy, and stateful UI behavior shown in Figma.
- Implement responsive behavior for common mobile sizes; avoid fixed-size layouts that break on smaller devices.
- When a design token is reused, extract it into constants/theme files instead of repeating magic numbers.
- For screens/components that exist in Figma, frontend UI/UX must match Figma exactly.
- Exception rule: for behaviors not yet designed or not present in Figma (for example temporary loading placeholders, transitional popups, or incomplete main-screen details), keep UX minimal and clean while staying consistent with existing visual patterns.

## Quality and Validation

- After each meaningful change, run project checks at minimum:
- `npm run start -- --non-interactive` (or the project’s agreed smoke check command).
- Validate changed flows on at least one target runtime (iOS simulator, Android emulator, or Expo Go).
- For API-wired screens, verify success, empty, loading, and failure behavior manually.
- Keep console output clean of avoidable warnings for touched screens/modules.

## Next Steps Execution Plan

- Step 1: Read `../figma.pdf` and define screen inventory and navigation flow mapping.
- Step 2: Inspect `../backend` controllers/DTOs and define frontend API contract notes per screen.
- Step 3: Set up frontend app structure for scale:
- API client module, auth/header handling, typed models, and shared component folders.
- Step 4: Implement screens in priority order from Figma with placeholder/mock state first.
- Step 5: Connect each screen to real backend APIs and remove mock data.
- Step 6: Add per-screen loading/empty/error handling and retry UX.
- Step 7: Validate navigation and interaction parity with Figma, then polish visual details.
- Step 8: Run end-to-end manual smoke pass across core user flows.

## Save Workflow

- When the user says `save`, create a Markdown handoff note that summarizes what was completed and what should be done next.
- Save notes must be stored under `save-notes/`, not in the repository root.
- The save note filename must use Korea Standard Time in `YYYYMMDDHHmm.md` format.
- Save notes should be concise and practical for teammates continuing the work.
