/**
 * API Routes for Phase 2/3 Features
 * Add these routes to your Hono app
 */

import type { Hono } from 'hono';
import type { Pool } from 'pg';
import { EmbeddingService } from './embedding-service';
import { NLPProcessor } from './nlp-processor';
import { RelationshipMapper } from './relationship-mapper';
import { TemplateExtractor } from './template-extractor';
import { ExportService } from './export-service';
import { QdrantClient } from '@qdrant/js-client-rest';

export function registerPhase2Routes(app: Hono, db: Pool, qdrant: QdrantClient) {
  // Initialize services
  const embeddingService = new EmbeddingService(db, {
    mode: (process.env.EMBEDDING_MODE as 'cloud' | 'local') || 'local',
    openaiKey: process.env.OPENAI_API_KEY,
    qdrantUrl: process.env.QDRANT_URL,
  });

  const nlpProcessor = new NLPProcessor(db);
  const relationshipMapper = new RelationshipMapper(db, process.env.QDRANT_URL);
  const templateExtractor = new TemplateExtractor(db, process.env.QDRANT_URL);
  const exportService = new ExportService(db);

  // ============================================================================
  // SEMANTIC SEARCH ENDPOINTS
  // ============================================================================

  app.post('/api/search/semantic', async (c) => {
    try {
      const { query, filters, limit = 20 } = await c.req.json();

      const queryEmbedding = await embeddingService.generateEmbedding(query);

      const filter: any = {};
      if (filters?.project) {
        filter.must = filter.must || [];
        filter.must.push({ key: 'project', match: { value: filters.project } });
      }
      if (filters?.platform) {
        filter.must = filter.must || [];
        filter.must.push({ key: 'platform', match: { value: filters.platform } });
      }

      const vectorResults = await qdrant.search('prompts', {
        vector: queryEmbedding,
        limit: limit,
        score_threshold: 0.7,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
      });

      if (vectorResults.length === 0) {
        return c.json({ results: [], total: 0 });
      }

      const conversationIds = vectorResults.map((r) => r.id);
      const result = await db.query(
        `SELECT * FROM v_conversation_details WHERE id = ANY($1::uuid[])`,
        [conversationIds]
      );

      const results = result.rows.map((row: any) => ({
        ...row,
        similarity_score: vectorResults.find((v) => v.id === row.id)?.score,
      }));

      return c.json({ results, total: results.length });
    } catch (error) {
      console.error('Semantic search error:', error);
      return c.json(
        { error: error instanceof Error ? error.message : 'Search failed' },
        500
      );
    }
  });

  app.post('/api/search/hybrid', async (c) => {
    try {
      const { query, filters, limit = 20, alpha = 0.5 } = await c.req.json();

      // Vector search
      const vectorResponse = await fetch('http://localhost:3000/api/search/semantic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, filters, limit }),
      });
      const vectorData = await vectorResponse.json();

      // Full-text search
      const textResult = await db.query(
        `SELECT * FROM search_messages($1, $2)`,
        [query, limit]
      );

      // Simple combination (RRF would be more complex)
      const combined = [...vectorData.results];
      textResult.rows.forEach((row: any) => {
        if (!combined.find((c) => c.id === row.conversation_id)) {
          combined.push(row);
        }
      });

      return c.json({ results: combined.slice(0, limit), total: combined.length });
    } catch (error) {
      console.error('Hybrid search error:', error);
      return c.json(
        { error: error instanceof Error ? error.message : 'Search failed' },
        500
      );
    }
  });

  // ============================================================================
  // CONVERSATION ENDPOINTS
  // ============================================================================

  app.get('/api/conversations', async (c) => {
    try {
      const { project, platform, limit = 50, offset = 0 } = c.req.query();

      let query = 'SELECT * FROM v_conversation_details WHERE 1=1';
      const params: any[] = [];
      let paramCount = 1;

      if (project) {
        query += ` AND project = $${paramCount++}`;
        params.push(project);
      }
      if (platform) {
        query += ` AND platform = $${paramCount++}`;
        params.push(platform);
      }

      query += ` ORDER BY started_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
      params.push(parseInt(limit as string), parseInt(offset as string));

      const result = await db.query(query, params);

      return c.json({ results: result.rows, total: result.rowCount });
    } catch (error) {
      console.error('Get conversations error:', error);
      return c.json({ error: 'Failed to fetch conversations' }, 500);
    }
  });

  app.get('/api/conversations/:id', async (c) => {
    try {
      const id = c.req.param('id');

      const result = await db.query(
        `SELECT
          c.*,
          (SELECT json_agg(m ORDER BY m.sequence_number)
           FROM messages m WHERE m.conversation_id = c.id) as messages
         FROM conversations c
         WHERE c.id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return c.json({ error: 'Conversation not found' }, 404);
      }

      return c.json(result.rows[0]);
    } catch (error) {
      console.error('Get conversation error:', error);
      return c.json({ error: 'Failed to fetch conversation' }, 500);
    }
  });

  app.get('/api/conversations/:id/related', async (c) => {
    try {
      const id = c.req.param('id');
      const minSimilarity = parseFloat(c.req.query('min_similarity') || '0.7');

      const related = await relationshipMapper.getRelatedConversationsFromDB(id, minSimilarity);

      return c.json(related);
    } catch (error) {
      console.error('Get related conversations error:', error);
      return c.json({ error: 'Failed to fetch related conversations' }, 500);
    }
  });

  // ============================================================================
  // ANALYTICS ENDPOINTS
  // ============================================================================

  app.get('/api/analytics', async (c) => {
    try {
      const [tokenUsage, trendingTopics, platformEfficiency] = await Promise.all([
        db.query('SELECT * FROM token_usage_daily ORDER BY date DESC LIMIT 30'),
        db.query('SELECT * FROM trending_topics LIMIT 50'),
        db.query('SELECT * FROM platform_efficiency'),
      ]);

      return c.json({
        token_usage_daily: tokenUsage.rows,
        trending_topics: trendingTopics.rows,
        platform_efficiency: platformEfficiency.rows,
      });
    } catch (error) {
      console.error('Get analytics error:', error);
      return c.json({ error: 'Failed to fetch analytics' }, 500);
    }
  });

  app.get('/api/topics', async (c) => {
    try {
      const topics = await nlpProcessor.getTopicStats();
      return c.json(topics);
    } catch (error) {
      console.error('Get topics error:', error);
      return c.json({ error: 'Failed to fetch topics' }, 500);
    }
  });

  // ============================================================================
  // TEMPLATE ENDPOINTS
  // ============================================================================

  app.get('/api/templates', async (c) => {
    try {
      const limit = parseInt(c.req.query('limit') || '50');
      const templates = await templateExtractor.getTemplates(limit);
      return c.json(templates);
    } catch (error) {
      console.error('Get templates error:', error);
      return c.json({ error: 'Failed to fetch templates' }, 500);
    }
  });

  // ============================================================================
  // EXPORT ENDPOINTS
  // ============================================================================

  app.post('/api/export/:format', async (c) => {
    try {
      const format = c.req.param('format') as 'markdown' | 'json' | 'csv';
      const { filters } = await c.req.json();

      const timestamp = Date.now();
      const filename = `/tmp/export-${timestamp}.${format === 'markdown' ? 'md' : format}`;

      if (format === 'markdown') {
        await exportService.exportMarkdown(filters, filename);
      } else if (format === 'json') {
        await exportService.exportJSON(filters, filename);
      } else if (format === 'csv') {
        await exportService.exportCSV(filters, filename);
      }

      const file = Bun.file(filename);
      return new Response(file.stream(), {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="export-${timestamp}.${format === 'markdown' ? 'md' : format}"`,
        },
      });
    } catch (error) {
      console.error('Export error:', error);
      return c.json({ error: 'Export failed' }, 500);
    }
  });

  // ============================================================================
  // EMBEDDING STATUS ENDPOINT
  // ============================================================================

  app.get('/api/embeddings/status', async (c) => {
    try {
      const stats = await embeddingService.getStats();
      return c.json(stats);
    } catch (error) {
      console.error('Get embedding stats error:', error);
      return c.json({ error: 'Failed to fetch embedding stats' }, 500);
    }
  });

  app.post('/api/embeddings/batch', async (c) => {
    try {
      const { limit = 100 } = await c.req.json();
      const results = await embeddingService.batchProcessExisting(limit);
      return c.json(results);
    } catch (error) {
      console.error('Batch embeddings error:', error);
      return c.json({ error: 'Batch processing failed' }, 500);
    }
  });
}
