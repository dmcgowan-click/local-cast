# Local Cast

A cloud-hosted web application for browsing audio and video files stored in S3 and casting them to Chromecast devices on the local network. Media is streamed from AWS CloudFront via signed URLs.

## Architecture

```
                                               ┌────────────────────┐
                                          ┌───▶│  S3 (frontend)     │
                                          │    └────────────────────┘
┌──────────────┐       ┌──────────────┐   │    ┌────────────────────┐
│  Vue.js SPA  │──────▶│  CloudFront  │───┼───▶│  S3 (media bucket) │◀── signed URL streaming
│  (browser)   │       │  (CDN)       │   │    │                    │
└──────────────┘       └──────────────┘   │    └────────────────────┘
                                          │    ┌──────────────────┐     ┌──────────────────────────┐
                                          └───▶│  API Gateway     │────▶│  Lambda (container image) │
                                               │  (HTTP API)      │     │  (backend API)            │
                                               └──────────────────┘     └──────────────────────────┘
```

All traffic flows through a single CloudFront distribution:

| Path | Origin | Purpose |
|---|---|---|
| `/api/*` | API Gateway → Lambda | Backend API (same-origin, no CORS) |
| `/media/*` | S3 media bucket | Signed URL media streaming |
| `/*` | S3 frontend bucket | Vue.js SPA static assets |

The backend runs on container-based Lambda (arm64) which provides native **scale-to-zero** — zero cost when idle.

## Tech Stack

| Component | Technology |
|---|---|
| Frontend | Vue.js 3 + TypeScript (Vite) |
| Backend | Node.js + TypeScript + Express (Lambda container) |
| Infrastructure | Pulumi (TypeScript) |
| CDN / HTTPS | CloudFront + ACM |
| Media Storage | S3 (`dmcgowan-cloudstore`) |
| Auth | Username/password, bcrypt, session cookies |
| DNS | Route 53 |

## Features

- **Media browsing** — Navigate folders and files in S3 (`Music/` and `Video/` prefixes)
- **Chromecast support** — Cast audio/video to Chromecast devices on the LAN via the Google Cast SDK (Default Media Receiver)
- **Local playback** — HTML5 `<audio>`/`<video>` fallback when no Chromecast is available
- **Supported formats** — `.mp4`, `.webm`, `.mp3`, `.flac`, `.aac`, `.ogg`
- **Signed URL streaming** — Media served via CloudFront signed URLs (6-hour expiry)

## Project Structure

```
├── app/
│   ├── client/              # Vue.js frontend (SPA)
│   ├── server/              # Node.js backend (Lambda container)
│   └── Dockerfile
├── pulumi/                  # Infrastructure as code
├── Makefile                 # Build and deploy targets
├── REQUIREMENTS-FINAL.md    # Detailed requirements specification
└── REQUIREMENTS-DRAFT.md    # Initial draft requirements
```

## Prerequisites

- AWS account with credentials configured
- Node.js (LTS)
- Docker
- Pulumi CLI

## Build & Deploy

All build steps rsync source to `/home/ubuntu/workspace/` before running (mounted filesystem performance optimisation).

```bash
# Prepare Pulumi dependencies
make prepare

# Prepare app dependencies
make prepare-app

# Build frontend
make build-app

# Build backend Docker image
make build-docker

# Deploy infrastructure
make deploy-infra

# Deploy application (push image to ECR, sync frontend to S3)
make deploy-app

# Run everything
make deploy
```

## API Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/auth/login` | Authenticate with username/password | No |
| `POST` | `/api/auth/logout` | Clear session | Yes |
| `GET` | `/api/media/browse` | List folders and files at a given prefix | Yes |
| `GET` | `/api/media/url` | Get a signed URL for a media file | Yes |
| `GET` | `/health` | Health check | No |

## Security

- HTTPS enforced via CloudFront
- S3 buckets are private (OAC for frontend, signed URLs for media)
- Credentials stored in AWS Secrets Manager
- Session cookies: `HttpOnly`, `Secure`, `SameSite=Strict`
- Prefix parameter validated to prevent path traversal
- Least-privilege IAM on Lambda execution role
