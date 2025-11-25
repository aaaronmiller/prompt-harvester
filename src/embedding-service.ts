/**
 * Embedding Service - Phase 2.1
 * Generates vector embeddings for conversations using OpenAI or local models
 */

import { OpenAI } from 'openai';
import { QdrantClient } from '@qdrant/js-client-rest';
import type { Pool } from 'pg';
import { pipeline } from '@xenova/transformers';

interface EmbeddingConfig {
  mode: 'cloud' | 'local';
  openaiKey?: string;
  qdrantUrl?: string;
  modelName?: string;
}

interface Conversation {
  id: string;
  user_prompt: string;
  response_text?: string;
  response_summary?: string;
  project?: string;
  platform: string;
  started_at: Date;
}

export class EmbeddingService {
  private openai?: OpenAI;
  private qdrant: QdrantClient;
  private db: Pool;
  private localEmbedder?: any;
  private config: EmbeddingConfig;

  constructor(db: Pool, config: EmbeddingConfig) {
    this.db = db;
    this.config = config;

    if (config.mode === 'cloud') {
      if (!config.openaiKey) {
        throw new Error('OpenAI API key required for cloud mode');
      }
      this.openai = new OpenAI({ apiKey: config.openaiKey });
    }

    this.qdrant = new QdrantClient({
      url: config.qdrantUrl || 'http://localhost:6333'
    });
  }

  /**
   * Initialize Qdrant collection if it doesn't exist
   */
  async initializeQdrant(): Promise<void> {
    try {
      await this.qdrant.getCollection('prompts');
      console.log('Qdrant collection "prompts" already exists');
    } catch {
      console.log('Creating Qdrant collection "prompts"...');
      await this.qdrant.createCollection('prompts', {
        vectors: {
          size: 1536, // OpenAI text-embedding-3-small dimension
          distance: 'Cosine'
        }
      });
      console.log('Qdrant collection created successfully');
    }
  }

  /**
   * Generate embedding using OpenAI API
   */
  private async generateCloudEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const response = await this.openai.embeddings.create({
      model: this.config.modelName || 'text-embedding-3-small',
      input: text.substring(0, 8192), // Truncate to token limit
    });

    return response.data[0].embedding;
  }

  /**
   * Generate embedding using local model (transformers.js)
   */
  private async generateLocalEmbedding(text: string): Promise<number[]> {
    if (!this.localEmbedder) {
      console.log('Loading local embedding model...');
      this.localEmbedder = await pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2'
      );
    }

    const output = await this.localEmbedder(text.substring(0, 512), {
      pooling: 'mean',
      normalize: true
    });

    // Convert to array and pad/truncate to 1536 dimensions
    let embedding = Array.from(output.data);

    // Pad or truncate to match OpenAI dimensions (1536)
    if (embedding.length < 1536) {
      embedding = [...embedding, ...new Array(1536 - embedding.length).fill(0)];
    } else if (embedding.length > 1536) {
      embedding = embedding.slice(0, 1536);
    }

    return embedding;
  }

  /**
   * Generate embedding (routes to cloud or local)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (this.config.mode === 'cloud') {
      return this.generateCloudEmbedding(text);
    } else {
      return this.generateLocalEmbedding(text);
    }
  }

  /**
   * Process a single conversation: generate embeddings and store in Qdrant
   */
  async processConversation(conversationId: string, retryCount: number = 0): Promise<void> {
    const maxRetries = 3;

    try {
      // Update status to processing
      await this.db.query(
        'UPDATE conversations SET embedding_status = $1 WHERE id = $2',
        ['processing', conversationId]
      );

      // Get conversation details
      const result = await this.db.query<Conversation>(
        `SELECT
          c.id,
          c.project,
          c.platform,
          c.started_at,
          (SELECT m.content FROM messages m
           WHERE m.conversation_id = c.id AND m.role = 'user'
           ORDER BY m.sequence_number LIMIT 1) as user_prompt,
          (SELECT m.content FROM messages m
           WHERE m.conversation_id = c.id AND m.role = 'assistant'
           ORDER BY m.sequence_number DESC LIMIT 1) as response_text
         FROM conversations c
         WHERE c.id = $1`,
        [conversationId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Conversation ${conversationId} not found`);
      }

      const conv = result.rows[0];

      if (!conv.user_prompt) {
        console.warn(`Conversation ${conversationId} has no user prompt, skipping`);
        await this.db.query(
          'UPDATE conversations SET embedding_status = $1, embedding_error = $2 WHERE id = $3',
          ['failed', 'No user prompt found', conversationId]
        );
        return;
      }

      // Generate embeddings for user prompt
      const promptEmbedding = await this.generateEmbedding(conv.user_prompt);

      // Optional: Generate embedding for response (can be added later)
      // const responseText = conv.response_summary || conv.response_text || '';
      // const responseEmbedding = responseText ? await this.generateEmbedding(responseText) : null;

      // Store in Qdrant
      await this.qdrant.upsert('prompts', {
        points: [
          {
            id: conversationId,
            vector: promptEmbedding,
            payload: {
              conversation_id: conversationId,
              project: conv.project || '',
              platform: conv.platform,
              created_at: conv.started_at.toISOString(),
            },
          },
        ],
      });

      // Update database status
      await this.db.query(
        'UPDATE conversations SET embedding_status = $1, embedding_error = NULL WHERE id = $2',
        ['completed', conversationId]
      );

      console.log(`✓ Processed conversation ${conversationId.substring(0, 8)}`);
    } catch (error) {
      console.error(`✗ Failed to process conversation ${conversationId}:`, error);

      // Retry logic
      if (retryCount < maxRetries) {
        console.log(`  Retrying (${retryCount + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        return this.processConversation(conversationId, retryCount + 1);
      }

      // Log error
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.db.query(
        'UPDATE conversations SET embedding_status = $1, embedding_error = $2 WHERE id = $3',
        ['failed', errorMessage, conversationId]
      );

      await this.db.query(
        `INSERT INTO embeddings_error_log (conversation_id, error_message, error_type, retry_count)
         VALUES ($1, $2, $3, $4)`,
        [conversationId, errorMessage, 'generation_failed', retryCount]
      );
    }
  }

  /**
   * Batch process unprocessed conversations
   */
  async batchProcessExisting(limit: number = 100): Promise<{ success: number; failed: number }> {
    const result = await this.db.query(
      'SELECT id FROM get_unprocessed_conversations($1)',
      [limit]
    );

    const conversationIds = result.rows.map(row => row.id);
    const results = { success: 0, failed: 0 };

    console.log(`Processing ${conversationIds.length} conversations...`);

    for (const id of conversationIds) {
      try {
        await this.processConversation(id);
        results.success++;
      } catch (error) {
        console.error(`Failed to process ${id}:`, error);
        results.failed++;
      }
    }

    return results;
  }

  /**
   * Get embedding statistics
   */
  async getStats(): Promise<{
    total: number;
    embedded: number;
    pending: number;
    failed: number;
  }> {
    const result = await this.db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE embedding_status = 'completed') as embedded,
        COUNT(*) FILTER (WHERE embedding_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE embedding_status = 'failed') as failed
      FROM conversations
    `);

    const row = result.rows[0];
    return {
      total: parseInt(row.total),
      embedded: parseInt(row.embedded),
      pending: parseInt(row.pending),
      failed: parseInt(row.failed),
    };
  }
}
