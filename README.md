# Local Cast

A cloud-hosted web application for browsing audio and video files stored in S3 and casting them to Chromecast devices on the local network. Media is streamed from AWS CloudFront via signed URLs.

If you're a bit old school and still have local MP3's, MP4's, etc, and you want the convenience of casting them, this is for you!

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
                                               │  + authorizer    │     └──────────────────────────┘
                                               └──────────────────┘
                                                        │
                                               ┌──────────────────┐
                                               │  Lambda authorizer│
                                               │  (JWT validation) │
                                               └──────────────────┘
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
| Auth | Username/password, bcrypt, JWT session cookies, Lambda authorizer |
| DNS | Route 53 |

## Features

- **Media browsing** — Navigate folders and files in S3 with URL-based routing (deep-linkable, supports browser back/forward)
- **Chromecast support** — Cast audio/video to Chromecast devices on the LAN via the Google Cast SDK (Default Media Receiver)
- **Local playback** — Clicking a file plays it locally via the inline HTML5 `<audio>`/`<video>` player by default; casting only occurs when explicitly requested or a Chromecast session is already connected
- **Supported formats** — `.mp4`, `.webm`, `.mp3`, `.flac`, `.aac`, `.ogg`
- **Signed URL streaming** — Media served via CloudFront signed URLs (6-hour expiry)

## Project Structure

```
├── app/
│   ├── authorizer/          # Lambda authorizer (JWT session validation)
│   ├── client/              # Vue.js frontend (SPA)
│   ├── server/              # Node.js backend (Lambda container)
│   └── Dockerfile
├── pulumi/                  # Infrastructure as code (Pulumi + TypeScript)
│   ├── components/          # Reusable Pulumi component resources
│   └── index.ts             # Stack entrypoint
├── scripts/                     # Utility scripts
│   └── set-credentials.sh   # Set auth credentials in Secrets Manager
├── Makefile                 # Build and deploy targets
└── REQUIREMENTS-FINAL.md    # Detailed requirements specification
```

## Prerequisites

- AWS account with credentials configured
- Node.js (LTS)
- Docker
- Pulumi CLI

## Build & Deploy

All build steps rsync source to `/home/ubuntu/workspace/` before running (mounted filesystem performance optimisation).

```bash
# Preview infrastructure changes
make preview-infra

# Deploy infrastructure (builds authorizer automatically)
make up-infra

# Build and push backend Docker image to ECR
make deploy-server

# Build and deploy frontend to S3 + invalidate CloudFront
make deploy-client

# Set username, password, and JWT secret in Secrets Manager
make set-credentials
```

Run `make help` to see all available targets.

## API Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/auth/login` | Authenticate with username/password | No |
| `POST` | `/api/auth/logout` | Clear session | Yes |
| `GET` | `/api/media/browse` | List folders and files at a given prefix | Yes |
| `GET` | `/api/media/url` | Get a signed URL for a media file | Yes |
| `GET` | `/api/health` | Health check | No |

## Authentication

Authentication uses a two-layer approach:

1. **Login** — `POST /api/auth/login` validates credentials (bcrypt) and issues a signed JWT session cookie
2. **API Gateway authorizer** — A Lambda authorizer validates the JWT session cookie on protected routes (`/api/media/*`) before the request reaches the backend. This moves auth enforcement to the infrastructure layer, keeping the backend stateless and simple.

## Security

- HTTPS enforced via CloudFront
- CloudFront response headers policy: HSTS (1 year, preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`
- S3 buckets are private (OAC for frontend and media, signed URLs for media streaming)
- Credentials stored in AWS Secrets Manager
- Session cookies: `HttpOnly`, `Secure`, `SameSite=Strict`
- JWT signing and verification pinned to `HS256` algorithm
- Prefix parameter validated to prevent path traversal
- API Gateway Lambda authorizer enforces authentication at the infrastructure layer
- Least-privilege IAM on Lambda execution role
- CloudFront standard access logging enabled for audit and debugging
