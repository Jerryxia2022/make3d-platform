
# Make3D Deployment Plan

## Server

Provider: Aliyun ECS  
OS: Ubuntu 22.04  
CPU: 2 vCPU  
Memory: 2 GB  
Disk: 40 GB  
Public IP: 47.116.112.205  

## Domain

Primary domain:

make3d.com.cn

Backup domains:

make3d.xyz  
make3d.net.cn

## Deployment Method

Use Docker Compose.

The application should run as a Docker container.

## Ports

Application internal port:

3000

Public access:

80 / 443

## Reverse Proxy

Use Nginx as reverse proxy.

Route:

make3d.com.cn -> localhost:3000

## SSL

Use free SSL certificate.

Preferred:

Let's Encrypt

## File Storage

Uploaded files are stored locally:

/app/uploads

The uploads folder must be mounted as Docker volume.

## Database

Use SQLite.

Database file path:

/app/data/make3d.db

The data folder must be mounted as Docker volume.

## Environment Variables

Required:

ADMIN_EMAIL=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
APP_URL=
DATABASE_URL=
UPLOAD_DIR=

## Deployment Commands

Initial deployment:

git clone repository

cd make3d-platform

docker compose up -d --build

Update deployment:

git pull

docker compose up -d --build

View logs:

docker compose logs -f

Stop service:

docker compose down
