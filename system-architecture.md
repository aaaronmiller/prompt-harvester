---
title: Prompt Harvester System Architecture
date: 2025-11-15 00:00:00 PST
ver: 1.0.0
author: The Telekinetic Carrot
model: claude-sonnet-4-5-20250929
tags: [architecture, rag, semantic-search, data-extraction, ai-conversation-mining, vector-database, mcp, postgres, browser-automation]
---

# Prompt Harvester System Architecture

## Executive Summary

A comprehensive system for extracting, storing, and semantically searching AI conversation history across multiple platforms (Claude Code, OpenAI, Gemini, Anthropic). Designed to handle ~50M tokens/day with intelligent storage strategies and real-time capture capabilities.

## System Components

### 1. Data Sources

#### 1.1 Claude Code History
- **Location**: `~/.claude/history/` or similar
- **Format**: Likely JSON/JSONL with conversation threads
- **Extraction Method**: File system crawler + JSON parser
- **Checkpoints**: Roo/Clio code state snapshots

#### 1.2 Downloaded Database Exports
- **Platforms**: OpenAI, Gemini, Anthropic
- **Format**: ZIP archives containing JSON/CSV
- **Extraction Method**: Archive unpacker + format-specific parsers

#### 1.3 Real-time Web Capture
- **Platforms**: openai.com, gemini.google.com, claude.ai
- **Method**: Browser extension (Chrome/Firefox) + TamperMonkey fallback
- **Capture**: DOM mutations, API intercepts, WebSocket monitoring

### 2. Extraction Layer

#### 2.1 Claude Code Parser
```typescript
interface ClaudeCodeExtractor {
  scanHistoryDir(path: string): Promise<Conversation[]>
  parseCheckpoint(checkpointFile: string): Promise<ConversationState>
  extractUserPrompts(conversation: Conversation): UserPrompt[]
  extractModelResponses(conversation: Conversation): ModelResponse[]
}
```

#### 2.2 Database Import Service
```typescript
interface DBImporter {
  unpackArchive(zipPath: string): Promise<ExtractedFiles>
  detectFormat(files: ExtractedFiles): DataFormat
  parseOpenAI(data: any): Conversation[]
  parseGemini(data: any): Conversation[]
  parseAnthropic(data: any): Conversation[]
  normalize(conversations: Conversation[]): NormalizedConversation[]
}
```

#### 2.3 Browser Extension
```typescript
// Captures in real-time
interface BrowserCaptureExtension {
  interceptAPI(): void // Fetch/XHR intercept
  observeDOM(): void // MutationObserver for chat updates
  capturePrompt(text: string, metadata: CaptureMetadata): void
  captureResponse(text: string, metadata: CaptureMetadata): void
  syncToBackend(): Promise<void> // Real-time or batched
}
```

### 3. Processing Pipeline

#### 3.1 Normalizer
Converts all sources into unified schema:

```typescript
interface NormalizedConversation {
  id: string
  platform: 'claude-code' | 'openai' | 'gemini' | 'claude-web'
  model: string
  timestamp: Date
  project?: string // Detected or tagged
  messages: Message[]
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  contentSize: number
  timestamp: Date
  metadata: MessageMetadata
}
```

#### 3.2 Size Analyzer & Storage Strategy

**Rules**:
- User prompts < 10KB → Store verbatim in PostgreSQL
- User prompts ≥ 10KB → Store in object storage, reference in PG
- Responses < 5KB → Store verbatim in PG
- Responses 5KB-50KB → Store full in object storage, last 100 lines in PG
- Responses > 50KB → Store full in object storage, summary + last 50 lines in PG

#### 3.3 RAG Chunker

**Chunking Strategy**:
```python
def chunk_for_rag(content: str, metadata: dict) -> List[Chunk]:
    """
    Semantic chunking with overlap for context preservation
    """
    chunk_size = 512  # tokens
    overlap = 128     # tokens
    
    # For code: chunk by function/class boundaries
    # For prose: chunk by semantic paragraphs
    # Preserve metadata in each chunk
    
    chunks = smart_chunk(content, chunk_size, overlap)
    return [
        Chunk(
            content=chunk,
            metadata={
                **metadata,
                'chunk_index': i,
                'total_chunks': len(chunks)
            }
        )
        for i, chunk in enumerate(chunks)
    ]
```

#### 3.4 NLP Processor

**Capabilities**:
- Project detection via keywords/patterns
- Topic extraction (TF-IDF, KeyBERT, or LLM-based)
- Conversation relationship mapping
- Problem-solution pair detection
- Code language detection

**Example**:
```python
class NLPProcessor:
    def detect_project(self, conversation: Conversation) -> Optional[str]:
        # Keywords: "DataKiln", "Delobotomize", etc.
        pass
    
    def extract_topics(self, text: str) -> List[str]:
        # "mcp-server", "agent-skills", "python-debugging"
        pass
    
    def find_related_conversations(
        self, 
        conversation_id: str,
        similarity_threshold: float = 0.75
    ) -> List[str]:
        # Vector similarity + metadata matching
        pass
```

#### 3.5 Metadata Generator

Enriches each message with:
```typescript
interface MessageMetadata {
  source: string
  project?: string
  topics: string[]
  programmingLanguage?: string
  hasCodeBlocks: boolean
  hasMermaidDiagrams: boolean
  relatedConversations: string[]
  problemsDescribed: string[]
  solutionsProvided: string[]
  fileReferences: string[]
  toolsUsed: string[]
}
```

### 4. Storage Layer

#### 4.1 PostgreSQL Schema

```sql
-- Main conversations table
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform VARCHAR(50) NOT NULL,
    model VARCHAR(100),
    project VARCHAR(200),
    started_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    message_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_conversations_project ON conversations(project);
CREATE INDEX idx_conversations_platform ON conversations(platform);
CREATE INDEX idx_conversations_started_at ON conversations(started_at);
CREATE INDEX idx_conversations_metadata ON conversations USING GIN(metadata);

-- Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT, -- Small messages stored here
    content_summary TEXT, -- For large responses
    content_tail TEXT, -- Last 50-100 lines for large responses
    content_size INTEGER NOT NULL,
    content_location VARCHAR(500), -- S3/R2 path if externalized
    timestamp TIMESTAMP NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_role ON messages(role);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_metadata ON messages USING GIN(metadata);

-- Topics table (many-to-many)
CREATE TABLE topics (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) UNIQUE NOT NULL,
    category VARCHAR(100)
);

CREATE TABLE message_topics (
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    topic_id INTEGER REFERENCES topics(id) ON DELETE CASCADE,
    confidence FLOAT,
    PRIMARY KEY (message_id, topic_id)
);

-- Conversation relationships
CREATE TABLE conversation_relationships (
    conversation_a UUID REFERENCES conversations(id) ON DELETE CASCADE,
    conversation_b UUID REFERENCES conversations(id) ON DELETE CASCADE,
    similarity_score FLOAT,
    relationship_type VARCHAR(50), -- 'similar', 'continuation', 'related'
    PRIMARY KEY (conversation_a, conversation_b)
);

-- Full-text search
CREATE TABLE message_search (
    message_id UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    search_vector tsvector
);

CREATE INDEX idx_message_search_vector ON message_search USING GIN(search_vector);
```

#### 4.2 Vector Database (Pinecone/Weaviate/Qdrant)

**Choice**: Qdrant (self-hosted, fast, great filtering)

```python
# Schema
{
    "vectors": {
        "size": 1536,  # OpenAI ada-002 or similar
        "distance": "Cosine"
    },
    "payload_schema": {
        "conversation_id": "keyword",
        "message_id": "keyword",
        "project": "keyword",
        "topics": "keyword[]",
        "platform": "keyword",
        "timestamp": "integer",
        "role": "keyword",
        "chunk_index": "integer"
    }
}
```

#### 4.3 Object Storage (Cloudflare R2)

**Structure**:
```
r2://prompt-harvester/
  conversations/
    {conversation_id}/
      messages/
        {message_id}.txt
        {message_id}.md (if formatted)
  exports/
    daily/
      {date}.jsonl
  embeddings/
    checkpoints/
      {date}.tar.gz
```

### 5. Services

#### 5.1 Daily Sync Service

```typescript
// Runs as cron job or systemd timer
class DailySyncService {
  async run() {
    // 1. Scan Claude Code history for new entries
    const newClaudeCodeConvos = await this.scanClaudeCode()
    
    // 2. Check for new checkpoints
    const newCheckpoints = await this.scanCheckpoints()
    
    // 3. Process new items
    await this.processAndStore(newClaudeCodeConvos)
    await this.processAndStore(newCheckpoints)
    
    // 4. Generate embeddings for new content
    await this.generateEmbeddings()
    
    // 5. Update relationships
    await this.updateRelationships()
    
    // 6. Backup to R2
    await this.backup()
  }
}
```

**Deployment**: Cloudflare Workers Cron or systemd timer on macOS

#### 5.2 Embedding Service

```python
class EmbeddingService:
    def __init__(self):
        # Use local model or API
        self.model = 'text-embedding-3-small'  # or sentence-transformers
    
    async def embed_message(self, message: Message) -> np.ndarray:
        chunks = chunk_for_rag(message.content, message.metadata)
        embeddings = []
        
        for chunk in chunks:
            emb = await self.get_embedding(chunk.content)
            embeddings.append({
                'vector': emb,
                'payload': {
                    'conversation_id': message.conversation_id,
                    'message_id': message.id,
                    'chunk_index': chunk.metadata['chunk_index'],
                    **chunk.metadata
                }
            })
        
        return embeddings
```

#### 5.3 Semantic Search API

```typescript
interface SearchQuery {
  query: string
  filters?: {
    project?: string
    topics?: string[]
    platforms?: string[]
    dateRange?: { start: Date, end: Date }
    role?: 'user' | 'assistant'
  }
  limit?: number
  similarityThreshold?: number
}

class SemanticSearchService {
  async search(query: SearchQuery): Promise<SearchResult[]> {
    // 1. Generate query embedding
    const queryVector = await this.embedQuery(query.query)
    
    // 2. Vector search in Qdrant with filters
    const vectorResults = await this.qdrant.search({
      vector: queryVector,
      filter: this.buildFilter(query.filters),
      limit: query.limit || 20,
      score_threshold: query.similarityThreshold || 0.7
    })
    
    // 3. Fetch full context from PostgreSQL
    const enrichedResults = await this.enrichResults(vectorResults)
    
    // 4. Re-rank if needed
    return this.rerank(enrichedResults, query.query)
  }
}
```

#### 5.4 MCP SQL Interface

```typescript
// MCP server that understands the schema
class PromptHarvesterMCP {
  tools = {
    'search_prompts': {
      description: 'Search prompts using natural language',
      parameters: {
        query: 'string',
        filters: 'object'
      },
      handler: async (query: string, filters: any) => {
        // Convert natural language to SQL + vector search
        const sql = await this.nlToSQL(query, filters)
        return await this.execute(sql)
      }
    },
    'get_conversation': {
      description: 'Get full conversation by ID',
      parameters: { id: 'string' },
      handler: async (id: string) => {
        return await this.db.getConversation(id)
      }
    },
    'find_related': {
      description: 'Find conversations related to a topic or ID',
      parameters: {
        reference: 'string', // ID or topic
        limit: 'number'
      },
      handler: async (ref: string, limit: number) => {
        return await this.findRelated(ref, limit)
      }
    }
  }
}
```

### 6. Real-time Capture Components

#### 6.1 Browser Extension Architecture

**Manifest V3 Extension**:

```json
{
  "manifest_version": 3,
  "name": "AI Prompt Harvester",
  "version": "1.0.0",
  "permissions": [
    "storage",
    "webRequest",
    "webRequestBlocking"
  ],
  "host_permissions": [
    "https://openai.com/*",
    "https://gemini.google.com/*",
    "https://claude.ai/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://openai.com/*", "https://claude.ai/*", "https://gemini.google.com/*"],
      "js": ["content.js"],
      "run_at": "document_start"
    }
  ]
}
```

**Content Script** (content.js):

```typescript
class PromptCapture {
  private endpoint = 'http://localhost:3000/api/capture'
  
  init() {
    // Intercept fetch/XHR
    this.interceptFetch()
    
    // Watch DOM for chat updates
    this.observeChat()
    
    // Periodic sync
    setInterval(() => this.sync(), 30000)
  }
  
  interceptFetch() {
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      const response = await originalFetch(...args)
      
      // Clone response to read body
      const clone = response.clone()
      const body = await clone.json()
      
      // Detect AI API calls
      if (this.isAIAPICall(args[0])) {
        this.captureAPICall(args, body)
      }
      
      return response
    }
  }
  
  observeChat() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Detect new messages
        if (this.isNewMessage(mutation)) {
          this.captureMessage(mutation.target)
        }
      }
    })
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    })
  }
  
  async captureMessage(element: HTMLElement) {
    const message = this.extractMessage(element)
    await this.send(message)
  }
  
  async send(data: any) {
    await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  }
}

new PromptCapture().init()
```

#### 6.2 TamperMonkey Alternative

For users without extension install permissions:

```javascript
// ==UserScript==
// @name         AI Prompt Harvester
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Capture AI conversations
// @match        https://openai.com/*
// @match        https://claude.ai/*
// @match        https://gemini.google.com/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';
    
    // Same logic as browser extension
    // Uses GM_xmlhttpRequest for cross-origin requests
})();
```

### 7. User Interface

#### 7.1 Web Dashboard (Svelte + Hono)

**Features**:
- Conversation timeline view
- Collapsible message cards (2-3 lines → expand)
- Semantic search bar
- Project/topic filters
- Related conversation suggestions
- Export functionality

**Tech Stack**:
- Frontend: SvelteKit
- Backend: Hono on Bun
- Deploy: Cloudflare Workers (static) + Vercel (API if needed)
- UI: Tailwind CSS + shadcn-svelte

**Example Component**:

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  
  let conversations = []
  let searchQuery = ''
  let filters = {}
  
  async function search() {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: searchQuery, filters })
    })
    conversations = await response.json()
  }
  
  onMount(search)
</script>

<div class="container">
  <SearchBar bind:value={searchQuery} on:search={search} />
  <Filters bind:filters on:change={search} />
  
  <div class="conversations">
    {#each conversations as conv}
      <ConversationCard {conv} />
    {/each}
  </div>
</div>
```

#### 7.2 CLI Tool

```bash
# Search prompts
prompt-harvest search "mcp server configuration" --project DataKiln

# Get conversation
prompt-harvest get <conv-id>

# Find related
prompt-harvest related <conv-id>

# Export
prompt-harvest export --project DataKiln --format json > datakiln.json

# Sync
prompt-harvest sync
```

### 8. Size Estimates

#### 8.1 User Input Data

**Assumptions**:
- 100-200KB actual user content per day
- Average prompt: 200 tokens (~800 bytes)
- ~125-250 prompts per day

**Monthly**: 3-6 MB of user prompts
**Yearly**: 36-72 MB of user prompts

#### 8.2 Model Responses

**With 50M tokens/day**:
- Assuming 4 bytes/token average
- 50M tokens = 200 MB/day raw
- With caching/repetition, unique content ~20-50 MB/day

**Storage with summaries**:
- Full responses in R2: 20-50 MB/day → 600 MB - 1.5 GB/month
- Summaries in PG: ~5-10 MB/day → 150-300 MB/month

#### 8.3 Vector Embeddings

**Assumptions**:
- 1536-dimensional vectors (OpenAI ada-002)
- 4 bytes per dimension → 6KB per vector
- 500 chunks/day (with RAG chunking)

**Monthly**: 500 × 30 × 6KB = 90 MB
**Yearly**: ~1 GB

#### 8.4 Total Storage (1 year)

- PostgreSQL: ~5-10 GB (metadata, small content, summaries)
- Vector DB: ~1-2 GB (embeddings)
- Object Storage: ~7-18 GB (full responses)
- **Total**: ~15-30 GB/year

**Very manageable!**

### 9. Implementation Phases

#### Phase 1: Core Infrastructure (Week 1)
1. Set up PostgreSQL database with schema
2. Set up Qdrant vector database
3. Set up Cloudflare R2 bucket
4. Build normalizer and basic storage pipeline

#### Phase 2: Data Extraction (Week 2)
1. Build Claude Code history parser
2. Build database import service (OpenAI/Gemini/Anthropic)
3. Test with existing data exports

#### Phase 3: Processing Pipeline (Week 3)
1. Implement size analyzer and storage routing
2. Build RAG chunker
3. Implement embedding service
4. Build NLP processor for metadata

#### Phase 4: Real-time Capture (Week 4)
1. Build browser extension
2. Create TamperMonkey script
3. Implement capture API endpoint
4. Test on live platforms

#### Phase 5: Search & Interface (Week 5-6)
1. Build semantic search service
2. Build MCP server with SQL interface
3. Create web dashboard (Svelte)
4. Create CLI tool

#### Phase 6: Automation (Week 7)
1. Build daily sync service
2. Set up cron jobs / systemd timers
3. Implement backup procedures
4. Add monitoring/logging

### 10. Technology Stack Summary

**Backend**:
- Runtime: Bun
- Framework: Hono
- Database: PostgreSQL 15+
- Vector DB: Qdrant
- Object Storage: Cloudflare R2
- ORM: Drizzle ORM (Bun-compatible)

**Frontend**:
- Framework: SvelteKit
- UI: Tailwind CSS + shadcn-svelte
- Deployment: Cloudflare Workers

**Browser Capture**:
- Extension: Manifest V3 (Chrome/Firefox)
- Alternative: TamperMonkey
- Communication: WebSocket or REST API

**ML/NLP**:
- Embeddings: OpenAI text-embedding-3-small or sentence-transformers
- NLP: spaCy or transformers library
- Topic extraction: KeyBERT or LLM-based

**Deployment**:
- Static/CDN: Cloudflare Workers
- Database: Railway/Render/self-hosted
- Vector DB: Self-hosted Qdrant (Docker)

**DevOps**:
- Container: Docker
- Orchestration: docker-compose
- Monitoring: Prometheus + Grafana (optional)
- Logging: Structured JSON logs → Loki

### 11. Critical Considerations

#### 11.1 Privacy & Security
- All data stays local or in user-controlled cloud
- Encrypt sensitive content at rest
- API keys stored in environment variables
- Browser extension: minimal permissions

#### 11.2 Performance
- Use connection pooling for PostgreSQL
- Batch embeddings generation
- Cache frequent searches
- Use pagination for large result sets

#### 11.3 Reliability
- Daily backups to R2
- Idempotent sync operations
- Retry logic for failed captures
- Health checks on all services

#### 11.4 Scalability
- Horizontal scaling for API servers
- Vector DB sharding if needed
- CDN for static assets
- Consider read replicas for PostgreSQL

## Next Steps

1. Review architecture with Ice-ninja
2. Prioritize implementation phases
3. Set up development environment
4. Begin Phase 1 implementation
