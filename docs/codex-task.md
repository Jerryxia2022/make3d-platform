
# Codex Development Task

Please build the Make3D V1.0 MVP based on the documents in the docs folder.
# Codex Development Task

## Project

Make3D V1.0 MVP

Build an online 3D printing quotation and order submission system.

## Documents

Please read and follow:

- docs/PRD.md
- docs/architecture.md
- docs/database.md
- docs/deployment.md

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- SQLite
- Docker
- Docker Compose

## Core Features

1. Public homepage
2. File upload page
3. Customer order form
4. Basic STL file information extraction
5. Estimated quotation display
6. Order submission
7. Admin login
8. Admin order list
9. File download
10. Order status update
11. Email notification for new orders

## MVP Scope

Do not implement:

- Online payment
- User registration
- Membership system
- Logistics tracking
- Multi-store system
- Complex ERP features
- Automatic production scheduling

## Required Pages

### Public Pages

- `/`
- `/quote`
- `/success`

### Admin Pages

- `/admin/login`
- `/admin/orders`
- `/admin/orders/[id]`

## Data Models

Use SQLite.

Main tables:

- orders
- files
- admins

## Upload Rules

Supported files:

- `.stl`
- `.3mf`
- `.step`
- `.stp`

Max file size:

- 50MB

Uploaded files must be stored in:

```text
/uploads

Quotation Rule

V1 quotation is only an estimate.

Display this text clearly:

此价格为系统预估，最终价格以人工确认为准。
Admin

Admin should be protected by simple password login.

Use environment variables:

ADMIN_USERNAME=
ADMIN_PASSWORD=
Email Notification

When a new order is submitted, send email to admin.

Use SMTP environment variables:

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
ADMIN_EMAIL=
Docker

Please provide:

Dockerfile
docker-compose.yml
.env.example
README.md update
Development Steps
Create project structure
Implement UI pages
Implement database
Implement file upload
Implement order submission
Implement admin login
Implement admin order management
Implement email notification
Add Docker deployment
Add README instructions
Output Requirements

After development, provide:

How to run locally
How to build with Docker
How to deploy on Ubuntu server
Environment variables needed
Known limitations
