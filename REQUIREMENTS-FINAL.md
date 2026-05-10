# REQUIREMENTS-FINAL.md — Local Cast

## Overview

A cloud-hosted web application that allows a single user to browse audio and video files stored in S3 and cast them to Chromecast devices on the local network. The phone's browser (on the same LAN as the Chromecast) handles device discovery via the Google Cast SDK; media is streamed from the cloud via CloudFront signed URLs.

---

## Architecture Summary

```
                                               ┌────────────────────┐
                                          ┌───▶│  S3 (frontend)     │
                                          │    └────────────────────┘
┌──────────────┐       ┌──────────────┐   │    ┌────────────────────┐
│  Vue.js SPA  │──────▶│  CloudFront  │───┼───▶│  S3 (media bucket) │◀── signed URL streaming
│  (browser)   │       │  (CDN)       │   │    │                    │◀┐
└──────────────┘       └──────────────┘   │    └────────────────────┘ │  ListObjectsV2
                                          │    ┌──────────────────┐     ┌─────┴────────────────────┐
                                          └───▶│  API Gateway     │────▶│  Lambda (container image) │
                                               │  (HTTP API)      │     │  (backend API)            │
                                               └──────────────────┘     └──────────┬───────────────┘
                                                                                   │
                                                                                   ▼
                                                                          ┌──────────────────┐
                                                                          │  Secrets Manager │
                                                                          │  (credentials)   │
                                                                          └──────────────────┘
```

All traffic flows through a single CloudFront distribution on `dmcgowan.click`:

| CloudFront Path | Origin | Notes |
|---|---|---|
| `/api/*` | API Gateway (HTTP API) | Proxied to Lambda; same-origin — no CORS needed |
| `/media/*` | S3 media bucket | Signed URL access |
| `/*` (default) | S3 frontend bucket | Vue.js SPA static assets |

### Scale-to-Zero

Container-based Lambda provides **native scale-to-zero** with no additional infrastructure:

- Lambda functions are only billed when invoked. When idle, there is zero cost.
- API Gateway invokes the Lambda directly; no orchestrator, ALB, or scale-down mechanism needed.
- Cold starts for container-based Lambda are typically **3–10 seconds**. To mitigate:
  - Keep the container image small (use a slim/alpine Node.js base image).
  - Optionally configure **Provisioned Concurrency = 1** if cold starts are unacceptable (adds cost).
- The frontend should handle occasional slow first responses gracefully (loading indicator on API calls).

---

## AWS Account & Existing Resources

| Resource | Value |
|---|---|
| AWS Account ID | `601374407704` |
| S3 Media Bucket ARN | `arn:aws:s3:::dmcgowan-cloudstore` |
| Media prefixes in bucket | `Music/` and `Video/` |
| Domain | `dmcgowan.click` |
| Domain DNS | Route 53 (already configured) |

---

## Frontend

| Item | Detail |
|---|---|
| Framework | Vue.js (latest stable, Vue 3) |
| Language | TypeScript |
| Source directory | `app/` |
| Hosting | S3 bucket (separate from media bucket) + CloudFront |
| Domain | `dmcgowan.click` (or subdomain e.g. `cast.dmcgowan.click` — configurable in Pulumi config) |
| HTTPS | ACM certificate, auto-validated via Route 53 DNS |

### Frontend Features

1. **Login page**: Username and password form. On success, stores a session cookie returned by the backend.
2. **Media browser**: After login, display a file/folder browser for the `Music/` and `Video/` prefixes in S3. Support navigating into subdirectories. Show folder names and file names following their existing Windows-style naming.
3. **File filtering**: Only show supported file types:
   - **Video**: `.mp4`, `.webm`
   - **Audio**: `.mp3`, `.flac`, `.aac`, `.ogg`
   - Skip/hide `.mkv` and other unsupported formats.
4. **Chromecast integration**:
   - Load the Google Cast SDK (`https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1`).
   - Use the **Default Media Receiver** (no custom receiver app ID or registration needed).
   - Show a Cast button when a Chromecast device is discovered on the LAN.
   - When the user selects a file and a Cast device: request a signed URL from the backend, then send a `LoadRequest` to the Chromecast with that URL.
5. **Local playback fallback**: If no Chromecast is available, play media in an HTML5 `<audio>` or `<video>` element.
6. **Loading states**: Show loading indicators on API calls. Handle slow cold-start responses gracefully (do not timeout prematurely — allow up to 15 seconds for API responses).

---

## Backend (Container-based Lambda)

| Item | Detail |
|---|---|
| Runtime | Node.js (LTS) + TypeScript |
| Source directory | `app/` (shared monorepo; backend in `app/server/`, frontend in `app/client/`) |
| Container | Docker image built from `app/server/`, pushed to ECR, deployed as a Lambda container image |
| Handler | Uses a Lambda-compatible web adapter (e.g., `aws-lambda-web-adapter` or `serverless-express`) to run Express behind Lambda |
| Memory | 512 MB |
| Timeout | 30 seconds |
| Architecture | `arm64` (Graviton — cheaper and faster cold starts) |

### API Endpoints

All API routes are prefixed with `/api`.

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/auth/login` | Accept `{ username, password }`, validate against Secrets Manager, return `Set-Cookie` with session token | No |
| `POST` | `/api/auth/logout` | Clear session cookie | Yes |
| `GET` | `/api/media/browse` | Query param `prefix` (default: empty → show `Music/` and `Video/` root). List S3 objects and common prefixes under the given prefix. Return `{ folders: string[], files: { key, name, size, lastModified }[] }`. Filter to supported extensions only. | Yes |
| `GET` | `/api/media/url` | Query param `key` (S3 object key). Generate and return a CloudFront signed URL (expiry: 6 hours). Return `{ url: string }`. | Yes |
| `GET` | `/health` | Returns `200`. No auth. Used by health monitoring. | No |

### Authentication

* Future task in introduce SSO with OIDC

- **Single user**. Credentials stored in **AWS Secrets Manager** as a JSON secret: `{ "username": "...", "passwordHash": "..." }`.
- Password hashed with **bcrypt**.
- On successful login, backend creates a signed session token (JWT or HMAC-signed cookie) with a configurable expiry (default: 24 hours).
- Session validated on every authenticated request via the cookie.
- Secret name configurable via Pulumi config (e.g. `local-cast/credentials`).

### Media Access

- Use the AWS SDK to call `ListObjectsV2` on `dmcgowan-cloudstore` scoped to the `Music/` and `Video/` prefixes.
- Only return objects whose keys end with supported extensions (`.mp4`, `.webm`, `.mp3`, `.flac`, `.aac`, `.ogg`).
- Generate **CloudFront signed URLs** using a CloudFront key pair (private key stored in Secrets Manager or as a Pulumi secret).
- Signed URL expiry: **6 hours**.

---

## Infrastructure (Pulumi)

| Item | Detail |
|---|---|
| Language | TypeScript |
| Source directory | `pulumi/` |
| Stack name | `organization/local-cast/prod` |
| Passphrase | Empty string (as per existing Makefile: `PULUMI_CONFIG_PASSPHRASE :=`) |

### Resources to Provision

1. **S3 Bucket — Frontend Hosting**
   - New bucket for the built Vue.js SPA files.
   - Bucket policy allowing CloudFront OAI/OAC read access.

2. **CloudFront Distribution**
   - **Origin 1 (default, `/*`)**: Frontend S3 bucket via OAC.
   - **Origin 2 (`/media/*`)**: Media S3 bucket (`dmcgowan-cloudstore`) for signed URL access.
   - **Origin 3 (`/api/*`)**: API Gateway HTTP API endpoint. Cache disabled; all requests forwarded (including headers, cookies, query strings).
   - CloudFront key pair / public key for signed URL generation.
   - ACM certificate for `dmcgowan.click` (or chosen subdomain).
   - Route 53 alias record pointing domain to CloudFront.
   - Benefits of routing API through CloudFront: same-origin cookies (no CORS), single TLS cert, AWS Shield Standard DDoS protection, optional WAF WebACL.

3. **Lambda Function (container image)**
   - Container image from ECR repository.
   - Memory: 512 MB. Timeout: 30 seconds. Architecture: `arm64`.
   - Execution IAM role with:
     - `s3:ListBucket` and `s3:GetObject` on `arn:aws:s3:::dmcgowan-cloudstore` and `arn:aws:s3:::dmcgowan-cloudstore/*`.
     - `secretsmanager:GetSecretValue` on the credentials secret.
   - Environment variables for configuration (bucket name, secret ARN, CloudFront domain — not secrets themselves).
   - Reserved concurrency: 1 (single user, prevent runaway invocations).

4. **API Gateway (HTTP API)**
   - Proxy all `/api/{proxy+}` requests to the Lambda function.
   - Default stage with auto-deploy.
   - No custom domain on API Gateway itself — accessed only via the CloudFront `/api/*` behavior.

8. **ECR Repository**
   - For the backend Docker image.
   - Lifecycle policy: keep last 5 images.

9. **Secrets Manager**
   - Secret for user credentials (`{ "username": "...", "passwordHash": "..." }`).
   - Secret for CloudFront signing private key (or use Pulumi secret).

10. **Route 53**
    - A/AAAA alias record for `dmcgowan.click` → CloudFront distribution.
    - (Zone already exists — look up existing hosted zone, do NOT create a new one.)

11. **ACM Certificate**
    - For `dmcgowan.click` (and optionally `*.dmcgowan.click`).
    - DNS validation via Route 53.

---

## Makefile

Extend the existing Makefile. All build and deploy steps MUST follow the existing `prepare` pattern: **rsync source to `/home/ubuntu/workspace/` and run build commands there** (not in the mounted workspace directory, due to filesystem performance).

Required targets:

| Target | Description |
|---|---|
| `prepare` | (existing) Sync Pulumi code and install deps |
| `prepare-app` | Rsync `app/` to `/home/ubuntu/workspace/app/`, install deps |
| `build-app` | Build the Vue.js frontend (in work dir) |
| `build-docker` | Build the Docker image for the backend (in work dir) |
| `deploy-infra` | Run `pulumi up` (in work dir) |
| `deploy-app` | Push Docker image to ECR, update Lambda function; sync frontend build to S3 + CloudFront invalidation |
| `deploy` | Run all: `prepare prepare-app build-app build-docker deploy-infra deploy-app` |

---

## File Structure

```
/workspaces/local-cast/
├── Makefile
├── REQUIREMENTS-FINAL.md
├── app/
│   ├── client/              # Vue.js frontend
│   │   ├── src/
│   │   │   ├── App.vue
│   │   │   ├── main.ts
│   │   │   ├── components/
│   │   │   │   ├── Login.vue
│   │   │   │   ├── MediaBrowser.vue
│   │   │   │   ├── CastButton.vue
│   │   │   │   └── LoadingSpinner.vue
│   │   │   ├── services/
│   │   │   │   ├── api.ts
│   │   │   │   └── cast.ts
│   │   │   └── router/
│   │   │       └── index.ts
│   │   ├── index.html
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── package.json
│   ├── server/              # Node.js backend
│   │   ├── src/
│   │   │   ├── index.ts         # Express app entry point
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── media.ts
│   │   │   │   └── health.ts
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts
│   │   │   └── services/
│   │   │       ├── s3.ts
│   │   │       ├── cloudfront.ts
│   │   │       └── secrets.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── Dockerfile
├── pulumi/
│   ├── index.ts
│   ├── Pulumi.yaml
│   ├── Pulumi.prod.yaml
│   ├── tsconfig.json
│   ├── package.json
│   └── resources/
│       ├── frontend.ts      # S3 bucket, CloudFront (frontend)
│       ├── cdn.ts            # CloudFront for media
│       ├── lambda.ts         # Lambda function (container image)
│       ├── apiGateway.ts     # API Gateway (HTTP API)
│       ├── ecr.ts            # ECR repository
│       ├── secrets.ts        # Secrets Manager
│       ├── dns.ts            # Route 53 + ACM

└── LICENSE
```

---

## Constraints & Non-Goals

- **No MKV support.** MKV files in the bucket are ignored/hidden.
- **No Google SSO.** Authentication is username/password only.
- **No transcoding.** Only files natively playable by Chromecast are supported.
- **Single user only.** No user registration or multi-tenancy.
- **No custom Cast receiver.** Use the Default Media Receiver.
- **Lambda reserved concurrency: 1.** Single user; prevent runaway invocations.

---

## Security Requirements

- All traffic over HTTPS (CloudFront enforces HTTPS redirect).
- S3 media bucket is private; access only via CloudFront signed URLs.
- S3 frontend bucket is private; access only via CloudFront OAC.
- Credentials stored in Secrets Manager, never in code or environment variables.
- Session cookies set with `HttpOnly`, `Secure`, `SameSite=Strict`.
- Backend validates `prefix` parameter to prevent path traversal outside `Music/` and `Video/`.
- Lambda execution role has least-privilege IAM (only S3 read on the media bucket and Secrets Manager read on the credentials secret).
- No VPC required — Lambda accesses AWS services via public endpoints.
