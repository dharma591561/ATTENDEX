# CLASSYNC — Complete Full-Stack College Portal
## Master Engineering Documentation — Phase 1

CLASSYNC is a production-grade academic attendance and student management platform featuring strict role-based access control (RBAC), relational database persistence, verified academic roll number mapping, faculty application review, and private super administrator initialization.

---

### 1. Project Architecture

The application is structured as a full-stack TypeScript project running on Node.js + Express with React and Vite:

```
├── server/
│   ├── db/
│   │   └── database.ts           # SQLite (better-sqlite3) connection, WAL mode, schema & indexes
│   ├── services/
│   │   ├── authService.ts        # Bcrypt password hashing (12 rounds), session tokens, user hydration
│   │   ├── otpService.ts         # Cryptographic 6-digit OTP, roll number validator, rate limits
│   │   ├── emailService.ts       # Nodemailer SMTP transporter, templates, connection verification
│   │   └── auditService.ts       # Administrative audit logging with secret redaction
│   ├── middleware/
│   │   ├── auth.ts               # Session cookie extractor, requireAuth, role checks, CSRF protection
│   │   └── upload.ts             # Multer avatar upload with JPEG/PNG/WebP magic byte inspection
│   └── routes/
│       ├── authRoutes.ts         # /api/auth (login, logout, me, send-otp, verify-otp, reset-password)
│       ├── studentRoutes.ts      # /api/students (register, profile, avatar, change-password)
│       ├── facultyRoutes.ts      # /api/faculty (applications, status, profile, avatar)
│       └── adminRoutes.ts        # /api/admin (overview, students, faculty review, audit logs)
├── scripts/
│   └── init-founder.ts           # Private server-side CLI script to initialize the single founder
├── src/
│   ├── api/
│   │   └── client.ts             # Fetch client with credentials and typed API calls
│   ├── context/
│   │   └── AuthContext.tsx       # Global session state, login, logout, and user profile hooks
│   ├── components/
│   │   ├── Navbar.tsx            # Academic top bar satisfying Top Bar Contract
│   │   └── Footer.tsx            # Academic tech footer
│   ├── pages/
│   │   ├── LandingPage.tsx       # Portal overview and live SMTP status banner
│   │   ├── LoginPage.tsx         # Role portal login (Student, Faculty, Founder)
│   │   ├── StudentRegisterPage.tsx # CSE Student registration with live OTP verification
│   │   ├── FacultyApplyPage.tsx  # Faculty application submission
│   │   ├── ApplicationStatusPage.tsx # Application tracking console
│   │   ├── ForgotPasswordPage.tsx# Secure recovery via email verification code
│   │   ├── student/              # Student dashboard & profile management
│   │   ├── faculty/              # Faculty console & profile management
│   │   └── admin/                # Founder analytics, directory, approvals, audit logs
│   └── tests/
│       └── attendx.test.ts       # Automated unit & integration test suite (node:test)
├── server.ts                     # Full-stack Express entry point mounting Vite middlewares
└── package.json                  # Scripts: dev, build, start, init-founder, test
```

---

### 2. Required Software

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **SQLite 3**: Bundled automatically via `better-sqlite3`

---

### 3. Installation Instructions

Clone the repository and install all dependencies:

```bash
npm install
```

---

### 4. Development Server Command

To launch the full-stack server (Express handling `/api/*` and Vite serving the React client on port 3000):

```bash
npm run dev
```

The portal will be accessible at: `http://localhost:3000`

---

### 5. Database Setup

The application automatically provisions its relational SQLite database on first startup at `./data/attendx.db` with:
- **Write-Ahead Logging (WAL)** enabled for fast concurrent read/write transactions: `PRAGMA journal_mode = WAL;`
- **Foreign Key Enforcement**: `PRAGMA foreign_keys = ON;`
- **Single Founder Invariant**: Enforced at the schema level:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS idx_single_founder ON users(role) WHERE role = 'FOUNDER';
  ```
- **Student Roll Number Normalization & Uniqueness**: Stored as uppercase strings with UNIQUE constraints:
  ```sql
  CREATE TABLE student_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    roll_number TEXT UNIQUE NOT NULL COLLATE NOCASE,
    branch TEXT NOT NULL,
    section TEXT NOT NULL,
    ...
  );
  ```

---

### 6. Database Migration Command

Database schemas and index creations are idempotent and migrate automatically upon server launch. If you need to manually inspect or seed the database, run:

```bash
npx tsx -e "import { initDatabase } from './server/db/database'; initDatabase(); console.log('Database verified.');"
```

---

### 7. SMTP Configuration (Real Email OTP Delivery)

CLASSYNC sends real 6-digit numeric OTP verification emails using Nodemailer.

#### Step-by-step Gmail SMTP Setup:
1. Log into your Google Account and visit [Google 2-Step Verification](https://myaccount.google.com/signinoptions/two-step-verification). Ensure it is turned ON.
2. Go to [Google App Passwords](https://myaccount.google.com/apppasswords).
3. Under "App name", type `CLASSYNC` and click **Create**.
4. Copy the generated **16-character password** (e.g., `abcd efgh ijkl mnop`).
5. Open your `.env` file and configure:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_16_character_app_password
SMTP_FROM="CLASSYNC College Portal <noreply@classync.edu>"
```

*Note: Never use your regular Gmail personal password. Google requires an App Password.*

---

### 8. Environment Variable Documentation

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `PORT` | Local server port | `3000` |
| `NODE_ENV` | Environment mode (`development` / `production`) | `development` |
| `DATABASE_PATH` | Path to persistent SQLite database file | `./data/attendx.db` |
| `SESSION_SECRET` | Cryptographic secret for hashing internal tokens | `classync_super_secure_random_session_secret` |
| `SMTP_HOST` | SMTP server host (e.g. `smtp.gmail.com`) | Required for live email |
| `SMTP_PORT` | SMTP port (`587` for STARTTLS, `465` for SSL) | `587` |
| `SMTP_SECURE` | Boolean flag for SSL port 465 | `false` |
| `SMTP_USER` | SMTP username/email address | Required for live email |
| `SMTP_PASS` | SMTP password or 16-char Google App Password | Required for live email |
| `SMTP_FROM` | Sender display name and address | `"CLASSYNC College Portal <noreply@classync.edu>"` |

---

### 9. Founder Initialization Command

**CRITICAL SECURITY REQUIREMENT**:
The Super Administrator (Founder) account cannot be created via public registration or HTTP APIs. It must be created via the private server-side CLI tool:

```bash
npm run init-founder
```

The script will:
1. Securely prompt for the founder email.
2. Securely prompt for the founder password with terminal keystroke masking (`*`).
3. Validate that no founder currently exists in the database.
4. Hash the password with bcrypt (12 rounds).
5. Insert the founder record and log an audit event (`FOUNDER_INITIALIZATION`).
6. Enforce that subsequent executions are rejected with a security violation error.

*(For automated testing / CI environments, arguments `--email` and `--password` can also be passed directly).*

---

### 10. Founder Login Instructions

1. Navigate to `http://localhost:3000` and click **Portal Login** in the top navigation bar.
2. Select the **Founder** tab.
3. Enter the founder email and the password chosen during CLI initialization.
4. Click **Sign in as Founder**.
5. You will be redirected to the **Super Administrator Console** (`/admin-dashboard`) with access to student records, pending faculty applications, audit trails, and system settings.

---

### 11. How to Run Tests

Run the built-in deterministic test suite using Node's test runner:

```bash
npm test
```
Or directly:
```bash
npx --yes tsx --test src/tests/attendx.test.ts
```

The test suite validates:
- Roll number format (`^26UECSE\d{4}$`) & initial roster range (`26UECSE0121` to `26UECSE0243`)
- Rejection of invalid and out-of-range roll numbers
- OTP generation, secure hashing, single-use, rate limits, and verification
- Bcrypt password hashing & length validation
- Single Founder Invariant (CLI script and database UNIQUE constraint)
- Session token generation (64-char hex) & user hydration
- Database-level unique constraints preventing duplicate roll numbers or emails

---

### 12. Production Build Instructions

To build the client SPA for production:

```bash
npm run build
```

The compiled assets will be placed in `./dist/`.

---

### 13. Deployment Instructions

To run in production mode:

1. Ensure `.env` is configured with production secrets and SMTP settings.
2. Build the frontend:
   ```bash
   npm run build
   ```
3. Start the production server:
   ```bash
   NODE_ENV=production npm run start
   ```
Express will serve the production bundle from `./dist/` alongside all `/api/*` endpoints on port 3000.

---

### 14. Database Backup and Recovery Instructions

#### Backup:
Since SQLite is configured in WAL mode, you can safely create a hot backup while the server is running:

```bash
# Using sqlite3 backup command
sqlite3 ./data/attendx.db ".backup ./data/attendx_backup_$(date +%Y%m%d).db"
```
Or copy `./data/attendx.db`, `./data/attendx.db-wal`, and `./data/attendx.db-shm` to a secure backup directory.

#### Recovery:
1. Stop the application server: `pkill -f "node server.ts"`
2. Replace `./data/attendx.db` with your backup copy.
3. Remove any stale `./data/attendx.db-wal` or `./data/attendx.db-shm` files.
4. Restart the server: `npm run start`

---

### 15. Known Scope Boundaries (Phase 1 vs Phase 2)

Per the Master Specification:
- **Phase 1 (Completed)**: Student registration, faculty application submission and review, founder private initialization, roll number mapping and validation, email OTP verification, profile management, avatar uploads, password recovery, RBAC, and administrative audit logging.
- **Phase 2 (Upcoming)**: Attendance sessions, dynamic QR code attendance generation, student geolocation check-in, attendance percentages, and subject period schedules. The database schema and user identity foundation are fully prepared to integrate Phase 2 modules without rebuilding authentication.
