# Kavya Transport ERP — Complete Setup Guide

> Hand this file to anyone who has downloaded the project zip. It covers everything from zero to a running system — local development and AWS production deployment.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [What You Need Before Starting](#2-what-you-need-before-starting)
3. [Local Development Setup](#3-local-development-setup)
   - 3.1 [PostgreSQL Database](#31-postgresql-database)
   - 3.2 [Redis](#32-redis)
   - 3.3 [MongoDB](#33-mongodb)
   - 3.4 [Backend (FastAPI)](#34-backend-fastapi)
   - 3.5 [Frontend (React)](#35-frontend-react)
   - 3.6 [Flutter Mobile App](#36-flutter-mobile-app)
4. [Environment Variables Reference](#4-environment-variables-reference)
5. [AWS Production Deployment](#5-aws-production-deployment)
   - 5.1 [Infrastructure Overview](#51-infrastructure-overview)
   - 5.2 [Provision AWS Infrastructure](#52-provision-aws-infrastructure)
   - 5.3 [Server Setup on EC2](#53-server-setup-on-ec2)
   - 5.4 [Deploy the Application](#54-deploy-the-application)
   - 5.5 [Nginx + SSL (HTTPS)](#55-nginx--ssl-https)
   - 5.6 [Systemd Services](#56-systemd-services)
6. [Data Flow & Architecture](#6-data-flow--architecture)
7. [Default Login Credentials](#7-default-login-credentials)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Project Overview

Kavya Transport ERP is a full-stack logistics management system with three layers:

| Layer | Technology | Purpose |
|---|---|---|
| **Backend** | Python / FastAPI | REST API, business logic, auth |
| **Frontend** | React + TypeScript + Vite | Web dashboard (port 3000) |
| **Mobile App** | Flutter (Android/iOS) | Driver & fleet management app |

**Databases used:**
- PostgreSQL 15 — primary relational data (jobs, trips, finance, users)
- Redis 7 — caching, Celery task queue
- MongoDB — logging, GPS telemetry, audit trails

---

## 2. What You Need Before Starting

### macOS

```bash
# Install Homebrew first if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Core tools
brew install postgresql@15 redis mongodb-community@7 python@3.11 node git

# AWS CLI + jq (only needed for AWS deployment)
brew install awscli jq
```

### Ubuntu / Debian (for EC2 or WSL)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.11 python3.11-venv python3-pip \
    postgresql-15 postgresql-client-15 redis-server \
    nodejs npm git nginx curl build-essential libpq-dev
```

### Flutter (for mobile app only)

- Download Flutter SDK from https://flutter.dev/docs/get-started/install
- Flutter requires **Dart SDK 3.9.2+**
- Android Studio (for Android emulator) or Xcode (for iOS simulator)
- Run `flutter doctor` after install and fix any issues shown

### Versions required

| Tool | Minimum Version |
|---|---|
| Python | 3.11 |
| Node.js | 18 LTS or newer |
| PostgreSQL | 15 |
| Redis | 7 |
| Flutter | 3.x (Dart 3.9.2+) |

---

## 3. Local Development Setup

### 3.1 PostgreSQL Database

```bash
# macOS — start the service
brew services start postgresql@15

# Connect as superuser and create the app database + user
psql postgres

-- Run these inside psql:
CREATE USER transport_erp WITH PASSWORD 'your_strong_password_here';
CREATE DATABASE transport_erp OWNER transport_erp;
GRANT ALL PRIVILEGES ON DATABASE transport_erp TO transport_erp;
\q
```

> **Important:** Replace `your_strong_password_here` with a real password. You will put this same password in the `.env` file in step 3.4.

### 3.2 Redis

```bash
# macOS
brew services start redis

# Verify it's running
redis-cli ping
# Expected output: PONG
```

### 3.3 MongoDB

```bash
# macOS
brew services start mongodb-community@7

# Verify
mongosh --eval "db.adminCommand('ping')"
# Expected output: { ok: 1 }
```

> MongoDB is used for logs and GPS telemetry. The application will create the `transport_erp_logs` database automatically on first use.

---

### 3.4 Backend (FastAPI)

**Step 1 — Navigate to the backend folder**

```bash
cd kavya_transport_erp/backend
```

**Step 2 — Create and activate a Python virtual environment**

```bash
python3.11 -m venv ../.venv
source ../.venv/bin/activate

# You should see (.venv) prefix in your terminal
```

**Step 3 — Install Python dependencies**

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

**Step 4 — Create the `.env` file**

Create a file at `backend/.env` (NOT committed to git — you must create it manually):

```env
# ── Application ────────────────────────────────────────────
APP_NAME=Transport ERP
ENVIRONMENT=development
DEBUG=true

# ── Security ────────────────────────────────────────────────
# Generate with: python -c "import secrets; print(secrets.token_hex(32))"
SECRET_KEY=REPLACE_WITH_64_CHAR_HEX_STRING_HERE
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# ── PostgreSQL ──────────────────────────────────────────────
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=transport_erp
POSTGRES_PASSWORD=your_strong_password_here
POSTGRES_DB=transport_erp

# ── MongoDB ─────────────────────────────────────────────────
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB=transport_erp_logs

# ── Redis ───────────────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# ── CORS ────────────────────────────────────────────────────
# Comma-separated list of allowed frontend origins
CORS_ORIGINS=["http://localhost:3000","http://localhost:5173"]

# ── File Storage (AWS S3) ───────────────────────────────────
# Leave blank for local file storage during development
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-south-1
S3_BUCKET=kavya-transports-uploads-prod

# ── Email (SMTP) ────────────────────────────────────────────
# Leave blank to skip email sending in development
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=noreply@kavyatransports.com
```

**Generate a SECRET_KEY:**

```bash
python -c "import secrets; print(secrets.token_hex(32))"
# Copy the output and paste it as the value of SECRET_KEY in .env
```

**Step 5 — Run database migrations**

```bash
# Make sure you are inside backend/ and venv is active
alembic upgrade head
```

This creates all tables in PostgreSQL automatically.

**Step 6 — Seed the database with initial data**

```bash
python seed_data.py
python seed_permissions.py
```

This creates:
- Admin user and all role accounts (see [Default Credentials](#7-default-login-credentials))
- Sample clients, vehicles, drivers, jobs, trips, invoices

**Step 7 — Start the backend server**

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API is now available at: `http://localhost:8000`
Interactive API docs: `http://localhost:8000/docs`

---

### 3.5 Frontend (React)

Open a new terminal tab:

```bash
cd kavya_transport_erp/frontend

# Install Node dependencies
npm install

# Start development server
npm run dev
```

The web app is now available at: `http://localhost:3000`

> The frontend expects the backend running on port 8000. If you change the backend port, update the `VITE_API_URL` in `frontend/.env`.

**Optional — create `frontend/.env`:**

```env
VITE_API_URL=http://localhost:8000/api/v1
```

---

### 3.6 Flutter Mobile App

Open another terminal tab:

```bash
cd kavya_transport_erp/kavya_app

# Download all Flutter packages
flutter pub get

# Run code generation (required once after pub get)
dart run build_runner build --delete-conflicting-outputs

# List available devices/emulators
flutter devices

# Run on Android emulator (replace emulator-5554 with your device ID)
flutter run -d emulator-5554

# Or run on iOS simulator
flutter run -d "iPhone 15"
```

**Configure the API URL for the app:**

By default the Flutter app points to `http://10.0.2.2:8000/api/v1` (Android emulator's loopback to host machine).

To point to a different server:

```bash
flutter run -d emulator-5554 \
  --dart-define=API_BASE_URL=http://YOUR_SERVER_IP:8000/api/v1
```

**Firebase setup (required for push notifications):**

1. Go to https://console.firebase.google.com → create project `kavya-transports`
2. Add Android app with package `com.kavya.transport`
3. Download `google-services.json` → place at `kavya_app/android/app/google-services.json`
4. Add iOS app → download `GoogleService-Info.plist` → place at `kavya_app/ios/Runner/GoogleService-Info.plist`

> Push notifications will not work without this. The rest of the app works fine without Firebase.

---

## 4. Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | YES | JWT signing key — min 64 hex chars |
| `POSTGRES_PASSWORD` | YES | PostgreSQL password you set in step 3.1 |
| `POSTGRES_USER` | YES | PostgreSQL username (default: transport_erp) |
| `POSTGRES_DB` | YES | Database name (default: transport_erp) |
| `MONGODB_URL` | YES | MongoDB connection string |
| `REDIS_HOST` | YES | Redis host (default: localhost) |
| `CORS_ORIGINS` | YES | JSON array of allowed frontend URLs |
| `AWS_ACCESS_KEY_ID` | Production | S3 file uploads |
| `AWS_SECRET_ACCESS_KEY` | Production | S3 file uploads |
| `S3_BUCKET` | Production | S3 bucket name |
| `SMTP_HOST` | Optional | For sending emails |
| `DEBUG` | Dev only | Set false in production |

---

## 5. AWS Production Deployment

### 5.1 Infrastructure Overview

```
Internet
    │
    ▼
Route 53 (DNS)
    │
    ▼
EC2 t3.medium (Ubuntu 22.04) — ap-south-1 Mumbai
├── Nginx (port 80/443)
│   ├── → Frontend (static files served from /var/www/kavya/frontend/dist)
│   └── → Backend (proxy to uvicorn on 127.0.0.1:8000)
├── uvicorn (FastAPI, port 8000, localhost only)
├── Celery Worker (background tasks)
└── Celery Beat (scheduled jobs)
    │
    ├── RDS PostgreSQL 15 (db.t3.small) — private subnet
    ├── ElastiCache Redis 7 (cache.t3.micro) — private subnet
    ├── MongoDB Atlas M10 (or DocumentDB) — external/private
    └── S3 Bucket (file uploads)
```

**Estimated monthly AWS cost:**
- EC2 t3.medium: ~$30
- RDS db.t3.small: ~$25
- ElastiCache cache.t3.micro: ~$13
- MongoDB Atlas M10: ~$57
- S3 + data transfer: ~$5
- **Total: ~$130/month**

---

### 5.2 Provision AWS Infrastructure

**Prerequisites:**

```bash
# Install AWS CLI
brew install awscli jq

# Configure with your IAM credentials
aws configure
# Enter: Access Key ID, Secret Access Key, Region: ap-south-1, Output: json

# Create an EC2 key pair (save the .pem file — you need it to SSH)
aws ec2 create-key-pair \
  --key-name kavya-prod-key \
  --query 'KeyMaterial' \
  --output text > ~/kavya-prod-key.pem
chmod 400 ~/kavya-prod-key.pem
```

**Run the provisioner:**

```bash
cd kavya_transport_erp

# For MongoDB Atlas (recommended — skip DocumentDB)
SKIP_DOCDB=true KEY_PAIR_NAME=kavya-prod-key bash scripts/aws_provision.sh
```

This script creates:
- VPC with public + private subnets in ap-south-1
- EC2 instance (Ubuntu 22.04)
- RDS PostgreSQL in private subnet
- ElastiCache Redis in private subnet
- S3 bucket with private access
- IAM user + policy for app S3 access

At the end, the script prints the EC2 public IP and RDS/Redis endpoints. **Save these values** — you will need them in the `.env`.

---

### 5.3 Server Setup on EC2

**SSH into the server:**

```bash
ssh -i ~/kavya-prod-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

**Install system dependencies:**

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.11 python3.11-venv python3-pip \
    nginx git curl build-essential libpq-dev nodejs npm

# Install Node 20 LTS (apt version may be old)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

**Create a non-root user for the app:**

```bash
sudo useradd -m -s /bin/bash kavya
sudo mkdir -p /var/www/kavya
sudo chown kavya:kavya /var/www/kavya
```

---

### 5.4 Deploy the Application

**Step 1 — Upload the project to EC2**

From your local machine (where the zip was extracted):

```bash
# Option A: Using scp
scp -i ~/kavya-prod-key.pem -r /path/to/kavya_transport_erp \
  ubuntu@YOUR_EC2_IP:/var/www/kavya/

# Option B: Using git (if you push to GitHub first)
sudo -u kavya git clone https://github.com/YOUR_USERNAME/kavya-transport-erp.git \
  /var/www/kavya
```

**Step 2 — Backend setup on server**

```bash
sudo -u kavya bash

cd /var/www/kavya

# Create venv
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
cd backend
pip install --upgrade pip
pip install -r requirements.txt
```

**Step 3 — Create production `.env` on the server**

```bash
nano /var/www/kavya/backend/.env
```

Fill in production values:

```env
APP_NAME=Transport ERP
ENVIRONMENT=production
DEBUG=false

SECRET_KEY=GENERATE_NEW_64_CHAR_HEX_STRING

# PostgreSQL (use RDS endpoint from aws_provision.sh output)
POSTGRES_HOST=YOUR-RDS-ENDPOINT.ap-south-1.rds.amazonaws.com
POSTGRES_PORT=5432
POSTGRES_USER=transport_erp
POSTGRES_PASSWORD=YOUR_RDS_PASSWORD
POSTGRES_DB=transport_erp

# MongoDB (use Atlas connection string)
MONGODB_URL=mongodb+srv://USER:PASSWORD@cluster.mongodb.net/transport_erp_logs

# Redis (use ElastiCache endpoint)
REDIS_HOST=YOUR-REDIS.cache.amazonaws.com
REDIS_PORT=6379
REDIS_DB=0

# CORS — your actual domain
CORS_ORIGINS=["https://kavyatransports.com","https://www.kavyatransports.com"]

# S3 (from IAM user created by provisioner)
AWS_ACCESS_KEY_ID=YOUR_IAM_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_IAM_SECRET_KEY
AWS_REGION=ap-south-1
S3_BUCKET=kavya-transports-uploads-prod

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your_app_password
EMAIL_FROM=noreply@kavyatransports.com
```

**Step 4 — Run migrations and seed data**

```bash
cd /var/www/kavya/backend
source /var/www/kavya/venv/bin/activate

alembic upgrade head
python seed_data.py
python seed_permissions.py
```

**Step 5 — Build the frontend**

```bash
cd /var/www/kavya/frontend
npm install
npm run build
# Output goes to frontend/dist/
```

---

### 5.5 Nginx + SSL (HTTPS)

**Copy the Nginx config:**

```bash
sudo cp /var/www/kavya/scripts/nginx_kavyatransports.conf \
  /etc/nginx/sites-available/kavyatransports.com

# Edit the file to replace the domain with your actual domain
sudo nano /etc/nginx/sites-available/kavyatransports.com

# Enable the site
sudo ln -s /etc/nginx/sites-available/kavyatransports.com \
           /etc/nginx/sites-enabled/kavyatransports.com

sudo rm /etc/nginx/sites-enabled/default  # Remove default site

# Test config
sudo nginx -t

# Reload
sudo systemctl reload nginx
```

**Install SSL certificate (Let's Encrypt — free):**

```bash
sudo apt install -y certbot python3-certbot-nginx

# Replace with your actual domain
sudo certbot --nginx -d kavyatransports.com -d www.kavyatransports.com

# Set up auto-renewal
echo "0 3 * * * root /usr/bin/certbot renew --quiet --post-hook 'systemctl reload nginx'" \
  | sudo tee /etc/cron.d/certbot-renew
```

---

### 5.6 Systemd Services

These keep the backend and background workers running permanently, even after reboots.

```bash
# Copy service files
sudo cp /var/www/kavya/scripts/kavya-api.service     /etc/systemd/system/
sudo cp /var/www/kavya/scripts/kavya-celery-worker.service /etc/systemd/system/
sudo cp /var/www/kavya/scripts/kavya-celery-beat.service   /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable all services (auto-start on reboot)
sudo systemctl enable kavya-api kavya-celery-worker kavya-celery-beat

# Start all services
sudo systemctl start kavya-api kavya-celery-worker kavya-celery-beat

# Check status
sudo systemctl status kavya-api
sudo systemctl status kavya-celery-worker

# View live logs
sudo journalctl -u kavya-api -f
```

**At this point your production app is live:**
- Frontend: `https://kavyatransports.com`
- API docs: `https://kavyatransports.com/api/v1/docs`

---

## 6. Data Flow & Architecture

```
Flutter App / React Frontend
        │
        │  HTTPS (JWT in Authorization header)
        ▼
    Nginx (port 443)
        │
        ├─ /api/*  → FastAPI (uvicorn port 8000)
        │               │
        │               ├── PostgreSQL (jobs, trips, finance, users)
        │               ├── Redis (token cache, Celery queue)
        │               ├── MongoDB (logs, GPS data, audit trail)
        │               ├── S3 (uploaded documents, POD photos)
        │               └── Celery Workers (background jobs)
        │
        └─ /*      → React static files (frontend/dist/)
```

**Authentication flow:**
1. User logs in → POST `/api/v1/auth/login` → returns `access_token` + `refresh_token`
2. Every request includes `Authorization: Bearer <access_token>`
3. Token contains: user_id, email, roles, permissions, branch_id, tenant_id
4. Access token expires in 30 minutes; use refresh token to get a new one

**Background task flow (Celery):**
- Celery worker picks up tasks from Redis queue
- Tasks include: scheduled reports, invoice reminders, GPS tracking aggregation
- Celery Beat runs scheduled cron jobs (daily/weekly summaries)

---

## 7. Default Login Credentials

After running `seed_data.py`, these accounts are available:

| Role | Email | Password |
|---|---|---|
| **Admin** | admin@kavyatransports.com | admin123 |
| Manager | manager@kavyatransports.com | manager123 |
| Fleet Manager | fleet@kavyatransports.com | fleet123 |
| Accountant | accountant@kavyatransports.com | accountant123 |
| Project Associate | associate@kavyatransports.com | associate123 |
| Driver | driver@kavyatransports.com | driver123 |

> **Change all passwords immediately in production** via the admin panel or the change-password API endpoint.

---

## 8. Troubleshooting

### Backend won't start — "SECRET_KEY must be set"

```bash
# Generate a valid key and add it to .env
python -c "import secrets; print(secrets.token_hex(32))"
```

### `alembic upgrade head` fails — "can't connect to PostgreSQL"

Check that:
1. PostgreSQL is running: `brew services list | grep postgresql`
2. The user and database exist (repeat step 3.1)
3. `POSTGRES_PASSWORD` in `.env` matches what you set in psql

### Backend starts but API calls return 422

This usually means the request body doesn't match the expected schema. Check the `/docs` page at `http://localhost:8000/docs` for the exact field names.

### Flutter app can't connect to backend (Android emulator)

`10.0.2.2` is the special Android emulator address for your host machine's `localhost`. Make sure the backend is running on port 8000 and no firewall is blocking it.

For a physical Android device on the same WiFi:
```bash
flutter run --dart-define=API_BASE_URL=http://YOUR_LOCAL_IP:8000/api/v1
```

### Frontend shows blank page or API errors

Check browser console for CORS errors. Make sure `CORS_ORIGINS` in `.env` includes `http://localhost:3000`.

### Redis connection refused

```bash
# macOS
brew services restart redis
redis-cli ping  # Should return PONG
```

### EC2 — service not starting after deploy

```bash
# Check logs
sudo journalctl -u kavya-api --no-pager -n 50

# Most common cause: missing .env file or wrong file path
ls /var/www/kavya/backend/.env
```

### RDS connection from EC2 timing out

Verify the RDS security group allows inbound port 5432 from the EC2 security group. This is configured in `aws_provision.sh` but double-check in the AWS console under VPC → Security Groups.

---

*Last updated: May 2026*
