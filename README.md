---
title: Prompt Harvester - Implementation Guide
date: 2025-11-15 00:00:00 PST
ver: 1.0.0
author: The Telekinetic Carrot
model: claude-sonnet-4-5-20250929
tags: [readme, implementation-guide, setup, deployment, documentation, getting-started]
---

# 🌾 Prompt Harvester

A comprehensive system for extracting, storing, and semantically searching your AI conversation history across multiple platforms (Claude Code, OpenAI, Gemini, Anthropic).

## 📋 Overview

**Problem**: You interact with AI models across multiple platforms daily, but have no unified way to:
- Search through past conversations
- Find that perfect prompt you used 3 weeks ago
- Leverage previous solutions to recurring problems
- Build a knowledge base from your AI interactions

**Solution**: Prompt Harvester automatically captures, processes, and indexes all your AI conversations with:

### Phase 1: Core Infrastructure ✅
- ✅ Multi-platform support (Claude Code, OpenAI, Gemini, web interfaces)
- ✅ Real-time browser capture via extension
- ✅ PostgreSQL storage with full-text search
- ✅ Smart storage (R2 for large conversations)
- ✅ Automated Claude Code session parsing

### Phase 2: Intelligence Layer 🚀
- ✅ Vector embeddings (OpenAI or local models)
- ✅ Semantic search via Qdrant
- ✅ Hybrid search (vector + full-text)
- ✅ NLP topic extraction with TF-IDF
- ✅ Conversation relationship mapping
- ✅ MCP integration for Claude Desktop

### Phase 3: Analytics & UX 📊
- ✅ Prompt template extraction
- ✅ Export to multiple formats (Markdown, JSON, CSV, Obsidian)
- ✅ Analytics views (token usage, trending topics, problem recurrence)
- 🚧 SvelteKit dashboard (structure provided)
- 🚧 Interactive visualizations (D3.js relationship graphs)

### Phase 4: Polish (Planned)
- Production-grade web dashboard
- Advanced filtering and search UI
- Automated backups with retention policy
- Dark mode support
- Keyboard shortcuts

### Phase 5: Future Enhancements (Planned)
- AI-generated conversation summaries (local or cloud)
- Voice interface
- Mobile app
- Team collaboration
- RAG integration for context-aware queries

## 🏗️ Architecture

```
┌─────────────────┐
│  Data Sources   │
│  • Claude Code  │
│  • OpenAI Web   │
│  • Gemini Web   │
│  • Claude Web   │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   Extractors    │
│  • File Parser  │
│  • Browser Ext  │
│  • DB Import    │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   Processing    │
│  • Normalize    │
│  • Chunk (RAG)  │
│  • NLP Extract  │
│  • Generate Meta│
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│    Storage      │
│  • PostgreSQL   │
│  • Qdrant Vec   │
│  • R2 Objects   │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   Interface     │
│  • Web UI       │
│  • CLI Tool     │
│  • MCP Server   │
└─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Bun** (runtime): `curl -fsSL https://bun.sh/install | bash`
- **PostgreSQL** 15+: `brew install postgresql@15` (macOS)
- **Qdrant** (vector DB): Docker recommended
- **Cloudflare R2** (optional, for object storage)

### 1. Database Setup

```bash
# Start PostgreSQL
brew services start postgresql@15

# Create database
createdb prompt_harvester

# Load schema
psql prompt_harvester < schema.sql
```

### 2. Vector Database Setup

```bash
# Start Qdrant via Docker
docker run -p 6333:6333 -p 6334:6334 \
  -v $(pwd)/qdrant_storage:/qdrant/storage:z \
  qdrant/qdrant

# Or install locally
brew install qdrant
qdrant
```

### 3. API Server Setup

```bash
# Install dependencies
bun install hono @qdrant/js-client-rest pg

# Create .env file
cat > .env << EOF
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=prompt_harvester
POSTGRES_USER=postgres
POSTGRES_PASSWORD=

QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=

PORT=3000
EOF

# Start server
bun run api-server.ts
```

### 4. Browser Extension Setup

```bash
# For Chrome/Edge:
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the browser-extension directory

# For Firefox:
# 1. Open about:debugging
# 2. Click "This Firefox"
# 3. Click "Load Temporary Add-on"
# 4. Select manifest.json
```

### 5. Claude Code Parser

```bash
# Run the parser
bun run claude-code-parser.ts

# Or import in your code
import ClaudeCodeParser from './claude-code-parser.ts'

const parser = new ClaudeCodeParser()
const conversations = await parser.scanAll()
console.log(`Found ${conversations.length} conversations`)
```

### 6. Phase 2/3 Setup (Intelligence Layer & Analytics)

```bash
# Run the automated installer
chmod +x install.sh
./install.sh

# Or manual setup:
# 1. Install all dependencies
bun install

# 2. Update database schema with Phase 2/3 tables
psql prompt_harvester < schema.sql

# 3. Generate embeddings for existing conversations
bun run embeddings:batch

# 4. Extract topics using NLP
bun run src/scripts/extract-topics.ts

# 5. Configure MCP server for Claude integration
# See PHASE2_SETUP.md for detailed instructions
```

For complete Phase 2/3 setup including MCP integration, semantic search, and analytics, see **[PHASE2_SETUP.md](./PHASE2_SETUP.md)**.

## 📦 Installation Steps

### Phase 1: Core Infrastructure (Day 1)

1. **Set up databases**
   ```bash
   # PostgreSQL
   psql prompt_harvester < schema.sql
   
   # Qdrant
   docker-compose up -d qdrant
   ```

2. **Start API server**
   ```bash
   bun run api-server.ts
   ```

3. **Test with curl**
   ```bash
   curl http://localhost:3000/health
   ```

### Phase 2: Data Extraction (Day 2-3)

1. **Parse Claude Code history**
   ```bash
   bun run claude-code-parser.ts
   ```

2. **Import database exports**
   - Download your data from OpenAI, Gemini, Anthropic
   - Place in `./imports/` directory
   - Run importer (TBD)

### Phase 3: Real-time Capture (Day 4-5)

1. **Install browser extension**
   - Load unpacked extension
   - Configure backend URL in popup
   - Enable capture

2. **Test capture**
   - Visit claude.ai or openai.com
   - Have a conversation
   - Check backend logs for captured messages

### Phase 4: Search & Interface (Week 2)

1. **Test semantic search**
   ```bash
   curl -X POST http://localhost:3000/api/search \
     -H "Content-Type: application/json" \
     -d '{"query": "mcp server configuration"}'
   ```

2. **Build web UI** (optional)
   - SvelteKit dashboard
   - Search interface
   - Conversation viewer

### Phase 5: Automation (Week 3)

1. **Daily sync service**
   ```bash
   # Add to crontab (macOS)
   crontab -e
   # Add: 0 2 * * * /path/to/daily-sync.sh
   ```

2. **Monitoring**
   - Check sync logs
   - Monitor database size
   - Verify embeddings generation

## 🔧 Configuration

### Environment Variables

```bash
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=prompt_harvester
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password

# Vector Database
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=optional_api_key

# Object Storage (optional)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret
R2_BUCKET=prompt-harvester

# API
PORT=3000
LOG_LEVEL=info

# Embeddings
OPENAI_API_KEY=your_key  # For embeddings
EMBEDDING_MODEL=text-embedding-3-small
```

### Browser Extension Settings

Open the extension popup to configure:
- **Backend URL**: Where to send captured data (default: http://localhost:3000)
- **Enable Capture**: Toggle real-time capture on/off
- **Sync Interval**: How often to sync (default: 30 seconds)
- **Platforms**: Which platforms to monitor

## 🔍 Usage Examples

### Search Commands

```bash
# Semantic search
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "how to configure MCP servers",
    "filters": {
      "project": "DataKiln",
      "platform": "claude-code"
    },
    "limit": 10
  }'

# Get conversation
curl http://localhost:3000/api/conversations/{id}

# List conversations
curl 'http://localhost:3000/api/conversations?project=DataKiln&limit=20'

# Get statistics
curl http://localhost:3000/api/stats
```

### CLI Usage (Future)

```bash
# Search
prompt-harvest search "mcp server config" --project DataKiln

# Get conversation
prompt-harvest get <conversation-id>

# Export
prompt-harvest export --project DataKiln --format json > export.json

# Sync
prompt-harvest sync --since yesterday
```

### MCP Integration (Future)

```typescript
// Use with Claude Desktop or other MCP clients
{
  "mcpServers": {
    "prompt-harvester": {
      "command": "bun",
      "args": ["run", "/path/to/mcp-server.ts"]
    }
  }
}
```

Then in Claude:
```
Find all my conversations about agent skills from the last month
```

## 📊 Storage Estimates

Based on 50M tokens/day coding usage:

| Component | Daily | Monthly | Yearly |
|-----------|-------|---------|--------|
| User Prompts | 100-200 KB | 3-6 MB | 36-72 MB |
| Model Responses (full) | 20-50 MB | 600 MB - 1.5 GB | 7-18 GB |
| Summaries | 5-10 MB | 150-300 MB | 1.8-3.6 GB |
| Embeddings | 3 MB | 90 MB | ~1 GB |
| **Total** | **28-63 MB** | **843 MB - 1.9 GB** | **~15-30 GB** |

Very manageable! Fits easily on any modern machine.

## 🎯 Roadmap

### ✅ Phase 1: Core (Weeks 1-2)
- [x] Database schema
- [x] API server
- [x] Claude Code parser
- [x] Browser extension
- [ ] Basic web UI

### 🔄 Phase 2: Enhancement (Weeks 3-4)
- [ ] Embedding generation
- [ ] Vector search
- [ ] NLP processing
- [ ] Project detection
- [ ] Topic extraction

### 🚀 Phase 3: Advanced (Month 2)
- [ ] MCP server
- [ ] CLI tool
- [ ] Daily sync automation
- [ ] Conversation relationships
- [ ] Problem-solution extraction

### 🌟 Phase 4: Polish (Month 3)
- [ ] Web dashboard (Svelte)
- [ ] Advanced filters
- [ ] Export functionality
- [ ] Statistics and analytics
- [ ] Documentation site

## 🛠️ Troubleshooting

### Browser extension not capturing

1. Check extension is enabled
2. Open DevTools console for errors
3. Verify backend URL in settings
4. Check CORS configuration in API server

### Database connection errors

```bash
# Check PostgreSQL is running
brew services list | grep postgresql

# Test connection
psql -h localhost -U postgres -d prompt_harvester
```

### Vector search not working

```bash
# Check Qdrant is running
curl http://localhost:6333/collections

# Verify embeddings are being generated
# (check logs or database)
```

## 🤝 Contributing

This is a personal project but contributions welcome:
1. Fork the repo
2. Create feature branch
3. Make changes
4. Submit PR

## 📝 License

MIT License - do whatever you want with this

## 🙏 Acknowledgments

- Claude for helping architect this system
- Anthropic for Claude API
- All the open source libraries used

## 📚 Additional Resources

- [Full System Architecture](./system-architecture.md)
- [Database Schema](./schema.sql)
- [API Documentation](./api-docs.md) (TBD)
- [Browser Extension Guide](./extension-guide.md) (TBD)

---

**Built with**: Bun, Hono, PostgreSQL, Qdrant, TypeScript, and ☕

**Questions?** Open an issue or reach out!

**Status**: 🚧 Work in Progress - Core components functional, polish ongoing
