# DocuSuite — Precision Document Studio (Monorepo)

DocuSuite is a brand-neutral, high-performance document processing platform designed for individuals, students, researchers, and enterprises. It provides comprehensive Phase 1 PDF manipulation modules, Phase 2 multi-format document conversion pipelines, BullMQ job queues, and an aesthetic, responsive Next.js frontend built with surgical precision.

---

## 1. Monorepo Architecture

```text
doc-suite/
├── backend/                  # Node.js + Express + BullMQ document processing engine
│   ├── src/                  # Core modules (pdf-tools, conversions, auth, jobs)
│   ├── tests/                # Vitest test suite (79 unit & integration tests)
│   ├── storage/              # Ephemeral document storage (temp & outputs)
│   ├── dist/                 # Compiled JavaScript distribution
│   ├── node_modules/         # Isolated backend dependencies
│   ├── package.json          # Backend scripts & dependency declarations
│   ├── tsconfig.json         # Backend TypeScript compiler settings
│   ├── vitest.config.ts      # Test runner configuration
│   ├── Dockerfile            # Multi-stage production container with LibreOffice & QPDF
│   ├── docker-compose.yml    # Complete stack (API, Worker, Redis, MongoDB)
│   ├── .dockerignore         # Docker build ignore rules
│   ├── .env                  # Local runtime environment variables (git-ignored)
│   └── .env.example          # Sanitized environment template
│
├── frontend/                 # Next.js 16 App Router + Tailwind CSS user interface
│   ├── src/                  # App routes, layout, UI components & workspace
│   │   ├── app/              # Routes: /, /tools, /tools/pdf/[slug], /convert, /status
│   │   ├── components/       # Layout, home, and reusable ToolWorkspace
│   │   ├── lib/              # Centralized API client & tools registry
│   │   └── types/            # TypeScript interfaces and contracts
│   ├── public/               # Static assets & brand placeholders
│   ├── package.json          # Frontend scripts & dependency declarations
│   ├── tsconfig.json         # Frontend TypeScript compiler settings
│   ├── next.config.ts        # Next.js configuration
│   ├── .env.local            # Frontend API URL configuration (git-ignored)
│   └── .gitignore            # Frontend build ignores
│
├── design-reference/         # Source-of-truth design specifications & artifacts
│   ├── design.md             # Complete Precision Document Studio design tokens
│   ├── homepage.html         # Standalone semantic HTML/CSS design mockup
│   └── screenshots/          # High-resolution screenshots of verified UI screens
│
├── .gitignore                # Root monorepo Git ignore file
└── README.md                 # Project documentation & quick-start guide
```

---

## 2. Prerequisites

- **Node.js:** `v20.x` or `v22.x` (LTS recommended)
- **npm:** `v10.x` or newer
- **MongoDB:** (Optional for local testing, mocked in integration test suite)
- **Redis:** (Optional for local sync processing, required for BullMQ background workers)
- **LibreOffice:** (Optional on host, packaged in Docker for Office conversions)

---

## 3. Quick Start Guide

### Step 1: Install Dependencies

Both services have isolated dependencies:

```bash
# 1. Install Backend Dependencies
cd backend
npm install

# 2. Install Frontend Dependencies
cd ../frontend
npm install
```

---

### Step 2: Configure Environment Variables

#### Backend (`backend/.env`):
A default `.env.example` is provided in `backend/`. To configure:
```bash
cd backend
cp .env.example .env
```
Default values:
```env
PORT=4000
NODE_ENV=development
API_PREFIX=/api
JWT_SECRET=super-secret-jwt-key-replace-in-production-min-32-chars
JWT_REFRESH_SECRET=super-secret-refresh-key-replace-in-production-min-32
STORAGE_LOCAL_ROOT=./storage
TEMP_DIR=./storage/temp
OUTPUT_DIR=./storage/outputs
```

#### Frontend (`frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

---

### Step 3: Start the Applications

Run the backend and frontend in separate terminals:

#### Terminal 1 — Start Backend Server:
```bash
cd backend
npm run dev
```
- **API URL:** `http://localhost:4000`
- **Interactive Swagger Docs:** `http://localhost:4000/api/docs`
- **OpenAPI Specification:** `http://localhost:4000/api/docs.json`

#### Terminal 2 — Start Frontend Application:
```bash
cd frontend
npm run dev
```
- **Web App URL:** `http://localhost:3000` (or `http://localhost:3001` if port 3000 is occupied)
- **PDF Tools Directory:** `http://localhost:3000/tools`
- **Conversion Directory:** `http://localhost:3000/convert`
- **System Telemetry:** `http://localhost:3000/status`

---

## 4. Testing & Validation

### Backend Tests:
The backend includes a comprehensive Vitest suite covering unit tests, cryptographic hashes, security validations, and API integration flows:

```bash
cd backend
npm test
```
*Expected result: 4 test suites passed, 79 out of 79 tests passed.*

### Frontend Production Build & TypeScript Check:
```bash
cd frontend

# TypeScript check:
npx tsc --noEmit

# Production build:
npm run build
```
*Expected result: Compiled successfully, all 36 static and partial prerender routes generated.*

---

## 5. Docker Deployment

To spin up the entire cluster (API server, BullMQ worker, Redis, and MongoDB) with headless LibreOffice:

```bash
cd backend
docker-compose up --build -d
```

- **API Container:** `docusuite-api` (Port 4000)
- **Worker Container:** `docusuite-worker`
- **Redis Queue:** `redis:6379`
- **Database:** `mongodb:27017`

---

## 6. Supported Operations Matrix

### Phase 1: PDF Tools (15 Modules)
| Tool | Endpoint | Method | Key Capability |
|---|---|---|---|
| Merge PDF | `/api/tools/pdf/merge` | `POST` | Lossless multi-document merging with page sequence control |
| Split PDF | `/api/tools/pdf/split` | `POST` | Extract page ranges or burst into single-page PDFs in a ZIP |
| Compress PDF | `/api/tools/pdf/compress` | `POST` | Vector-preserving structural stream optimization |
| Rotate PDF | `/api/tools/pdf/rotate` | `POST` | 90°, 180°, or 270° rotation for all or selected pages |
| PDF to JPG/PNG | `/api/tools/pdf/to-images` | `POST` | Rasterizes PDF pages into PNG or JPG images |
| JPG/PNG to PDF | `/api/tools/images/to-pdf` | `POST` | Combines multiple graphic files into standardized PDF |
| Reorder Pages | `/api/tools/pdf/reorder` | `POST` | Rearranges page order based on numerical array |
| Extract Pages | `/api/tools/pdf/extract` | `POST` | Pulls specific pages into a new document |
| Delete Pages | `/api/tools/pdf/delete` | `POST` | Permanently removes designated pages |
| Organize PDF | `/api/tools/pdf/organize` | `POST` | Atomic reordering, rotating, and deleting in a single pass |
| Crop PDF | `/api/tools/pdf/crop` | `POST` | Configurable top, bottom, left, and right margin trimming |
| Add Page Numbers | `/api/tools/pdf/add-page-numbers` | `POST` | Customizable headers/footers with "Page X of Y" styling |
| Add Watermark | `/api/tools/pdf/add-watermark` | `POST` | Text watermark stamp with angle and opacity controls |
| Protect PDF | `/api/tools/pdf/protect` | `POST` | AES encryption with user and owner passwords |
| Unlock PDF | `/api/tools/pdf/unlock` | `POST` | Decrypts protected documents using valid credentials |

### Phase 2: Document Conversions (12 Pairings)
| Conversion | Endpoint | Method | Engine |
|---|---|---|---|
| PDF ⇄ Word (DOCX) | `/api/tools/convert/pdf-to-word` & `word-to-pdf` | `POST` | LibreOffice Adapter |
| PDF ⇄ Excel (XLSX) | `/api/tools/convert/pdf-to-excel` & `excel-to-pdf` | `POST` | LibreOffice Adapter |
| PDF ⇄ PowerPoint (PPTX) | `/api/tools/convert/pdf-to-powerpoint` & `powerpoint-to-pdf` | `POST` | LibreOffice Adapter |
| CSV ⇄ Excel | `/api/tools/convert/csv-to-excel` & `excel-to-csv` | `POST` | Native ExcelJS Engine |
| Word to HTML | `/api/tools/convert/word-to-html` | `POST` | Native Mammoth Engine |
| HTML to PDF | `/api/tools/convert/html-to-pdf` | `POST` | Native PDFKit/Renderer |
| TXT to PDF | `/api/tools/convert/txt-to-pdf` | `POST` | Native PDFKit Paginated Engine |
| RTF to PDF | `/api/tools/convert/rtf-to-pdf` | `POST` | LibreOffice Adapter |

---

## 7. Security & Zero-Retention Architecture

1. **In-Memory & Ephemeral Storage:** Files uploaded by guests or registered users are stored in isolated temporary directories (`storage/temp`) and processed into `storage/outputs`.
2. **Automated Purge:** All temporary files are automatically expunged after download or upon expiration via periodic cleanup tasks.
3. **Encryption:** End-to-end TLS 1.3 encryption in transit with AES-256 for protected PDFs.
4. **No AI Training:** Document contents are never indexed, analyzed, or sent to third-party language models.

---

## 8. License

Distributed under the MIT License. Built with clinical precision for high-volume document workflows.
