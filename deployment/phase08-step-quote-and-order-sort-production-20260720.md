# Phase08 Production Deployment Record

- Date: 2026-07-20
- Target: `997e85883ba1ba91dc29faec5503bc40de76f7ef`
- Previous production commit: `2d7e225ac3ea65afd62dac5bc8484e8eb9946820`
- Production path: `/opt/make3d-platform`
- Backup: `/root/make3d-deploy-backups/20260720-125142`
- Database backup SHA-256: `d9ebdf56fef132cb5e92be5e74062a1c79ec3b41b1d983eea97fdd8f782d5fe5`
- Deployment: Docker Compose `make3d` service rebuild/update, no `down`, no schema migration
- Result: STEP production quote and local Workbench sorting passed; no rollback
- Residual: public quote API still includes the pre-existing `saved_upload.filepath` field; page UI does not display it, but the response contract needs a separate security correction
- Full evidence: `reports/phase08-step-quote-and-order-sort-production-deployment-final.md`

