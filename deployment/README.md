# Make3D Deployment Reports

This directory stores production deployment reports and checklists.

For every production deployment:

- Create a SQLite database backup.
- Record the pre-deployment commit.
- Record the post-deployment commit.
- Run SQLite `integrity_check`.
- Record Docker status and logs review.
- Preserve the deployment report.
- Do not overwrite historical reports.

Recommended filename:

- `deployment-YYYYMMDD-HHMM-<summary>.md`

