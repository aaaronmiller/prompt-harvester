
# Product Requirements Document: Prompt Harvester Phase 2 & 3 Enhancements

## 1. Executive Summary

## 1.1 Purpose

Lil' Gimpy presents the enhancement PRD for **Prompt Harvester**, extending the existing Phase 1 MVP (data capture and storage) with Phase 2 (intelligence layer) and Phase 3 (analytics and user experience) features.paste.txt​

## 1.2 Current State

- **Deployed Components**: PostgreSQL schema, Hono API server, Claude Code parser, browser extension, automated setup
    
- **Functional Capabilities**: Multi-platform capture, size-based storage, full-text search, project detection
    
- **Missing**: Semantic search, NLP processing, web UI, MCP integration, analyticspaste.txt​
    

## 1.3 Enhancement Goals

1. Enable semantic search across 50M+ tokens/day of conversation data
    
2. Build AI-powered conversation analysis and relationship mapping
    
3. Create intuitive web dashboard for exploration
    
4. Integrate MCP server for natural language queries
    
5. Extract reusable prompt templates and patterns
    

## 2. Phase 2: Intelligence Layer

## 2.1 Feature: Vector Embedding Generation

**Priority**: Critical  
**Estimated Effort**: 3-5 days  
**Dependencies**: Qdrant installation, OpenAI API key OR local embedding model

## 2.1.1 Functional Requirements

**FR-2.1.1**: System shall generate 1536-dimensional embeddings for all user prompts and responses.paste.txt​

**FR-2.1.2**: Embedding generation shall support two modes:

- **Cloud Mode**: OpenAI `text-embedding-3-small` API
    
- **Local Mode**: Bun-compatible local embedding model (e.g., `transformers.js` with `all-MiniLM-L6-v2`)
    

**FR-2.1.3**: System shall batch-process existing conversations at 100 conversations per batch to avoid rate limits.

**FR-2.1.4**: Real-time embeddings shall generate asynchronously on conversation capture with retry logic (max 3 attempts).

**FR-2.1.5**: Failed embedding generation shall log errors and queue for manual retry via admin endpoint.

## 2.1.2 Technical Implementation

**File**: `src/embedding-service.ts` (new)

typescript

``import { OpenAI } from 'openai'; import { Database } from './database'; import { QdrantClient } from '@qdrant/js-client-rest'; interface EmbeddingConfig {   mode: 'cloud' | 'local';  openaiKey?: string;  modelName?: string; } export class EmbeddingService {   private openai?: OpenAI;  private qdrant: QdrantClient;  private db: Database;     constructor(config: EmbeddingConfig) {    if (config.mode === 'cloud') {      this.openai = new OpenAI({ apiKey: config.openaiKey });    }    this.qdrant = new QdrantClient({ url: 'http://localhost:6333' });    this.db = new Database();  }     async generateEmbedding(text: string): Promise<number[]> {    if (this.openai) {      const response = await this.openai.embeddings.create({        model: "text-embedding-3-small",        input: text.substring(0, 8192) // Truncate to token limit      });      return response.data[0].embedding;    } else {      // Local mode implementation with transformers.js      return await this.generateLocalEmbedding(text);    }  }     async processConversation(conversationId: string) {    const conv = await this.db.getConversation(conversationId);         // Generate embeddings    const promptEmbedding = await this.generateEmbedding(conv.user_prompt);    const responseEmbedding = await this.generateEmbedding(      conv.response_summary || conv.response_text || ''    );         // Store in Qdrant    await this.qdrant.upsert('prompts', {      points: [{        id: conversationId,        vector: promptEmbedding,        payload: {          conversation_id: conversationId,          project_name: conv.project_name,          platform: conv.platform,          created_at: conv.created_at        }      }]    });         // Update database with embedding metadata    await this.db.markEmbeddingComplete(conversationId);  }     async batchProcessExisting(limit: number = 100) {    const unprocessed = await this.db.getUnprocessedConversations(limit);    const results = { success: 0, failed: 0 };         for (const conv of unprocessed) {      try {        await this.processConversation(conv.id);        results.success++;      } catch (error) {        console.error(`Failed to process ${conv.id}:`, error);        results.failed++;      }    }         return results;  } }``

## 2.1.3 API Endpoints

**POST /api/embeddings/batch**  
Triggers batch processing of unprocessed conversations.

json

`{   "limit": 100,  "mode": "cloud" }`

**GET /api/embeddings/status**  
Returns embedding generation statistics.

json

`{   "total_conversations": 15234,  "embedded": 12891,  "pending": 2343,  "failed": 0 }`

## 2.1.4 Non-Functional Requirements

**NFR-2.1.1**: OpenAI embedding generation latency shall not exceed 500ms per conversation (P95).

**NFR-2.1.2**: Local embedding generation shall process ≥20 conversations/second on M3 MacBook Pro.

**NFR-2.1.3**: Embedding service shall implement exponential backoff for API failures (1s, 2s, 4s).

**NFR-2.1.4**: System shall log all embedding generation failures to `embeddings_error_log` table.

## 2.2 Feature: Semantic Search Implementation

**Priority**: Critical  
**Estimated Effort**: 4-6 days  
**Dependencies**: Qdrant, embeddings generated

## 2.2.1 Functional Requirements

**FR-2.2.1**: System shall support semantic search across user prompts with natural language queries.paste.txt​

**FR-2.2.2**: Search shall return results ranked by cosine similarity (threshold: 0.7 minimum).

**FR-2.2.3**: Results shall include conversation metadata (project, platform, date, similarity score).

**FR-2.2.4**: System shall support hybrid search combining vector similarity + full-text search.

**FR-2.2.5**: Search shall filter by: project name, platform, date range, minimum similarity score.

## 2.2.2 Technical Implementation

**File**: Update `api-server.ts`

typescript

`router.post('/api/search/semantic', async (c) => {   const { query, filters, limit = 20 } = await c.req.json();     // Generate query embedding  const queryEmbedding = await embeddingService.generateEmbedding(query);     // Search Qdrant  const vectorResults = await qdrant.search('prompts', {    vector: queryEmbedding,    limit: limit * 2, // Get extra for filtering    score_threshold: 0.7,    filter: buildQdrantFilter(filters)  });     // Fetch full conversation details from PostgreSQL  const conversationIds = vectorResults.map(r => r.id);  const conversations = await db.getConversationsByIds(conversationIds);     // Merge similarity scores  const results = conversations.map(conv => ({    ...conv,    similarity_score: vectorResults.find(r => r.id === conv.id)?.score  }));     return c.json({ results, total: results.length }); }); // Hybrid search: vector + full-text router.post('/api/search/hybrid', async (c) => {   const { query, filters, limit = 20, alpha = 0.5 } = await c.req.json();     // Vector search  const vectorResults = await semanticSearch(query, filters, limit);     // Full-text search  const textResults = await db.fullTextSearch(query, filters, limit);     // Reciprocal Rank Fusion (RRF) for combining results  const combined = combineResults(vectorResults, textResults, alpha);     return c.json({ results: combined.slice(0, limit) }); });`

## 2.2.3 Search Modes

|Mode|Use Case|Implementation|
|---|---|---|
|**Semantic**|"Find prompts about MCP configuration"|Vector similarity only|
|**Full-Text**|"Exact match: 'create_branch'"|PostgreSQL tsvector|
|**Hybrid**|Best of both worlds|RRF combination (alpha=0.5)|

## 2.3 Feature: NLP Topic Extraction

**Priority**: High  
**Estimated Effort**: 3-4 days  
**Dependencies**: None (uses built-in NLP)

## 2.3.1 Functional Requirements

**FR-2.3.1**: System shall automatically extract 3-7 topics per conversation using keyword extraction.paste.txt​

**FR-2.3.2**: Topics shall be normalized (lowercase, deduplicated, stop-words removed).

**FR-2.3.3**: System shall maintain a `topics` table with usage counts for trending analysis.

**FR-2.3.4**: API shall support filtering conversations by topic tags.

## 2.3.2 Technical Implementation

**File**: `src/nlp-processor.ts` (new)

typescript

``import natural from 'natural'; const TfIdf = natural.TfIdf; const tokenizer = new natural.WordTokenizer(); export class NLPProcessor {   private tfidf: natural.TfIdf;  private stopWords: Set<string>;     constructor() {    this.tfidf = new TfIdf();    this.stopWords = new Set([      'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that'      // ... full stop word list    ]);  }     extractTopics(text: string, numTopics: number = 5): string[] {    // Tokenize and clean    const tokens = tokenizer.tokenize(text.toLowerCase());    const filtered = tokens.filter(t =>      t.length > 3 &&      !this.stopWords.has(t) &&      /^[a-z]+$/.test(t)    );         // Add to TF-IDF corpus    this.tfidf.addDocument(filtered);         // Extract top terms    const topics: string[] = [];    this.tfidf.listTerms(this.tfidf.documents.length - 1)      .slice(0, numTopics)      .forEach(item => topics.push(item.term));         return topics;  }     async processConversation(conversationId: string, db: Database) {    const conv = await db.getConversation(conversationId);    const combinedText = `${conv.user_prompt} ${conv.response_summary || ''}`;         const topics = this.extractTopics(combinedText, 7);         // Store topics    await db.updateTopics(conversationId, topics);         // Update global topic counts    for (const topic of topics) {      await db.incrementTopicCount(topic);    }  } }``

**SQL Schema Addition**:

sql

`CREATE TABLE topics (   topic_name TEXT PRIMARY KEY,  usage_count INTEGER DEFAULT 1,  first_seen TIMESTAMP DEFAULT NOW(),  last_seen TIMESTAMP DEFAULT NOW() ); CREATE INDEX idx_topics_count ON topics(usage_count DESC); -- Update conversations table ALTER TABLE conversations ADD COLUMN topics TEXT[] DEFAULT '{}'; CREATE INDEX idx_conversations_topics ON conversations USING GIN(topics);`

## 2.4 Feature: Conversation Relationship Mapping

**Priority**: Medium  
**Estimated Effort**: 4-5 days  
**Dependencies**: Vector embeddings

## 2.4.1 Functional Requirements

**FR-2.4.1**: System shall detect related conversations based on semantic similarity (threshold: 0.8).paste.txt​

**FR-2.4.2**: Relationships shall be typed: `builds_on`, `solves_same_problem`, `references`, `contradicts`.

**FR-2.4.3**: API endpoint shall return conversation graph with related conversations (max depth: 2).

**FR-2.4.4**: System shall detect problem-solution pairs and tag accordingly.

## 2.4.2 Technical Implementation

**SQL Schema**:

sql

`CREATE TABLE conversation_relationships (   source_conversation_id UUID REFERENCES conversations(id),  related_conversation_id UUID REFERENCES conversations(id),  relationship_type TEXT NOT NULL,  similarity_score REAL,  detected_at TIMESTAMP DEFAULT NOW(),  PRIMARY KEY (source_conversation_id, related_conversation_id) ); CREATE INDEX idx_relationships_source ON conversation_relationships(source_conversation_id); CREATE INDEX idx_relationships_type ON conversation_relationships(relationship_type);`

**File**: `src/relationship-mapper.ts` (new)

typescript

`export class RelationshipMapper {   async findRelatedConversations(conversationId: string, threshold: number = 0.8) {    // Get conversation embedding    const sourceEmbedding = await qdrant.retrieve('prompts', [conversationId]);         // Search for similar conversations    const similar = await qdrant.search('prompts', {      vector: sourceEmbedding[0].vector,      limit: 20,      score_threshold: threshold,      filter: {        must_not: [{ key: 'conversation_id', match: { value: conversationId } }]      }    });         // Classify relationships    const relationships = [];    for (const match of similar) {      const type = await this.classifyRelationship(        conversationId,        match.id,        match.score      );      relationships.push({ id: match.id, type, score: match.score });    }         // Store in database    await db.storeRelationships(conversationId, relationships);         return relationships;  }     async classifyRelationship(sourceId: string, targetId: string, similarity: number): Promise<string> {    const source = await db.getConversation(sourceId);    const target = await db.getConversation(targetId);         // Simple heuristics (can be enhanced with LLM classification)    if (source.project_name === target.project_name) {      if (source.created_at < target.created_at) return 'builds_on';    }         if (this.isProblemSolutionPair(source, target)) return 'solves_same_problem';         if (similarity > 0.9) return 'near_duplicate';         return 'related';  }     isProblemSolutionPair(conv1: Conversation, conv2: Conversation): boolean {    // Detect if both conversations address similar errors/problems    const errorKeywords = ['error', 'issue', 'problem', 'bug', 'failed', 'broken'];    const conv1HasError = errorKeywords.some(kw => conv1.user_prompt.toLowerCase().includes(kw));    const conv2HasError = errorKeywords.some(kw => conv2.user_prompt.toLowerCase().includes(kw));         return conv1HasError && conv2HasError;  } }`

## 2.5 Feature: MCP Server Integration

**Priority**: High  
**Estimated Effort**: 5-7 days  
**Dependencies**: Phase 2.1-2.4 complete

## 2.5.1 Functional Requirements

**FR-2.5.1**: MCP server shall expose natural language query interface for conversation search.paste.txt​

**FR-2.5.2**: Server shall support Claude/LLM-native queries like "Show me all prompts about Docker configuration".

**FR-2.5.3**: MCP shall translate natural language filters into PostgreSQL + Qdrant queries.

**FR-2.5.4**: Results shall be formatted for LLM consumption (markdown with citations).

## 2.5.2 MCP Server Spec

**File**: `mcp-server/server.ts` (new directory)

typescript

``import { Server } from '@modelcontextprotocol/sdk/server/index.js'; import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'; import { Database } from '../src/database'; import { EmbeddingService } from '../src/embedding-service'; const server = new Server({   name: 'prompt-harvester',  version: '1.0.0' }, {   capabilities: {    tools: {}  } }); // Tool: Search conversations server.setRequestHandler('tools/call', async (request) => {   if (request.params.name === 'search_conversations') {    const { query, filters } = request.params.arguments;         // Parse natural language query    const parsedFilters = await parseNaturalLanguageQuery(query, filters);         // Execute hybrid search    const results = await hybridSearch(query, parsedFilters, 10);         // Format for LLM    const formatted = results.map(r => ` **Conversation ${r.id.substring(0, 8)}** (${r.platform}, ${r.created_at}) - Project: ${r.project_name} - User: ${r.user_prompt.substring(0, 200)}... - Similarity: ${(r.similarity_score * 100).toFixed(1)}%     `).join('\n---\n');         return { content: [{ type: 'text', text: formatted }] };  }     if (request.params.name === 'get_conversation_context') {    const { conversation_id } = request.params.arguments;         // Get conversation + related conversations    const conv = await db.getConversation(conversation_id);    const related = await db.getRelatedConversations(conversation_id);         return { content: [{      type: 'text',      text: formatConversationWithContext(conv, related)    }] };  } }); // Register tools server.setRequestHandler('tools/list', async () => {   return {    tools: [      {        name: 'search_conversations',        description: 'Search through all AI conversation history using natural language',        inputSchema: {          type: 'object',          properties: {            query: { type: 'string', description: 'Natural language search query' },            filters: {              type: 'object',              properties: {                project: { type: 'string' },                platform: { type: 'string' },                date_range: { type: 'string' }              }            }          },          required: ['query']        }      },      {        name: 'get_conversation_context',        description: 'Get full conversation details with related conversations',        inputSchema: {          type: 'object',          properties: {            conversation_id: { type: 'string' }          },          required: ['conversation_id']        }      },      {        name: 'get_prompt_templates',        description: 'Extract reusable prompt patterns for a topic or project',        inputSchema: {          type: 'object',          properties: {            topic: { type: 'string' },            min_occurrences: { type: 'number', default: 3 }          }        }      }    ]  }; }); const transport = new StdioServerTransport(); await server.connect(transport);``

**Claude Configuration** (`~/.config/claude/mcp_config.json`):

json

`{   "mcpServers": {    "prompt-harvester": {      "command": "bun",      "args": ["run", "/path/to/prompt-harvester/mcp-server/server.ts"]    }  } }`

## 3. Phase 3: Analytics & User Experience

## 3.1 Feature: Web Dashboard (Svelte)

**Priority**: High  
**Estimated Effort**: 8-10 days  
**Dependencies**: Phase 2 complete

## 3.1.1 Functional Requirements

**FR-3.1.1**: Dashboard shall display conversation timeline with filtering (project, platform, date).

**FR-3.1.2**: Search interface shall support semantic, full-text, and hybrid modes.paste.txt​

**FR-3.1.3**: Conversation view shall show full prompt, response (truncated if > 50KB), and related conversations.

**FR-3.1.4**: Analytics page shall display: token usage over time, top topics, platform distribution, problem recurrence heat map.

**FR-3.1.5**: Export functionality shall generate Markdown/JSON exports of filtered conversations.

## 3.1.2 Tech Stack

- **Framework**: SvelteKit
    
- **UI**: Tailwind CSS + shadcn-svelte
    
- **Charts**: Chart.js or D3.js
    
- **State**: Svelte stores
    
- **API Client**: Fetch API with typed interfaces
    

## 3.1.3 Page Structure

text

`/dashboard   /conversations       - Timeline view with infinite scroll  /search              - Advanced search interface  /conversation/:id    - Detail view with related conversations  /analytics           - Usage statistics and trends  /topics              - Topic cloud with filtering  /projects            - Project-based organization  /export              - Export and backup interface`

## 3.1.4 Key Components

**ConversationCard.svelte**:

text

`<script lang="ts">   export let conversation: Conversation;  export let showRelated: boolean = false; </script> <div class="card">   <div class="header">    <span class="platform-badge">{conversation.platform}</span>    <span class="project">{conversation.project_name}</span>    <time>{new Date(conversation.created_at).toLocaleString()}</time>  </div>     <div class="prompt">    <strong>User:</strong>    <p>{conversation.user_prompt}</p>  </div>     <div class="response">    <strong>Assistant:</strong>    <p>{conversation.response_text || conversation.response_summary}</p>    {#if conversation.response_url}      <a href={conversation.response_url} target="_blank">View Full Response</a>    {/if}  </div>     {#if showRelated && conversation.related_count > 0}    <div class="related">      <button on:click={() => loadRelated(conversation.id)}>        View {conversation.related_count} Related Conversations      </button>    </div>  {/if}     <div class="topics">    {#each conversation.topics as topic}      <span class="topic-tag">{topic}</span>    {/each}  </div> </div>`

**SearchInterface.svelte**:

text

``<script lang="ts">   import { onMount } from 'svelte';     let query = '';  let mode: 'semantic' | 'fulltext' | 'hybrid' = 'hybrid';  let filters = { project: '', platform: '', dateRange: '' };  let results: Conversation[] = [];  let loading = false;     async function search() {    loading = true;    const endpoint = `/api/search/${mode}`;    const response = await fetch(endpoint, {      method: 'POST',      headers: { 'Content-Type': 'application/json' },      body: JSON.stringify({ query, filters, limit: 50 })    });    results = await response.json().then(r => r.results);    loading = false;  } </script> <div class="search-container">   <div class="search-bar">    <input      type="text"      bind:value={query}      placeholder="Search your AI conversations..."      on:keypress={(e) => e.key === 'Enter' && search()}    />    <button on:click={search}>Search</button>  </div>     <div class="filters">    <select bind:value={mode}>      <option value="hybrid">Hybrid (Recommended)</option>      <option value="semantic">Semantic</option>      <option value="fulltext">Full-Text</option>    </select>         <input type="text" bind:value={filters.project} placeholder="Project" />    <select bind:value={filters.platform}>      <option value="">All Platforms</option>      <option value="claude-code">Claude Code</option>      <option value="openai">OpenAI</option>      <option value="gemini">Gemini</option>    </select>  </div>     {#if loading}    <div class="loading">Searching...</div>  {:else}    <div class="results">      {#each results as conversation}        <ConversationCard {conversation} showRelated={true} />      {/each}    </div>  {/if} </div>``

## 3.2 Feature: Analytics Dashboard

**Priority**: Medium  
**Estimated Effort**: 4-5 days  
**Dependencies**: Phase 2 NLP complete

## 3.2.1 Functional Requirements

**FR-3.2.1**: Display token usage trends (daily/weekly/monthly) by platform and project.paste.txt​

**FR-3.2.2**: Show top 20 topics with usage counts and trend indicators (↑↓).

**FR-3.2.3**: Platform distribution pie chart (conversations per platform).

**FR-3.2.4**: Problem recurrence heat map (identify repeated issues).

**FR-3.2.5**: Prompt effectiveness metrics (conversations leading to successful solutions).

## 3.2.2 SQL Views for Analytics

sql

`-- Token usage over time CREATE VIEW token_usage_daily AS SELECT    DATE(created_at) as date,  platform,  project_name,  SUM(token_count) as total_tokens,  COUNT(*) as conversation_count FROM conversations GROUP BY DATE(created_at), platform, project_name ORDER BY date DESC; -- Top topics trending CREATE VIEW trending_topics AS SELECT    topic_name,  usage_count,  last_seen,  (SELECT COUNT(*) FROM conversations c WHERE topic_name = ANY(c.topics) AND c.created_at > NOW() - INTERVAL '7 days') as recent_count FROM topics ORDER BY usage_count DESC LIMIT 50; -- Problem recurrence detection CREATE VIEW recurring_problems AS SELECT    t.topic_name,  COUNT(c.id) as occurrence_count,  ARRAY_AGG(c.id ORDER BY c.created_at DESC) as conversation_ids,  MAX(c.created_at) as last_occurrence FROM topics t JOIN conversations c ON t.topic_name = ANY(c.topics) WHERE c.user_prompt ILIKE '%error%' OR c.user_prompt ILIKE '%issue%' GROUP BY t.topic_name HAVING COUNT(c.id) >= 3 ORDER BY occurrence_count DESC;`

## 3.3 Feature: Prompt Template Extraction

**Priority**: Medium  
**Estimated Effort**: 5-6 days  
**Dependencies**: Phase 2 relationship mapping

## 3.3.1 Functional Requirements

**FR-3.3.1**: System shall detect reusable prompt patterns occurring 3+ times.paste.txt​

**FR-3.3.2**: Templates shall be parameterized (e.g., "Create a {language} function to {task}").

**FR-3.3.3**: UI shall display template library with usage examples.

**FR-3.3.4**: Users shall rate template effectiveness (1-5 stars).

## 3.3.2 Technical Implementation

**File**: `src/template-extractor.ts` (new)

typescript

`export class TemplateExtractor {   async extractTemplates(minOccurrences: number = 3): Promise<Template[]> {    // Find similar prompts using embeddings    const conversations = await db.getAllConversations();    const clusters = await this.clusterSimilarPrompts(conversations);         const templates = [];    for (const cluster of clusters) {      if (cluster.members.length < minOccurrences) continue;             // Extract common structure      const template = this.extractCommonPattern(cluster.members);      templates.push({        pattern: template,        occurrences: cluster.members.length,        examples: cluster.members.slice(0, 3),        effectiveness_score: await this.calculateEffectiveness(cluster.members)      });    }         return templates.sort((a, b) => b.occurrences - a.occurrences);  }     extractCommonPattern(prompts: string[]): string {    // Simple pattern extraction using longest common substring    // Enhanced version would use sequence alignment algorithms    const tokens = prompts.map(p => p.split(' '));    const commonSequences = this.findCommonSequences(tokens);         // Parameterize variable parts    return this.parameterize(commonSequences);  }     async calculateEffectiveness(conversations: Conversation[]): Promise<number> {    // Measure: Did the response solve the problem?    // Heuristic: No follow-up conversation on same topic within 24h = success    let successCount = 0;         for (const conv of conversations) {      const followUps = await db.findFollowUpConversations(conv.id, 24 * 60 * 60);      if (followUps.length === 0) successCount++;    }         return successCount / conversations.length;  } }`

**SQL Schema**:

sql

`CREATE TABLE prompt_templates (   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  pattern TEXT NOT NULL,  parameterized_pattern TEXT,  occurrence_count INTEGER,  effectiveness_score REAL,  category TEXT,  created_at TIMESTAMP DEFAULT NOW(),  updated_at TIMESTAMP DEFAULT NOW() ); CREATE TABLE template_examples (   template_id UUID REFERENCES prompt_templates(id),  conversation_id UUID REFERENCES conversations(id),  PRIMARY KEY (template_id, conversation_id) ); CREATE TABLE template_ratings (   template_id UUID REFERENCES prompt_templates(id),  user_id TEXT, -- Anonymous user identifier  rating INTEGER CHECK (rating BETWEEN 1 AND 5),  feedback TEXT,  rated_at TIMESTAMP DEFAULT NOW(),  PRIMARY KEY (template_id, user_id) );`

## 3.4 Feature: Export & Sharing

**Priority**: Low  
**Estimated Effort**: 3-4 days  
**Dependencies**: None

## 3.4.1 Functional Requirements

**FR-3.4.1**: Export conversations to Markdown with frontmatter metadata.

**FR-3.4.2**: Export to JSON for programmatic access.

**FR-3.4.3**: Generate project knowledge base (all conversations organized by topic).

**FR-3.4.4**: Share individual conversations via expiring links (optional).

## 3.4.2 API Endpoints

**GET /api/export/markdown/:project**

typescript

``router.get('/api/export/markdown/:project', async (c) => {   const { project } = c.req.param();  const conversations = await db.getConversationsByProject(project);     let markdown = `---\nproject: ${project}\nexported: ${new Date().toISOString()}\ntotal_conversations: ${conversations.length}\n---\n\n`;  markdown += `# ${project} - AI Conversation Archive\n\n`;     // Group by topic  const byTopic = groupByTopic(conversations);     for (const [topic, convs] of Object.entries(byTopic)) {    markdown += `## ${topic}\n\n`;    for (const conv of convs) {      markdown += `### ${conv.created_at} (${conv.platform})\n\n`;      markdown += `**User:**\n${conv.user_prompt}\n\n`;      markdown += `**Assistant:**\n${conv.response_text || conv.response_summary}\n\n`;      markdown += `---\n\n`;    }  }     c.header('Content-Type', 'text/markdown');  c.header('Content-Disposition', `attachment; filename="${project}-export.md"`);  return c.body(markdown); });``

## 4. Implementation Roadmap

## 4.1 Phase 2 Timeline (Intelligence Layer)

|Week|Focus|Deliverables|
|---|---|---|
|1|Embedding Service|`embedding-service.ts`, Qdrant integration, batch processing|
|2|Semantic Search|Hybrid search endpoints, ranking algorithms|
|3|NLP Processing|Topic extraction, keyword analysis, metadata enhancement|
|4|Relationship Mapping|Conversation graph, problem-solution detection|
|5|MCP Integration|MCP server, tool definitions, Claude integration|

**Total Effort**: 5 weeks (solo developer)

## 4.2 Phase 3 Timeline (Analytics & UX)

|Week|Focus|Deliverables|
|---|---|---|
|6-7|Svelte Dashboard|Base layout, conversation timeline, search interface|
|8|Analytics|Token usage charts, topic trends, heatmaps|
|9|Prompt Templates|Template extraction, library UI, rating system|
|10|Export & Polish|Markdown/JSON export, sharing, final testing|

**Total Effort**: 5 weeks (solo developer)

**Combined Timeline**: 10 weeks for complete Phase 2 & 3 implementation.

## 5. Technical Stack Summary

|Component|Technology|Justification|
|---|---|---|
|**Embeddings**|OpenAI `text-embedding-3-small` OR local `all-MiniLM-L6-v2`|Industry standard, 1536-dim, $0.02/1M tokens paste.txt​|
|**Vector DB**|Qdrant|Fast, self-hosted, excellent Bun support paste.txt​|
|**NLP**|`natural` (Node.js NLP library)|TF-IDF, tokenization, lightweight|
|**Frontend**|SvelteKit + Tailwind|Fast, minimal bundle size, TypeScript support|
|**Charts**|Chart.js|Simple, responsive, wide browser support|
|**MCP SDK**|`@modelcontextprotocol/sdk`|Official Anthropic SDK|

## 6. Success Metrics

## 6.1 Phase 2 KPIs

- **Search Quality**: 90%+ user-reported relevance for semantic search
    
- **Performance**: < 300ms P95 latency for semantic search (10K+ conversations)
    
- **Relationship Accuracy**: 80%+ correct relationship classifications (manual validation)
    
- **Topic Extraction**: 85%+ user agreement with auto-extracted topics
    

## 6.2 Phase 3 KPIs

- **Dashboard Usage**: Daily active usage by Ice-Ninja
    
- **Template Library**: 50+ extracted templates with 70%+ effectiveness scores
    
- **Export Feature**: Monthly export of project knowledge bases
    
- **MCP Integration**: 100+ MCP queries per month via Claude
    

## 7. Storage Impact

## 7.1 Additional Storage Requirements

|Data Type|Size Estimate (1 Year)|
|---|---|
|**Vector Embeddings** (1536-dim float32)|1.0 GB|
|**Topic Metadata**|50 MB|
|**Relationship Graph**|200 MB|
|**Prompt Templates**|10 MB|
|**Analytics Cache**|100 MB|
|**Total Additional**|**1.36 GB**|

**Combined Phase 1 + 2 + 3**: ~16-31 GB/yearpaste.txt​

## 8. Security & Privacy

## 8.1 Data Handling

- **Embeddings**: Generated locally or via OpenAI (ephemeral API calls)
    
- **Vector Storage**: Self-hosted Qdrant (no third-party access)
    
- **Web Dashboard**: localhost-only by default (optional auth for remote access)
    
- **Exports**: Encrypted Markdown files with password protection (optional)
    

## 8.2 API Key Management

bash

`# .env.local OPENAI_API_KEY=sk-... QDRANT_URL=http://localhost:6333 DATABASE_URL=postgresql://localhost/promptharvester R2_ACCOUNT_ID=... R2_ACCESS_KEY=... R2_SECRET_KEY=...`

## 9. Testing Strategy

## 9.1 Unit Tests

- Embedding service: mock OpenAI API, validate vector dimensions
    
- NLP processor: topic extraction accuracy on sample data
    
- Relationship classifier: validate heuristics with known conversation pairs
    

## 9.2 Integration Tests

- End-to-end search flow (query → embedding → Qdrant → PostgreSQL → response)
    
- MCP tool invocation from Claude Desktop
    
- Export generation and validation
    

## 9.3 Performance Tests

- Load test: 100K conversations in database
    
- Concurrent search: 10 simultaneous semantic searches
    
- Embedding batch processing: measure throughput
    

## 10. Documentation Deliverables

1. **Phase 2 Setup Guide** (`PHASE2_SETUP.md`)
    
    - Qdrant installation
        
    - OpenAI API configuration
        
    - Embedding batch processing instructions
        
    - MCP server integration steps
        
2. **Dashboard User Guide** (`DASHBOARD_USAGE.md`)
    
    - Search interface tutorial
        
    - Analytics interpretation
        
    - Template library usage
        
    - Export workflows
        
3. **API Documentation** (`API_REFERENCE.md`)
    
    - All Phase 2/3 endpoints
        
    - Request/response schemas
        
    - Authentication (if added)
        
    - Rate limiting
        
4. **Troubleshooting Guide** (`TROUBLESHOOTING.md`)
    
    - Common embedding errors
        
    - Qdrant connection issues
        
    - Performance optimization tips
        

## 11. Acceptance Criteria

## Phase 2 Complete When:

- ✅ 100% of existing conversations have embeddings
    
- ✅ Semantic search returns relevant results (90%+ user satisfaction)
    
- ✅ MCP integration works in Claude Desktop
    
- ✅ Topic extraction runs automatically on new conversations
    
- ✅ Relationship graph contains 1000+ detected relationships
    

## Phase 3 Complete When:

- ✅ Dashboard loads all conversations with infinite scroll
    
- ✅ Analytics page displays real-time token usage trends
    
- ✅ 50+ prompt templates extracted and rated
    
- ✅ Export functionality generates valid Markdown/JSON
    
- ✅ Ice-Ninja successfully uses MCP search daily
    

## 12. Future Enhancements (Phase 4+)

- **AI-Generated Summaries**: Use local LLM to summarize long conversations
    
- **Voice Interface**: Speak queries, hear results via TTS
    
- **Mobile App**: iOS/Android with sync
    
- **Team Collaboration**: Share prompt libraries across team
    
- **RAG Integration**: Use conversation history as context for new queries
    
- **Fine-Tuned Search Model**: Train custom embedding model on your conversation style
    
- **Automated Problem Detection**: Alert when same error appears 3+ times
    

---

## Appendix A: File Structure (Post-Phase 2 & 3)

text

`prompt-harvester/ ├── api-server.ts (updated) ├── claude-code-parser.ts ├── schema.sql (updated with new tables) ├── package.json (updated deps) ├── src/ │   ├── embedding-service.ts (new) │   ├── nlp-processor.ts (new) │   ├── relationship-mapper.ts (new) │   ├── template-extractor.ts (new) │   └── database.ts (updated) ├── mcp-server/ │   ├── server.ts (new) │   └── tools.ts (new) ├── dashboard/ (new - SvelteKit app) │   ├── src/ │   │   ├── routes/ │   │   │   ├── +page.svelte (home) │   │   │   ├── search/+page.svelte │   │   │   ├── conversation/[id]/+page.svelte │   │   │   ├── analytics/+page.svelte │   │   │   └── templates/+page.svelte │   │   ├── lib/ │   │   │   ├── components/ │   │   │   │   ├── ConversationCard.svelte │   │   │   │   ├── SearchInterface.svelte │   │   │   │   └── AnalyticsChart.svelte │   │   │   └── api.ts │   │   └── app.html │   ├── static/ │   ├── svelte.config.js │   └── package.json ├── docs/ │   ├── PHASE2_SETUP.md (new) │   ├── DASHBOARD_USAGE.md (new) │   ├── API_REFERENCE.md (updated) │   └── TROUBLESHOOTING.md (updated) ├── README.md (updated) └── .env.local (add OpenAI key)`

---

**Status**: READY FOR IMPLEMENTATION  
**Next Action**: `bun install` updated dependencies, configure `.env.local`, start with Phase 2.1 (Embedding Service)

Lil' Gimpy has delivered the complete Phase 2 & 3 enhancement PRD! 🎉










---

date: 2025-11-18 08:59:47 PST  
ver: 2.0.0  
author: lil' Gimpy  
model: claude-sonnet-4-20250514  
tags: [prd-addendum, phase-4-polish, phase-5-future, advanced-features, automation, enterprise-features]

---

# PRD Addendum: Phase 4 Polish & Phase 5 Future Enhancements

## Extension to Phase 2 & 3 Enhancement PRD

This addendum details the implementation requirements for **Phase 4 (Polish)** and **Phase 5+ (Future Enhancements)** as outlined in the original README roadmap.paste.txt​

---

## Phase 4: Polish & Production Hardening (Month 4)

## 4.1 Feature: Production-Grade Web Dashboard (Svelte)

**Priority**: Critical  
**Estimated Effort**: 10-12 days  
**Dependencies**: Phase 2 & 3 complete

## 4.1.1 Functional Requirements

**FR-4.1.1**: Dashboard shall implement infinite scroll pagination for conversation timeline (virtualized rendering for 100K+ conversations).

**FR-4.1.2**: Advanced filter panel shall support:

- Multi-select project filtering
    
- Platform checkbox filtering
    
- Date range picker (preset ranges: Today, Last 7 Days, Last 30 Days, Custom)
    
- Topic tag filtering with autocomplete
    
- Similarity threshold slider for semantic search
    
- Token count range filter
    

**FR-4.1.3**: Conversation detail view shall display:

- Full conversation thread with syntax-highlighted code blocks
    
- Related conversations graph (interactive D3.js visualization)
    
- Edit capabilities for tags and project assignment
    
- Export single conversation to Markdown/JSON
    
- Quality rating interface (1-5 stars)
    

**FR-4.1.4**: Keyboard shortcuts shall be implemented:

- `Cmd+K` / `Ctrl+K`: Focus search bar
    
- `Cmd+N` / `Ctrl+N`: New search
    
- `Cmd+E` / `Ctrl+E`: Export filtered results
    
- Arrow keys: Navigate between conversations
    
- `Esc`: Clear filters
    

**FR-4.1.5**: Dark mode toggle with system preference detection.paste.txt​

## 4.1.2 Technical Implementation

**File Structure**:

text

`dashboard/ ├── src/ │   ├── routes/ │   │   ├── +layout.svelte (nav, theme provider) │   │   ├── +page.svelte (home/timeline) │   │   ├── search/ │   │   │   ├── +page.svelte (advanced search) │   │   │   └── +page.server.ts (SSR search) │   │   ├── conversation/[id]/ │   │   │   ├── +page.svelte (detail view) │   │   │   └── +page.ts (load conversation + related) │   │   ├── analytics/ │   │   │   ├── +page.svelte (charts dashboard) │   │   │   └── +page.server.ts (aggregate stats) │   │   ├── templates/ │   │   │   ├── +page.svelte (template library) │   │   │   └── +page.server.ts (load templates) │   │   └── settings/ │   │       └── +page.svelte (user preferences) │   ├── lib/ │   │   ├── components/ │   │   │   ├── ConversationCard.svelte │   │   │   ├── SearchBar.svelte │   │   │   ├── FilterPanel.svelte │   │   │   ├── RelationshipGraph.svelte (D3.js) │   │   │   ├── AnalyticsChart.svelte (Chart.js) │   │   │   ├── CodeBlock.svelte (syntax highlighting) │   │   │   ├── InfiniteScroll.svelte (virtualization) │   │   │   └── ExportModal.svelte │   │   ├── stores/ │   │   │   ├── conversations.ts (Svelte store) │   │   │   ├── filters.ts (filter state) │   │   │   └── theme.ts (dark mode) │   │   ├── api/ │   │   │   └── client.ts (typed API client) │   │   └── utils/ │   │       ├── formatters.ts (date, token count) │   │       └── shortcuts.ts (keyboard handling) │   ├── app.css (Tailwind imports) │   └── app.html ├── static/ │   ├── favicon.ico │   └── logo.svg ├── svelte.config.js ├── tailwind.config.js ├── vite.config.ts └── package.json`

**Key Component: RelationshipGraph.svelte**:

text

`<script lang="ts">   import { onMount } from 'svelte';  import * as d3 from 'd3';     export let conversationId: string;  export let relationships: Relationship[];     let graphContainer: HTMLDivElement;     onMount(() => {    const nodes = [      { id: conversationId, label: 'Current', type: 'current' },      ...relationships.map(r => ({        id: r.related_conversation_id,        label: r.project_name,        type: r.relationship_type      }))    ];         const links = relationships.map(r => ({      source: conversationId,      target: r.related_conversation_id,      type: r.relationship_type,      score: r.similarity_score    }));         // D3.js force-directed graph    const simulation = d3.forceSimulation(nodes)      .force('link', d3.forceLink(links).id(d => d.id).distance(100))      .force('charge', d3.forceManyBody().strength(-400))      .force('center', d3.forceCenter(300, 200));         const svg = d3.select(graphContainer)      .append('svg')      .attr('width', 600)      .attr('height', 400);         // Render links    const link = svg.append('g')      .selectAll('line')      .data(links)      .join('line')      .attr('stroke', d => getRelationshipColor(d.type))      .attr('stroke-width', d => d.score * 3);         // Render nodes    const node = svg.append('g')      .selectAll('circle')      .data(nodes)      .join('circle')      .attr('r', d => d.type === 'current' ? 12 : 8)      .attr('fill', d => d.type === 'current' ? '#3b82f6' : '#94a3b8')      .call(drag(simulation));         // Labels    const labels = svg.append('g')      .selectAll('text')      .data(nodes)      .join('text')      .text(d => d.label)      .attr('font-size', 10)      .attr('dx', 15)      .attr('dy', 4);         simulation.on('tick', () => {      link        .attr('x1', d => d.source.x)        .attr('y1', d => d.source.y)        .attr('x2', d => d.target.x)        .attr('y2', d => d.target.y);             node        .attr('cx', d => d.x)        .attr('cy', d => d.y);             labels        .attr('x', d => d.x)        .attr('y', d => d.y);    });  });     function getRelationshipColor(type: string): string {    const colors = {      builds_on: '#10b981',      solves_same_problem: '#f59e0b',      references: '#6366f1',      contradicts: '#ef4444',      related: '#94a3b8'    };    return colors[type] || colors.related;  } </script> <div bind:this={graphContainer} class="relationship-graph"></div> <div class="legend">   <span class="legend-item">    <span class="dot" style="background: #10b981"></span> Builds On  </span>  <span class="legend-item">    <span class="dot" style="background: #f59e0b"></span> Solves Same Problem  </span>  <span class="legend-item">    <span class="dot" style="background: #ef4444"></span> Contradicts  </span> </div>`

## 4.1.3 Performance Optimization

**Virtual Scrolling for Timeline**:

typescript

`// lib/components/InfiniteScroll.svelte import { onMount } from 'svelte'; import { VirtualList } from 'svelte-virtual-list-ce'; export let items: Conversation[]; export let loadMore: () => Promise<void>; let scrollContainer: HTMLElement; let loading = false; async function handleScroll() {   const { scrollTop, scrollHeight, clientHeight } = scrollContainer;     if (scrollTop + clientHeight >= scrollHeight - 200 && !loading) {    loading = true;    await loadMore();    loading = false;  } }`

**Debounced Search**:

typescript

`// lib/utils/debounce.ts export function debounce<T extends (...args: any[]) => any>(   func: T,  wait: number ): (...args: Parameters<T>) => void {   let timeout: NodeJS.Timeout;  return (...args: Parameters<T>) => {    clearTimeout(timeout);    timeout = setTimeout(() => func(...args), wait);  }; } // Usage in SearchBar.svelte const debouncedSearch = debounce(search, 300);`

## 4.1.4 Non-Functional Requirements

**NFR-4.1.1**: Timeline shall load initial 50 conversations in < 1 second.

**NFR-4.1.2**: Search results shall appear within 500ms for semantic queries.

**NFR-4.1.3**: Dashboard shall support 100K+ conversations without performance degradation (virtualized rendering).

**NFR-4.1.4**: Dark mode transition shall be smooth (CSS transitions, no flicker).

## 4.2 Feature: Advanced Export & Backup System

**Priority**: High  
**Estimated Effort**: 4-5 days  
**Dependencies**: Phase 3 export functionality

## 4.2.1 Functional Requirements

**FR-4.2.1**: Export wizard shall support multiple formats:

- **Markdown**: Single file with TOC, organized by project/date
    
- **JSON**: Machine-readable with full metadata
    
- **CSV**: Spreadsheet-compatible for analysis
    
- **SQLite**: Portable database export
    
- **Obsidian Vault**: Markdown files with backlinks
    

**FR-4.2.2**: Scheduled backups shall run automatically:

- Daily incremental backups to configured location
    
- Weekly full backups
    
- Retention policy (keep last 7 daily, 4 weekly, 12 monthly)
    

**FR-4.2.3**: Export filters shall match dashboard filters (project, date range, tags).

**FR-4.2.4**: Large exports (> 1000 conversations) shall stream to disk to avoid memory limits.

## 4.2.2 Technical Implementation

**File**: `src/export-service.ts` (new)

typescript

``import { createWriteStream } from 'fs'; import { pipeline } from 'stream/promises'; import { Database } from './database'; import archiver from 'archiver'; export class ExportService {   private db: Database;     constructor() {    this.db = new Database();  }     async exportMarkdown(filters: ExportFilters, outputPath: string) {    const conversations = await this.db.getConversations(filters);    const stream = createWriteStream(outputPath);         // Write frontmatter    stream.write(`---\n`);    stream.write(`title: Prompt Harvester Export\n`);    stream.write(`exported: ${new Date().toISOString()}\n`);    stream.write(`total_conversations: ${conversations.length}\n`);    stream.write(`filters: ${JSON.stringify(filters)}\n`);    stream.write(`---\n\n`);         // Generate TOC    stream.write(`# Table of Contents\n\n`);    const projects = [...new Set(conversations.map(c => c.project_name))];    projects.forEach(project => {      stream.write(`- [${project}](#${this.slugify(project)})\n`);    });    stream.write(`\n---\n\n`);         // Write conversations grouped by project    for (const project of projects) {      stream.write(`# ${project}\n\n`);      const projectConvs = conversations.filter(c => c.project_name === project);             for (const conv of projectConvs) {        stream.write(`## ${conv.created_at} (${conv.platform})\n\n`);        stream.write(`**User:**\n\`\`\`\n${conv.user_prompt}\n\`\`\`\n\n`);        stream.write(`**Assistant:**\n${conv.response_text || conv.response_summary}\n\n`);        if (conv.topics?.length) {          stream.write(`**Topics:** ${conv.topics.join(', ')}\n\n`);        }        stream.write(`---\n\n`);      }    }         stream.end();  }     async exportObsidian(filters: ExportFilters, vaultPath: string) {    const conversations = await this.db.getConversations(filters);         for (const conv of conversations) {      const filename = `${vaultPath}/${conv.project_name}/${conv.id.substring(0, 8)}.md`;      const content = this.formatObsidianNote(conv);      await Bun.write(filename, content);    }         // Create index file with backlinks    const indexContent = this.generateObsidianIndex(conversations);    await Bun.write(`${vaultPath}/Index.md`, indexContent);  }     formatObsidianNote(conv: Conversation): string {    let note = `---\n`;    note += `id: ${conv.id}\n`;    note += `project: [[${conv.project_name}]]\n`;    note += `platform: ${conv.platform}\n`;    note += `date: ${conv.created_at}\n`;    note += `tags: ${conv.topics?.map(t => `#${t}`).join(' ')}\n`;    note += `---\n\n`;    note += `# Conversation ${conv.id.substring(0, 8)}\n\n`;    note += `## User Prompt\n${conv.user_prompt}\n\n`;    note += `## Response\n${conv.response_text || conv.response_summary}\n\n`;         // Add backlinks to related conversations    const related = await this.db.getRelatedConversations(conv.id);    if (related.length) {      note += `## Related Conversations\n`;      related.forEach(r => {        note += `- [[${r.id.substring(0, 8)}]] (${r.relationship_type})\n`;      });    }         return note;  }     async scheduleBackup(schedule: 'daily' | 'weekly') {    const backupPath = process.env.BACKUP_PATH || './backups';    const timestamp = new Date().toISOString().split('T')[0];    const filename = `${backupPath}/backup-${schedule}-${timestamp}.zip`;         const output = createWriteStream(filename);    const archive = archiver('zip', { zlib: { level: 9 } });         archive.pipe(output);         // Export all conversations as JSON    const conversations = await this.db.getAllConversations();    archive.append(JSON.stringify(conversations, null, 2), { name: 'conversations.json' });         // Export database schema    const schema = await Bun.file('./schema.sql').text();    archive.append(schema, { name: 'schema.sql' });         // Export embeddings metadata    const embeddings = await this.db.getEmbeddingStats();    archive.append(JSON.stringify(embeddings, null, 2), { name: 'embeddings.json' });         await archive.finalize();         // Cleanup old backups based on retention policy    await this.cleanupOldBackups(schedule);  }     private slugify(text: string): string {    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-');  } }``

**API Endpoint**:

typescript

``router.post('/api/export', async (c) => {   const { format, filters } = await c.req.json();  const exportService = new ExportService();  const filename = `export-${Date.now()}.${format}`;  const outputPath = `/tmp/${filename}`;     switch (format) {    case 'markdown':      await exportService.exportMarkdown(filters, outputPath);      break;    case 'json':      await exportService.exportJSON(filters, outputPath);      break;    case 'obsidian':      await exportService.exportObsidian(filters, outputPath);      break;  }     // Stream file to user  const file = Bun.file(outputPath);  c.header('Content-Type', 'application/octet-stream');  c.header('Content-Disposition', `attachment; filename="${filename}"`);  return c.body(file.stream()); });``

## 4.3 Feature: Statistics & Analytics Enhancement

**Priority**: Medium  
**Estimated Effort**: 3-4 days  
**Dependencies**: Phase 3 analytics

## 4.3.1 Functional Requirements

**FR-4.3.1**: Analytics dashboard shall display real-time metrics (updated every 30 seconds).

**FR-4.3.2**: Historical trend charts shall support custom date ranges.

**FR-4.3.3**: Comparative analytics shall show platform usage breakdown (pie chart).

**FR-4.3.4**: Problem recurrence heat map shall highlight repeated issues by project.

**FR-4.3.5**: Prompt effectiveness metrics shall show success rate by template.

## 4.3.2 SQL Views Enhancement

sql

`-- Enhanced token usage view with rolling averages CREATE VIEW token_usage_trends AS SELECT    date,  platform,  total_tokens,  conversation_count,  AVG(total_tokens) OVER (    PARTITION BY platform    ORDER BY date    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW  ) as tokens_7day_avg,  AVG(conversation_count) OVER (    PARTITION BY platform    ORDER BY date    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW  ) as conversations_7day_avg FROM token_usage_daily ORDER BY date DESC; -- Problem recurrence heat map data CREATE VIEW problem_heat_map AS SELECT    project_name,  DATE_TRUNC('week', created_at) as week,  COUNT(*) as problem_count,  ARRAY_AGG(DISTINCT topic_name) as common_problems FROM conversations c JOIN LATERAL unnest(c.topics) AS topic_name ON TRUE WHERE c.user_prompt ILIKE '%error%'     OR c.user_prompt ILIKE '%issue%'   OR c.user_prompt ILIKE '%problem%' GROUP BY project_name, week ORDER BY week DESC, problem_count DESC; -- Platform efficiency metrics CREATE VIEW platform_efficiency AS SELECT    platform,  COUNT(*) as total_conversations,  AVG(LENGTH(user_prompt)) as avg_prompt_length,  AVG(token_count) as avg_tokens_used,  AVG(    CASE WHEN quality_rating IS NOT NULL    THEN quality_rating ELSE NULL END  ) as avg_quality_rating,  COUNT(*) FILTER (WHERE solved_problem = TRUE) * 100.0 / COUNT(*) as success_rate_pct FROM conversations GROUP BY platform ORDER BY total_conversations DESC;`

## 4.4 Feature: Documentation Site

**Priority**: Medium  
**Estimated Effort**: 5-6 days  
**Dependencies**: None

## 4.4.1 Functional Requirements

**FR-4.4.1**: Documentation site shall be built with static site generator (VitePress or Docusaurus).

**FR-4.4.2**: Site sections:

- Getting Started (installation, quick start)
    
- User Guide (dashboard, search, export)
    
- API Reference (all endpoints with examples)
    
- Architecture (system design, data flow)
    
- Troubleshooting (common issues, FAQs)
    
- Changelog (version history)
    

**FR-4.4.3**: Code examples shall be syntax-highlighted and copy-able.

**FR-4.4.4**: Site shall be deployed to GitHub Pages or Cloudflare Pages.

## 4.4.2 Directory Structure

text

`docs/ ├── .vitepress/ │   ├── config.ts (site config) │   └── theme/ │       └── custom.css ├── index.md (homepage) ├── getting-started/ │   ├── installation.md │   ├── quick-start.md │   └── configuration.md ├── guide/ │   ├── dashboard.md │   ├── search.md │   ├── export.md │   └── mcp-integration.md ├── api/ │   ├── authentication.md │   ├── conversations.md │   ├── search.md │   └── embeddings.md ├── architecture/ │   ├── system-design.md │   ├── database-schema.md │   └── data-flow.md └── troubleshooting/     ├── common-issues.md    └── faq.md`

---

## Phase 5: Future Enhancements (Ongoing)

## 5.1 Feature: AI-Generated Conversation Summaries

**Priority**: High  
**Estimated Effort**: 6-8 days  
**Dependencies**: Local LLM or OpenAI API

## 5.1.1 Functional Requirements

**FR-5.1.1**: System shall generate extractive summaries for conversations > 50KB.paste.txt​

**FR-5.1.2**: Summary generation shall support two modes:

- **Local**: Using Qwen2.5 or DeepSeek via Ollama
    
- **Cloud**: Using OpenAI GPT-4o-mini
    

**FR-5.1.3**: Summaries shall be cached in PostgreSQL to avoid regeneration.

**FR-5.1.4**: Summary quality shall be user-ratable (1-5 stars).

## 5.1.2 Technical Implementation

**File**: `src/summary-service.ts` (new)

typescript

``import { Ollama } from 'ollama'; import { OpenAI } from 'openai'; interface SummaryConfig {   mode: 'local' | 'cloud';  model?: string;  maxLength?: number; } export class SummaryService {   private ollama?: Ollama;  private openai?: OpenAI;  private config: SummaryConfig;     constructor(config: SummaryConfig) {    this.config = config;         if (config.mode === 'local') {      this.ollama = new Ollama({ host: 'http://localhost:11434' });    } else {      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });    }  }     async generateSummary(conversation: Conversation): Promise<string> {    // Check if summary already exists    const cached = await db.getSummary(conversation.id);    if (cached) return cached;         const prompt = this.buildSummaryPrompt(conversation);         let summary: string;    if (this.ollama) {      summary = await this.generateLocalSummary(prompt);    } else {      summary = await this.generateCloudSummary(prompt);    }         // Cache summary    await db.storeSummary(conversation.id, summary);         return summary;  }     private buildSummaryPrompt(conv: Conversation): string {    return `Summarize this AI conversation in 3-5 sentences. Focus on: 1. What the user asked 2. Key information provided 3. Any solutions or decisions made User: ${conv.user_prompt}``

1. [https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/9737283/72c2b344-5577-4714-a812-85a75e010437/paste.txt](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/9737283/72c2b344-5577-4714-a812-85a75e010437/paste.txt)

2. [https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/9737283/72c2b344-5577-4714-a812-85a75e010437/paste.txt](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/9737283/72c2b344-5577-4714-a812-85a75e010437/paste.txt)
