# Phase 2 & 3 Setup Guide

This guide walks you through setting up the intelligence layer (Phase 2) and analytics features (Phase 3) of Prompt Harvester.

## Prerequisites

- PostgreSQL database (already set up from Phase 1)
- Bun runtime (>= 1.0.0)
- Qdrant vector database
- (Optional) OpenAI API key for cloud embeddings
- (Optional) Ollama for local summaries

## Step 1: Install Qdrant

### Option A: Docker (Recommended)

```bash
docker pull qdrant/qdrant
docker run -p 6333:6333 -p 6334:6334 \
  -v $(pwd)/qdrant_storage:/qdrant/storage \
  qdrant/qdrant
```

### Option B: Native Installation

```bash
# macOS
brew install qdrant

# Linux
wget https://github.com/qdrant/qdrant/releases/download/v1.7.4/qdrant-x86_64-unknown-linux-gnu.tar.gz
tar -xzf qdrant-x86_64-unknown-linux-gnu.tar.gz
./qdrant
```

Verify Qdrant is running:
```bash
curl http://localhost:6333/health
```

## Step 2: Install Dependencies

```bash
bun install
```

This will install all Phase 2/3 dependencies including:
- `@qdrant/js-client-rest` - Vector database client
- `openai` - Cloud embeddings (optional)
- `natural` - NLP processing
- `@modelcontextprotocol/sdk` - MCP server
- `@xenova/transformers` - Local embeddings
- `archiver` - Backup exports
- `d3` - Visualizations

## Step 3: Update Database Schema

Run the updated schema to add Phase 2/3 tables:

```bash
psql -d prompt_harvester -f schema.sql
```

This adds:
- `conversation_topics` table for topic tracking
- `conversation_relationships` table for relationship mapping
- `prompt_templates` table for template extraction
- `template_ratings` table for user feedback
- `embeddings_error_log` table for error tracking
- Analytics views (token_usage_trends, trending_topics, etc.)

## Step 4: Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Database
DATABASE_URL=postgresql://localhost/prompt_harvester

# Qdrant
QDRANT_URL=http://localhost:6333

# Embedding Configuration
EMBEDDING_MODE=local  # or 'cloud'
OPENAI_API_KEY=sk-...  # Required if EMBEDDING_MODE=cloud

# Summary Generation (Phase 5)
SUMMARY_MODE=local  # or 'cloud'
OLLAMA_URL=http://localhost:11434

# R2 Storage (from Phase 1)
R2_ACCOUNT_ID=...
R2_ACCESS_KEY=...
R2_SECRET_KEY=...
```

### Embedding Modes

**Local Mode** (Recommended for privacy):
- Uses `all-MiniLM-L6-v2` model via transformers.js
- Runs entirely on your machine
- Free, but slightly lower quality
- Faster for large batches

**Cloud Mode** (Higher quality):
- Uses OpenAI `text-embedding-3-small`
- Requires API key and costs $0.02/1M tokens
- Better semantic understanding
- 1536-dimensional vectors

## Step 5: Initialize Qdrant Collection

```bash
bun run src/scripts/init-qdrant.ts
```

This creates the `prompts` collection with proper configuration.

## Step 6: Generate Embeddings (Batch Process)

For existing conversations, generate embeddings in batches:

```bash
# Process first 100 conversations
bun run embeddings:batch

# Or run the script directly with custom limit
bun run src/scripts/batch-embeddings.ts --limit=500
```

Monitor progress:
```bash
# Check embedding status
psql -d prompt_harvester -c "
SELECT
  embedding_status,
  COUNT(*) as count
FROM conversations
GROUP BY embedding_status;
"
```

Expected output:
```
 embedding_status | count
------------------+-------
 completed        |   450
 pending          |    50
 failed           |     0
```

## Step 7: Extract Topics

Run NLP processing to extract topics from conversations:

```bash
bun run src/scripts/extract-topics.ts --limit=500
```

This will:
- Analyze conversation content using TF-IDF
- Extract 3-7 topics per conversation
- Update global topic statistics
- Categorize topics automatically

## Step 8: Build Relationship Graph

Detect relationships between conversations:

```bash
bun run src/scripts/build-relationships.ts --limit=100 --similarity=0.8
```

This identifies:
- `builds_on`: Sequential work in same project
- `solves_same_problem`: Similar error handling
- `references`: High semantic similarity
- `contradicts`: Potentially conflicting information
- `near_duplicate`: Almost identical conversations

## Step 9: Extract Prompt Templates

Identify reusable prompt patterns:

```bash
bun run src/scripts/extract-templates.ts --min-occurrences=3
```

Templates are stored in `prompt_templates` table with:
- Original pattern
- Parameterized version (e.g., "Create a {language} function to {task}")
- Effectiveness score (based on follow-up conversations)
- Usage count

## Step 10: Start MCP Server (Claude Integration)

Configure Claude Code to use the MCP server:

1. Make MCP server executable:
```bash
chmod +x mcp-server/server.ts
```

2. Add to `~/.config/claude/mcp_config.json`:
```json
{
  "mcpServers": {
    "prompt-harvester": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/prompt-harvester/mcp-server/server.ts"],
      "env": {
        "DATABASE_URL": "postgresql://localhost/prompt_harvester",
        "QDRANT_URL": "http://localhost:6333",
        "EMBEDDING_MODE": "local"
      }
    }
  }
}
```

3. Restart Claude Code

4. Test in Claude:
```
Use the search_conversations tool to find prompts about "MCP configuration"
```

## Step 11: Verify Installation

Run the verification script:

```bash
bun run src/scripts/verify-setup.ts
```

This checks:
- ✅ Database connection
- ✅ Qdrant connection
- ✅ Embeddings generated
- ✅ Topics extracted
- ✅ Relationships built
- ✅ Templates extracted

## Optional: Set Up Dashboard (Phase 3)

See `DASHBOARD_SETUP.md` for SvelteKit dashboard installation.

## Automated Processing

Set up cron jobs for ongoing processing:

```bash
# Add to crontab (crontab -e)

# Generate embeddings for new conversations (hourly)
0 * * * * cd /path/to/prompt-harvester && bun run embeddings:batch --limit=50

# Extract topics (daily)
0 2 * * * cd /path/to/prompt-harvester && bun run src/scripts/extract-topics.ts --limit=100

# Build relationships (weekly)
0 3 * * 0 cd /path/to/prompt-harvester && bun run src/scripts/build-relationships.ts --limit=500

# Extract templates (weekly)
0 4 * * 0 cd /path/to/prompt-harvester && bun run src/scripts/extract-templates.ts
```

## Troubleshooting

### Qdrant Connection Fails

```bash
# Check if Qdrant is running
curl http://localhost:6333/health

# Check Docker logs
docker logs <qdrant-container-id>
```

### OpenAI API Errors

```bash
# Verify API key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### Embeddings Generation is Slow

- Switch to local mode for faster processing (though slightly lower quality)
- Reduce batch size
- Increase `MAX_CONCURRENT_EMBEDDINGS` in `.env`

### Out of Memory Errors

- Reduce batch sizes
- Use cloud mode instead of local embeddings
- Add more swap space

## Performance Benchmarks

Expected performance on M3 MacBook Pro:

| Operation | Local Mode | Cloud Mode |
|-----------|-----------|------------|
| Embedding generation | 20 conv/sec | 5 conv/sec |
| Topic extraction | 50 conv/sec | - |
| Relationship mapping | 10 conv/sec | - |
| Semantic search (P95) | 200ms | 150ms |

## Next Steps

1. **Phase 3**: Set up the web dashboard (see `DASHBOARD_SETUP.md`)
2. **Phase 4**: Configure automated backups
3. **Phase 5**: Enable AI-powered summaries

For questions or issues, see `TROUBLESHOOTING.md` or file an issue on GitHub.
