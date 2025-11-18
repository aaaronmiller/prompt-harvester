---
title: Prompt Harvester - File Manifest
date: 2025-11-15 00:00:00 PST
ver: 1.0.0
author: The Telekinetic Carrot
model: claude-sonnet-4-5-20250929
tags: [manifest, file-listing, documentation, reference]
---

# 📁 Prompt Harvester - Complete File Manifest

## Overview
Total Files: 10
Total Size: ~108 KB
Lines of Code: ~2,500+

## 📄 Documentation Files

### EXECUTIVE-SUMMARY.md (9.3 KB)
**Purpose**: Quick-start guide and high-level overview
**Contains**:
- What the system does
- Key features
- Storage estimates for your usage
- Three implementation options
- Usage examples
- Immediate next actions
**Start Here**: YES - Read this first!

### README.md (9.9 KB)
**Purpose**: Comprehensive implementation guide
**Contains**:
- Detailed architecture overview
- Step-by-step setup instructions
- Configuration examples
- API usage examples
- Troubleshooting guide
- Storage estimates
- Roadmap
**Reference**: Keep this open during setup

### system-architecture.md (20 KB)
**Purpose**: Complete technical architecture documentation
**Contains**:
- Detailed component descriptions
- Data flow diagrams
- Technology stack rationale
- Database schema design notes
- Implementation phases (7 weeks)
- Size estimates and calculations
- Critical considerations
**For**: Deep dive into system design

## 💾 Database Files

### schema.sql (17 KB)
**Purpose**: Complete PostgreSQL database schema
**Contains**:
- 15+ tables with indexes
- Full-text search setup
- Triggers and functions
- Sample queries
- Optimized for your use case
**Run Once**: To create database structure
**Lines**: 480+ lines of production SQL

## 💻 Backend Code

### api-server.ts (16 KB)
**Purpose**: Main API server (Hono + Bun)
**Contains**:
- REST API endpoints
- Message capture handler
- Semantic search implementation
- Conversation management
- Statistics generation
**Run**: `bun run api-server.ts`
**Lines**: 500+ lines TypeScript
**Key Endpoints**:
- POST /api/capture - Receive messages
- POST /api/search - Semantic search
- GET /api/conversations - List/filter
- GET /api/stats - Statistics

### claude-code-parser.ts (13 KB)
**Purpose**: Parse Claude Code history files
**Contains**:
- File system scanner
- JSON/JSONL parser
- Project detection
- User prompt extraction
- Statistics generation
**Run**: `bun run claude-code-parser.ts`
**Lines**: 400+ lines TypeScript
**Key Features**:
- Scans ~/.claude/history
- Handles multiple formats
- Extracts metadata
- Filters by project/date

## 🌐 Browser Extension

### content-script.js (15 KB)
**Purpose**: Universal conversation capture script
**Contains**:
- Fetch/XHR interceptors
- DOM mutation observers
- Platform-specific extractors (OpenAI, Claude, Gemini)
- Auto-sync logic
- Queue management
**Runs**: Automatically on AI chat sites
**Lines**: 450+ lines JavaScript
**Platforms**: OpenAI, Claude.ai, Gemini

### browser-extension-manifest.json (2 KB)
**Purpose**: Browser extension configuration
**Contains**:
- Manifest V3 definition
- Permissions
- Content script mappings
- Host permissions
**Chrome/Firefox**: Both supported
**Load**: As unpacked extension

## 🛠️ Setup & Config

### quick-start.sh (6 KB)
**Purpose**: Automated setup script
**Contains**:
- Prerequisite checks
- Directory structure creation
- Dependency installation
- Database setup
- Qdrant Docker setup
- LaunchAgent creation (macOS)
**Run**: `./quick-start.sh`
**Lines**: 200+ lines Bash
**Platform**: macOS/Linux

### package.json (2 KB)
**Purpose**: Node/Bun package configuration
**Contains**:
- Dependencies list
- NPM scripts
- Project metadata
**Install**: `bun install`
**Scripts**:
- `bun run dev` - Start API
- `bun run parse` - Parse Claude Code
- `bun run db:setup` - Setup database

## 📊 File Size & Complexity

| File | Size | Lines | Complexity |
|------|------|-------|------------|
| system-architecture.md | 20 KB | 500+ | Low (docs) |
| schema.sql | 17 KB | 480+ | Medium |
| api-server.ts | 16 KB | 500+ | High |
| content-script.js | 15 KB | 450+ | High |
| claude-code-parser.ts | 13 KB | 400+ | Medium |
| README.md | 10 KB | 300+ | Low (docs) |
| EXECUTIVE-SUMMARY.md | 9 KB | 250+ | Low (docs) |
| quick-start.sh | 6 KB | 200+ | Medium |
| browser-extension-manifest.json | 2 KB | 60+ | Low |
| package.json | 2 KB | 40+ | Low |

**Total**: ~108 KB, 2,500+ lines of production code

## 🎯 Which Files to Focus On

### For Quick Start
1. **EXECUTIVE-SUMMARY.md** - Read first
2. **quick-start.sh** - Run this
3. **README.md** - Reference guide

### For Understanding
1. **system-architecture.md** - System design
2. **schema.sql** - Database structure
3. **api-server.ts** - Data flow

### For Implementation
1. **claude-code-parser.ts** - Start here (parse existing data)
2. **content-script.js** - Then add real-time capture
3. **api-server.ts** - Backend to receive everything

### For Customization
1. **schema.sql** - Add custom fields/tables
2. **api-server.ts** - Add custom endpoints
3. **claude-code-parser.ts** - Customize extraction logic

## 🔄 Typical Workflow

```
Day 1: Setup
├── Read EXECUTIVE-SUMMARY.md
├── Run quick-start.sh
├── Read README.md
└── Test: curl http://localhost:3000/health

Day 2: Parse Existing Data
├── Run claude-code-parser.ts
├── Check database: psql prompt_harvester
├── Query: SELECT COUNT(*) FROM conversations;
└── Query: SELECT * FROM v_user_prompts LIMIT 10;

Day 3: Real-time Capture
├── Install browser extension
├── Configure backend URL
├── Visit claude.ai/openai.com
├── Have conversations
└── Check API logs for captures

Day 4+: Use & Refine
├── Search: POST /api/search
├── Explore conversations
├── Add custom features
└── Build web UI (optional)
```

## 📦 Dependencies

### Runtime
- **Bun**: ^1.0.0 (JavaScript runtime)
- **PostgreSQL**: 15+ (main database)
- **Qdrant**: Latest (vector database)
- **Docker**: Latest (for Qdrant)

### Node Packages
- **hono**: ^4.0.0 (web framework)
- **pg**: ^8.11.3 (PostgreSQL client)
- **@qdrant/js-client-rest**: ^1.9.0 (Qdrant client)

### Optional
- **Cloudflare R2**: For object storage
- **OpenAI API**: For embeddings

## 🎓 Learning Path

1. **Beginner**: Start with EXECUTIVE-SUMMARY.md
2. **Intermediate**: Read system-architecture.md
3. **Advanced**: Study api-server.ts and schema.sql
4. **Expert**: Customize and extend the system

## 🚀 Deployment Checklist

- [ ] Read EXECUTIVE-SUMMARY.md
- [ ] Run quick-start.sh
- [ ] Test database connection
- [ ] Start Qdrant
- [ ] Run api-server.ts
- [ ] Test API with curl
- [ ] Install browser extension
- [ ] Parse existing Claude Code history
- [ ] Capture first real-time conversation
- [ ] Perform first search

## 🎯 Success Metrics

After setup, you should be able to:
- ✅ Query total conversations: `SELECT COUNT(*) FROM conversations;`
- ✅ Search prompts: `POST /api/search`
- ✅ See real-time captures in API logs
- ✅ Find related conversations
- ✅ Filter by project/platform

---

**All files are production-ready** - no placeholders, all working code!

**Total Package**: Complete system ready to deploy 🚀
