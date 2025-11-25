# Prompt Harvester - Implementation TODO

Generated from prd-2.md on 2025-11-18

## Phase 2: Intelligence Layer

### 2.1 Vector Embedding Generation (Critical - 3-5 days)

- [ ] Install and configure Qdrant vector database
- [ ] Create `src/embedding-service.ts` with cloud/local modes
  - [ ] Implement OpenAI text-embedding-3-small integration
  - [ ] Implement local embedding with transformers.js (all-MiniLM-L6-v2)
  - [ ] Add batch processing (100 conversations per batch)
  - [ ] Add retry logic (max 3 attempts)
  - [ ] Add error logging and manual retry queue
- [ ] Add embedding metadata to database schema
- [ ] Create API endpoints:
  - [ ] POST /api/embeddings/batch
  - [ ] GET /api/embeddings/status
- [ ] Test embedding generation with sample data

### 2.2 Semantic Search Implementation (Critical - 4-6 days)

- [ ] Implement semantic search in `api-server.ts`
  - [ ] POST /api/search/semantic endpoint
  - [ ] POST /api/search/hybrid endpoint
  - [ ] Implement Reciprocal Rank Fusion (RRF) for hybrid search
- [ ] Add Qdrant filter building for projects, platforms, date ranges
- [ ] Implement similarity score thresholding (min 0.7)
- [ ] Add result ranking and pagination
- [ ] Test search accuracy and performance

### 2.3 NLP Topic Extraction (High - 3-4 days)

- [ ] Create `src/nlp-processor.ts`
  - [ ] Implement TF-IDF topic extraction
  - [ ] Add stop word filtering
  - [ ] Add keyword normalization
  - [ ] Extract 3-7 topics per conversation
- [ ] Add topics table to schema
- [ ] Add topics column to conversations table (TEXT[])
- [ ] Create GIN index on topics
- [ ] Implement automatic topic extraction on new conversations
- [ ] Add global topic counting and trending

### 2.4 Conversation Relationship Mapping (Medium - 4-5 days)

- [ ] Create conversation_relationships table
- [ ] Create `src/relationship-mapper.ts`
  - [ ] Implement similarity-based relationship detection (threshold 0.8)
  - [ ] Add relationship classification (builds_on, solves_same_problem, references, contradicts)
  - [ ] Implement problem-solution pair detection
- [ ] Add API endpoint for conversation graph
- [ ] Add relationship storage and retrieval

### 2.5 MCP Server Integration (High - 5-7 days)

- [ ] Create `mcp-server/` directory
- [ ] Create `mcp-server/server.ts`
  - [ ] Implement search_conversations tool
  - [ ] Implement get_conversation_context tool
  - [ ] Implement get_prompt_templates tool
- [ ] Add natural language query parsing
- [ ] Format results for LLM consumption (markdown with citations)
- [ ] Create Claude configuration documentation
- [ ] Test MCP integration with Claude Desktop

## Phase 3: Analytics & User Experience

### 3.1 Web Dashboard (SvelteKit) (High - 8-10 days)

- [ ] Initialize SvelteKit project in `dashboard/` directory
- [ ] Set up Tailwind CSS and shadcn-svelte
- [ ] Create base layout and navigation
- [ ] Implement pages:
  - [ ] Home/Timeline with infinite scroll
  - [ ] Search interface (advanced search)
  - [ ] Conversation detail view
  - [ ] Analytics dashboard
  - [ ] Topics page
  - [ ] Projects page
  - [ ] Export interface
- [ ] Create components:
  - [ ] ConversationCard.svelte
  - [ ] SearchInterface.svelte
  - [ ] FilterPanel.svelte
  - [ ] AnalyticsChart.svelte
  - [ ] TopicCloud.svelte
  - [ ] ExportModal.svelte
- [ ] Implement Svelte stores for state management
- [ ] Add API client with typed interfaces
- [ ] Test all dashboard features

### 3.2 Analytics Dashboard (Medium - 4-5 days)

- [ ] Create SQL views for analytics:
  - [ ] token_usage_daily
  - [ ] trending_topics
  - [ ] recurring_problems
- [ ] Implement analytics API endpoints
- [ ] Create Chart.js visualizations:
  - [ ] Token usage trends
  - [ ] Top topics with trend indicators
  - [ ] Platform distribution pie chart
  - [ ] Problem recurrence heat map
- [ ] Add prompt effectiveness metrics
- [ ] Test analytics accuracy

### 3.3 Prompt Template Extraction (Medium - 5-6 days)

- [ ] Create prompt_templates table
- [ ] Create template_examples table
- [ ] Create template_ratings table
- [ ] Create `src/template-extractor.ts`
  - [ ] Implement prompt clustering
  - [ ] Add pattern extraction (parameterization)
  - [ ] Calculate effectiveness scores
- [ ] Add template library UI
- [ ] Implement template rating system
- [ ] Add API endpoints for templates

### 3.4 Export & Sharing (Low - 3-4 days)

- [ ] Implement export endpoints:
  - [ ] GET /api/export/markdown/:project
  - [ ] GET /api/export/json/:project
  - [ ] GET /api/export/csv/:project
- [ ] Add export filtering (project, date range, topics)
- [ ] Implement markdown frontmatter generation
- [ ] Add topic-based organization
- [ ] Test export formats

## Phase 4: Polish & Production Hardening

### 4.1 Production-Grade Dashboard (Critical - 10-12 days)

- [ ] Implement virtual scrolling for timeline (100K+ conversations)
- [ ] Add advanced filter panel:
  - [ ] Multi-select project filtering
  - [ ] Platform checkbox filtering
  - [ ] Date range picker
  - [ ] Topic tag autocomplete
  - [ ] Similarity threshold slider
  - [ ] Token count range filter
- [ ] Enhance conversation detail view:
  - [ ] Syntax-highlighted code blocks
  - [ ] Interactive relationship graph (D3.js)
  - [ ] Edit tags and project assignment
  - [ ] Single conversation export
  - [ ] Quality rating interface
- [ ] Implement keyboard shortcuts:
  - [ ] Cmd+K: Focus search
  - [ ] Cmd+N: New search
  - [ ] Cmd+E: Export
  - [ ] Arrow keys: Navigation
  - [ ] Esc: Clear filters
- [ ] Add dark mode with system detection
- [ ] Implement RelationshipGraph.svelte with D3.js
- [ ] Add debounced search
- [ ] Optimize performance (P95 < 500ms)

### 4.2 Advanced Export & Backup System (High - 4-5 days)

- [ ] Create `src/export-service.ts`
- [ ] Implement multiple export formats:
  - [ ] Markdown with TOC
  - [ ] JSON (machine-readable)
  - [ ] CSV (spreadsheet)
  - [ ] SQLite (portable database)
  - [ ] Obsidian Vault (with backlinks)
- [ ] Add scheduled backups:
  - [ ] Daily incremental
  - [ ] Weekly full
  - [ ] Retention policy (7 daily, 4 weekly, 12 monthly)
- [ ] Implement streaming for large exports (>1000 conversations)
- [ ] Add backup cleanup logic

### 4.3 Analytics Enhancement (Medium - 3-4 days)

- [ ] Add real-time metrics (30-second updates)
- [ ] Implement custom date range selection
- [ ] Create enhanced SQL views:
  - [ ] token_usage_trends (with rolling averages)
  - [ ] problem_heat_map
  - [ ] platform_efficiency
- [ ] Add comparative analytics
- [ ] Implement problem recurrence heat map
- [ ] Add prompt effectiveness by template

### 4.4 Documentation Site (Medium - 5-6 days)

- [ ] Set up VitePress documentation site
- [ ] Create documentation structure:
  - [ ] Getting Started
  - [ ] User Guide
  - [ ] API Reference
  - [ ] Architecture
  - [ ] Troubleshooting
  - [ ] Changelog
- [ ] Write documentation content
- [ ] Add code examples with syntax highlighting
- [ ] Deploy to GitHub Pages or Cloudflare Pages

## Phase 5: Future Enhancements

### 5.1 AI-Generated Summaries (High - 6-8 days)

- [ ] Create `src/summary-service.ts`
- [ ] Implement local LLM integration (Ollama with Qwen2.5/DeepSeek)
- [ ] Implement cloud LLM integration (OpenAI GPT-4o-mini)
- [ ] Add summary caching in PostgreSQL
- [ ] Implement summary quality rating
- [ ] Auto-generate summaries for conversations > 50KB

### 5.2 Additional Future Features

- [ ] Voice interface (speak queries, TTS results)
- [ ] Mobile app (iOS/Android with sync)
- [ ] Team collaboration (shared prompt libraries)
- [ ] RAG integration (conversation history as context)
- [ ] Fine-tuned search model
- [ ] Automated problem detection alerts

## Infrastructure & Setup

### Database

- [ ] Update schema.sql with all new tables
- [ ] Create database migration system
- [ ] Add all necessary indexes
- [ ] Test schema on fresh database

### Dependencies

- [ ] Update package.json with:
  - [ ] @qdrant/js-client-rest
  - [ ] openai
  - [ ] natural (NLP library)
  - [ ] transformers.js (local embeddings)
  - [ ] @modelcontextprotocol/sdk
  - [ ] archiver (for backups)
  - [ ] d3 (visualizations)
  - [ ] chart.js
  - [ ] ollama (optional, for local summaries)
- [ ] Create dashboard/package.json with SvelteKit deps

### Configuration

- [ ] Create .env.example with all variables:
  - [ ] OPENAI_API_KEY
  - [ ] QDRANT_URL
  - [ ] DATABASE_URL
  - [ ] R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY
  - [ ] BACKUP_PATH
  - [ ] EMBEDDING_MODE (cloud/local)
  - [ ] SUMMARY_MODE (cloud/local)
- [ ] Create setup script for Qdrant installation
- [ ] Update quick-start.sh with Phase 2/3 setup

### Documentation

- [ ] Create PHASE2_SETUP.md
- [ ] Create PHASE3_SETUP.md
- [ ] Create DASHBOARD_USAGE.md
- [ ] Update API_REFERENCE.md
- [ ] Create TROUBLESHOOTING.md
- [ ] Update README.md with complete feature list
- [ ] Create MCP_INTEGRATION.md

## Testing

- [ ] Unit tests for embedding service
- [ ] Unit tests for NLP processor
- [ ] Unit tests for relationship mapper
- [ ] Integration test: search flow (query → embedding → Qdrant → PostgreSQL)
- [ ] Integration test: MCP tool invocation
- [ ] Performance test: 100K conversations
- [ ] Performance test: concurrent searches
- [ ] Export validation tests

## Success Criteria

### Phase 2
- [ ] 100% of existing conversations have embeddings
- [ ] Semantic search returns relevant results (90%+ satisfaction)
- [ ] MCP integration works in Claude Desktop
- [ ] Topic extraction runs automatically on new conversations
- [ ] Relationship graph contains 1000+ detected relationships

### Phase 3
- [ ] Dashboard loads all conversations with infinite scroll
- [ ] Analytics page displays real-time token usage trends
- [ ] 50+ prompt templates extracted and rated
- [ ] Export functionality generates valid Markdown/JSON
- [ ] All features tested and documented

## Implementation Timeline

- **Week 1**: Embedding Service + Qdrant integration
- **Week 2**: Semantic Search + Hybrid search
- **Week 3**: NLP Processing + Topic extraction
- **Week 4**: Relationship Mapping + Problem detection
- **Week 5**: MCP Integration + Claude configuration
- **Week 6-7**: Svelte Dashboard base + search interface
- **Week 8**: Analytics dashboard + visualizations
- **Week 9**: Prompt Templates + library UI
- **Week 10**: Export & Polish + documentation

**Total Estimated Effort**: 10 weeks (solo developer)

---

## Notes

- Prioritize Phase 2 features first (intelligence layer)
- Dashboard can be developed in parallel with Phase 2
- Test each component thoroughly before moving to next
- Keep documentation updated as features are implemented
- Consider user feedback for UX improvements
