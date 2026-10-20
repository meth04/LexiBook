---
trigger: model_decision
description: "Apply when creating or modifying app architecture, Rust IPC services, DTOs, project structure and shared contracts"
---

# Architecture and contracts
- Follow `docs/CONTRACTS.md`; record ADR for breaking changes and migrate safely.
- Tauri2 + React TS strict + PDF.js + SQLite; prevent UI from bypassing Rust domain validation.
- Typed Tauri adapters, explicit error unions, cancellation/idempotency, and no raw file paths in renderer.
- Backend is single owner of durable domain writes and Gemini calls.
- Prefer vertical tests for each service; no duplicative repositories or parallel incompatible types.
