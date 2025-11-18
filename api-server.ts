---
title: Prompt Harvester API Server
date: 2025-11-15 00:00:00 PST
ver: 1.0.0
author: The Telekinetic Carrot
model: claude-sonnet-4-5-20250929
tags: [typescript, hono, bun, api, postgres, vector-database, embeddings, backend]
---

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { Pool } from 'pg'
import { QdrantClient } from '@qdrant/js-client-rest'

/**
 * Prompt Harvester API Server
 * 
 * Receives captured conversations from browser extension and CLI tools,
 * processes them, stores in PostgreSQL and vector database, and provides
 * search APIs.
 */

// Types
interface CapturedMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  conversationId: string
  platform: string
  url?: string
  metadata?: Record<string, any>
  capturedAt: string
}

interface CaptureRequest {
  messages: CapturedMessage[]
  metadata?: Record<string, any>
}

// Initialize database connections
const pg = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'prompt_harvester',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  max: 20
})

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY
})

// Initialize Hono app
const app = new Hono()

// Middleware
app.use('*', logger())
app.use('*', cors({
  origin: ['chrome-extension://*', 'http://localhost:*', 'https://claude.ai', 'https://openai.com'],
  credentials: true
}))

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

/**
 * Main capture endpoint
 * Receives messages from browser extension or other sources
 */
app.post('/api/capture', async (c) => {
  try {
    const body: CaptureRequest = await c.req.json()
    const { messages, metadata } = body
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return c.json({ error: 'No messages provided' }, 400)
    }
    
    console.log(`[Capture] Receiving ${messages.length} messages`)
    
    // Process messages
    const results = await processMessages(messages, metadata)
    
    return c.json({
      success: true,
      processed: results.processed,
      stored: results.stored,
      errors: results.errors
    })
  } catch (error) {
    console.error('[Capture] Error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

/**
 * Search endpoint - semantic search across all messages
 */
app.post('/api/search', async (c) => {
  try {
    const { query, filters, limit = 20 } = await c.req.json()
    
    if (!query) {
      return c.json({ error: 'No search query provided' }, 400)
    }
    
    console.log(`[Search] Query: "${query}", Filters:`, filters)
    
    // Perform semantic search
    const results = await semanticSearch(query, filters, limit)
    
    return c.json({
      success: true,
      results,
      count: results.length
    })
  } catch (error) {
    console.error('[Search] Error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

/**
 * Get conversation by ID
 */
app.get('/api/conversations/:id', async (c) => {
  try {
    const conversationId = c.req.param('id')
    
    const conversation = await getConversation(conversationId)
    
    if (!conversation) {
      return c.json({ error: 'Conversation not found' }, 404)
    }
    
    return c.json({
      success: true,
      conversation
    })
  } catch (error) {
    console.error('[GetConversation] Error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

/**
 * List conversations with filters
 */
app.get('/api/conversations', async (c) => {
  try {
    const project = c.req.query('project')
    const platform = c.req.query('platform')
    const limit = parseInt(c.req.query('limit') || '50')
    const offset = parseInt(c.req.query('offset') || '0')
    
    const conversations = await listConversations({
      project,
      platform,
      limit,
      offset
    })
    
    return c.json({
      success: true,
      conversations,
      count: conversations.length
    })
  } catch (error) {
    console.error('[ListConversations] Error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

/**
 * Get statistics
 */
app.get('/api/stats', async (c) => {
  try {
    const stats = await getStatistics()
    
    return c.json({
      success: true,
      stats
    })
  } catch (error) {
    console.error('[Stats] Error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// ============================================================================
// Processing Functions
// ============================================================================

async function processMessages(messages: CapturedMessage[], metadata?: any) {
  const results = {
    processed: 0,
    stored: 0,
    errors: [] as string[]
  }
  
  // Group messages by conversation
  const conversationMap = new Map<string, CapturedMessage[]>()
  
  for (const message of messages) {
    const convId = message.conversationId
    if (!conversationMap.has(convId)) {
      conversationMap.set(convId, [])
    }
    conversationMap.get(convId)!.push(message)
  }
  
  // Process each conversation
  for (const [conversationId, convMessages] of conversationMap.entries()) {
    try {
      await storeConversation(conversationId, convMessages, metadata)
      results.stored += convMessages.length
    } catch (error) {
      console.error(`[Process] Error storing conversation ${conversationId}:`, error)
      results.errors.push(`Failed to store conversation ${conversationId}`)
    }
    results.processed += convMessages.length
  }
  
  return results
}

async function storeConversation(
  conversationId: string,
  messages: CapturedMessage[],
  metadata?: any
) {
  const client = await pg.connect()
  
  try {
    await client.query('BEGIN')
    
    // Get or create conversation
    const platform = messages[0]?.platform || 'unknown'
    const project = await detectProject(messages)
    const model = metadata?.model || 'unknown'
    
    const convResult = await client.query(`
      INSERT INTO conversations (
        platform, source_id, model, project, started_at, updated_at, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (platform, source_id) 
      DO UPDATE SET 
        updated_at = EXCLUDED.updated_at,
        metadata = conversations.metadata || EXCLUDED.metadata
      RETURNING id
    `, [
      platform,
      conversationId,
      model,
      project,
      messages[0].timestamp,
      messages[messages.length - 1].timestamp,
      JSON.stringify(metadata || {})
    ])
    
    const dbConversationId = convResult.rows[0].id
    
    // Store messages
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      
      // Determine storage strategy
      const contentSize = new Blob([msg.content]).size
      const shouldStore = msg.role === 'user' ? contentSize < 10240 : contentSize < 5120
      
      let content = null
      let contentSummary = null
      let contentTail = null
      let contentLocation = null
      
      if (shouldStore) {
        content = msg.content
      } else {
        // Store in object storage (would use R2 in production)
        contentLocation = await storeInObjectStorage(dbConversationId, msg.content, i)
        
        // Generate summary or extract tail
        if (contentSize > 51200) {
          contentSummary = await generateSummary(msg.content)
          contentTail = extractTail(msg.content, 50)
        } else {
          contentTail = extractTail(msg.content, 100)
        }
      }
      
      // Detect content features
      const hasCode = /```[\s\S]*?```/.test(msg.content)
      const hasMermaid = /```mermaid[\s\S]*?```/.test(msg.content)
      
      await client.query(`
        INSERT INTO messages (
          conversation_id, role, sequence_number, content, content_summary,
          content_tail, content_size, content_location, has_code, has_mermaid,
          timestamp, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (conversation_id, sequence_number) DO NOTHING
      `, [
        dbConversationId,
        msg.role,
        i,
        content,
        contentSummary,
        contentTail,
        contentSize,
        contentLocation,
        hasCode,
        hasMermaid,
        msg.timestamp,
        JSON.stringify(msg.metadata || {})
      ])
      
      // Extract and store topics
      const topics = await extractTopics(msg.content)
      for (const topic of topics) {
        await storeMessageTopic(client, dbConversationId, i, topic)
      }
    }
    
    // Update conversation statistics
    await client.query(`
      UPDATE conversations SET
        message_count = (SELECT COUNT(*) FROM messages WHERE conversation_id = $1),
        total_size_bytes = (SELECT SUM(content_size) FROM messages WHERE conversation_id = $1)
      WHERE id = $1
    `, [dbConversationId])
    
    await client.query('COMMIT')
    
    // Queue for embedding generation (async)
    queueForEmbedding(dbConversationId, messages)
    
    console.log(`[Store] Stored conversation ${conversationId} with ${messages.length} messages`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function detectProject(messages: CapturedMessage[]): Promise<string | null> {
  // Simple keyword-based project detection
  const projectKeywords = [
    'DataKiln', 'Delobotomize', 'PromptHarvester'
  ]
  
  for (const msg of messages) {
    for (const keyword of projectKeywords) {
      if (msg.content.includes(keyword)) {
        return keyword
      }
    }
  }
  
  return null
}

async function extractTopics(content: string): Promise<string[]> {
  const topics: string[] = []
  
  // Simple keyword extraction (would use NLP in production)
  const keywords = [
    'mcp', 'agent', 'skill', 'rag', 'vector', 'embedding',
    'typescript', 'python', 'javascript', 'react', 'svelte',
    'postgres', 'database', 'api', 'backend'
  ]
  
  const contentLower = content.toLowerCase()
  for (const keyword of keywords) {
    if (contentLower.includes(keyword)) {
      topics.push(keyword)
    }
  }
  
  return [...new Set(topics)]
}

async function storeMessageTopic(
  client: any,
  conversationId: string,
  sequenceNumber: number,
  topicName: string
) {
  // Get or create topic
  const topicResult = await client.query(`
    INSERT INTO topics (name, category) VALUES ($1, 'auto')
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `, [topicName])
  
  const topicId = topicResult.rows[0].id
  
  // Get message ID
  const msgResult = await client.query(`
    SELECT id FROM messages 
    WHERE conversation_id = $1 AND sequence_number = $2
  `, [conversationId, sequenceNumber])
  
  if (msgResult.rows.length === 0) return
  
  const messageId = msgResult.rows[0].id
  
  // Link message to topic
  await client.query(`
    INSERT INTO message_topics (message_id, topic_id, confidence, extraction_method)
    VALUES ($1, $2, 0.8, 'keyword')
    ON CONFLICT DO NOTHING
  `, [messageId, topicId])
}

function extractTail(content: string, lines: number): string {
  const contentLines = content.split('\n')
  return contentLines.slice(-lines).join('\n')
}

async function generateSummary(content: string): Promise<string> {
  // In production, use LLM API to generate summary
  // For now, just return first 500 chars
  return content.substring(0, 500) + '...'
}

async function storeInObjectStorage(conversationId: string, content: string, index: number): Promise<string> {
  // In production, upload to R2
  // For now, just return a path
  return `r2://prompt-harvester/conversations/${conversationId}/messages/${index}.txt`
}

async function queueForEmbedding(conversationId: string, messages: CapturedMessage[]) {
  // In production, add to queue for async embedding generation
  console.log(`[Queue] Queued ${messages.length} messages for embedding`)
}

// ============================================================================
// Search Functions
// ============================================================================

async function semanticSearch(query: string, filters: any, limit: number) {
  // Generate embedding for query (would use actual embedding model)
  // For now, fall back to full-text search
  
  const client = await pg.connect()
  try {
    let sql = `
      SELECT 
        m.id, m.conversation_id, m.role, m.timestamp,
        COALESCE(m.content, m.content_summary) as content_preview,
        c.platform, c.project,
        ts_rank(ms.search_vector, plainto_tsquery('english', $1)) as rank
      FROM messages m
      JOIN message_search ms ON ms.message_id = m.id
      JOIN conversations c ON c.id = m.conversation_id
      WHERE ms.search_vector @@ plainto_tsquery('english', $1)
    `
    
    const params: any[] = [query]
    let paramCount = 1
    
    if (filters?.project) {
      paramCount++
      sql += ` AND c.project = $${paramCount}`
      params.push(filters.project)
    }
    
    if (filters?.platform) {
      paramCount++
      sql += ` AND c.platform = $${paramCount}`
      params.push(filters.platform)
    }
    
    sql += ` ORDER BY rank DESC LIMIT $${paramCount + 1}`
    params.push(limit)
    
    const result = await client.query(sql, params)
    return result.rows
  } finally {
    client.release()
  }
}

async function getConversation(conversationId: string) {
  const client = await pg.connect()
  try {
    const result = await client.query(`
      SELECT * FROM get_conversation_full($1)
    `, [conversationId])
    
    return result.rows[0] || null
  } finally {
    client.release()
  }
}

async function listConversations(filters: {
  project?: string
  platform?: string
  limit: number
  offset: number
}) {
  const client = await pg.connect()
  try {
    let sql = 'SELECT * FROM v_recent_conversations WHERE 1=1'
    const params: any[] = []
    let paramCount = 0
    
    if (filters.project) {
      paramCount++
      sql += ` AND project = $${paramCount}`
      params.push(filters.project)
    }
    
    if (filters.platform) {
      paramCount++
      sql += ` AND platform = $${paramCount}`
      params.push(filters.platform)
    }
    
    sql += ` ORDER BY updated_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`
    params.push(filters.limit, filters.offset)
    
    const result = await client.query(sql, params)
    return result.rows
  } finally {
    client.release()
  }
}

async function getStatistics() {
  const client = await pg.connect()
  try {
    const result = await client.query(`
      SELECT
        COUNT(DISTINCT c.id) as total_conversations,
        COUNT(m.id) as total_messages,
        COUNT(m.id) FILTER (WHERE m.role = 'user') as user_messages,
        COUNT(m.id) FILTER (WHERE m.role = 'assistant') as assistant_messages,
        COUNT(DISTINCT c.project) as unique_projects,
        COUNT(DISTINCT c.platform) as platforms_used,
        SUM(c.total_size_bytes) as total_size_bytes
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
    `)
    
    return result.rows[0]
  } finally {
    client.release()
  }
}

// Start server
const port = parseInt(process.env.PORT || '3000')
console.log(`🚀 Prompt Harvester API running on port ${port}`)

export default {
  port,
  fetch: app.fetch
}
