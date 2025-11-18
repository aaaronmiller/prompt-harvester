/**
 * Relationship Mapper - Phase 2.4
 * Detects and classifies relationships between conversations based on semantic similarity
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import type { Pool } from 'pg';

interface Conversation {
  id: string;
  user_prompt: string;
  project?: string;
  platform: string;
  started_at: Date;
  topics: string[];
}

interface RelationshipMatch {
  id: string;
  score: number;
  type: string;
  project?: string;
  started_at: Date;
}

export class RelationshipMapper {
  private qdrant: QdrantClient;
  private db: Pool;

  constructor(db: Pool, qdrantUrl: string = 'http://localhost:6333') {
    this.db = db;
    this.qdrant = new QdrantClient({ url: qdrantUrl });
  }

  /**
   * Find related conversations using vector similarity
   */
  async findRelatedConversations(
    conversationId: string,
    threshold: number = 0.8,
    limit: number = 20
  ): Promise<RelationshipMatch[]> {
    try {
      // Get the conversation's embedding from Qdrant
      const sourcePoint = await this.qdrant.retrieve('prompts', {
        ids: [conversationId],
        with_vectors: true,
      });

      if (sourcePoint.length === 0) {
        console.warn(`No embedding found for conversation ${conversationId}`);
        return [];
      }

      const sourceVector = sourcePoint[0].vector as number[];

      // Search for similar conversations
      const similarResults = await this.qdrant.search('prompts', {
        vector: sourceVector,
        limit: limit,
        score_threshold: threshold,
        filter: {
          must_not: [
            {
              key: 'conversation_id',
              match: { value: conversationId },
            },
          ],
        },
      });

      // Get conversation details from database
      const conversationIds = similarResults.map(r => r.id);
      if (conversationIds.length === 0) {
        return [];
      }

      const result = await this.db.query<Conversation>(
        `SELECT id, project, platform, started_at, topics
         FROM conversations
         WHERE id = ANY($1::uuid[])`,
        [conversationIds]
      );

      const conversationMap = new Map(
        result.rows.map(c => [c.id, c])
      );

      // Classify relationships
      const sourceConv = await this.getConversation(conversationId);
      const relationships: RelationshipMatch[] = [];

      for (const match of similarResults) {
        const targetConv = conversationMap.get(match.id);
        if (!targetConv) continue;

        const relationshipType = await this.classifyRelationship(
          sourceConv,
          targetConv,
          match.score
        );

        relationships.push({
          id: match.id,
          score: match.score,
          type: relationshipType,
          project: targetConv.project,
          started_at: targetConv.started_at,
        });
      }

      // Store relationships in database
      await this.storeRelationships(conversationId, relationships);

      return relationships;
    } catch (error) {
      console.error(`Error finding related conversations for ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * Classify the type of relationship between two conversations
   */
  private async classifyRelationship(
    source: Conversation,
    target: Conversation,
    similarity: number
  ): Promise<string> {
    // Near duplicate (very high similarity)
    if (similarity > 0.95) {
      return 'near_duplicate';
    }

    // Same project - likely builds on previous work
    if (source.project && target.project && source.project === target.project) {
      if (source.started_at > target.started_at) {
        return 'builds_on';
      } else if (source.started_at < target.started_at) {
        return 'builds_on'; // Target builds on source
      }
    }

    // Check if both are problem-solving conversations
    if (this.isProblemSolvingConversation(source) && this.isProblemSolvingConversation(target)) {
      // Check if they share similar topics
      const sharedTopics = source.topics.filter(t => target.topics.includes(t));
      if (sharedTopics.length > 0) {
        return 'solves_same_problem';
      }
    }

    // Check for contradicting information (advanced heuristic)
    // This could be enhanced with sentiment analysis or LLM classification
    if (this.mightContradict(source, target)) {
      return 'contradicts';
    }

    // High similarity but different context
    if (similarity > 0.85) {
      return 'references';
    }

    // General similarity
    return 'related';
  }

  /**
   * Check if a conversation is about problem-solving
   */
  private isProblemSolvingConversation(conv: Conversation): boolean {
    const problemKeywords = [
      'error', 'issue', 'problem', 'bug', 'failed', 'broken',
      'not working', 'doesn\'t work', 'help', 'fix', 'solve'
    ];

    const promptLower = conv.user_prompt.toLowerCase();
    return problemKeywords.some(kw => promptLower.includes(kw));
  }

  /**
   * Check if conversations might contradict each other (simple heuristic)
   */
  private mightContradict(source: Conversation, target: Conversation): boolean {
    // Look for contradictory patterns
    const contradictPatterns = [
      { pattern: /should use/i, opposite: /should not use|shouldn't use|avoid/i },
      { pattern: /recommended/i, opposite: /not recommended|deprecated|obsolete/i },
      { pattern: /works with/i, opposite: /doesn't work|incompatible/i },
    ];

    for (const { pattern, opposite } of contradictPatterns) {
      if (
        (pattern.test(source.user_prompt) && opposite.test(target.user_prompt)) ||
        (opposite.test(source.user_prompt) && pattern.test(target.user_prompt))
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get conversation details
   */
  private async getConversation(conversationId: string): Promise<Conversation> {
    const result = await this.db.query<Conversation>(
      `SELECT
        c.id,
        c.project,
        c.platform,
        c.started_at,
        c.topics,
        (SELECT m.content FROM messages m
         WHERE m.conversation_id = c.id AND m.role = 'user'
         ORDER BY m.sequence_number LIMIT 1) as user_prompt
       FROM conversations c
       WHERE c.id = $1`,
      [conversationId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    return result.rows[0];
  }

  /**
   * Store relationships in the database
   */
  private async storeRelationships(
    sourceId: string,
    relationships: RelationshipMatch[]
  ): Promise<void> {
    for (const rel of relationships) {
      await this.db.query(
        `INSERT INTO conversation_relationships
         (source_conversation_id, related_conversation_id, similarity_score, relationship_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (source_conversation_id, related_conversation_id)
         DO UPDATE SET
           similarity_score = EXCLUDED.similarity_score,
           relationship_type = EXCLUDED.relationship_type,
           detected_at = NOW()`,
        [sourceId, rel.id, rel.score, rel.type]
      );
    }
  }

  /**
   * Batch process conversations to build relationship graph
   */
  async batchProcessRelationships(
    limit: number = 100,
    minSimilarity: number = 0.8
  ): Promise<{ success: number; failed: number; relationships: number }> {
    // Get conversations with embeddings but no relationships
    const result = await this.db.query(`
      SELECT c.id
      FROM conversations c
      WHERE c.embedding_status = 'completed'
      AND NOT EXISTS (
        SELECT 1 FROM conversation_relationships cr
        WHERE cr.source_conversation_id = c.id
      )
      ORDER BY c.started_at DESC
      LIMIT $1
    `, [limit]);

    const conversationIds = result.rows.map(row => row.id);
    const results = { success: 0, failed: 0, relationships: 0 };

    console.log(`Processing relationships for ${conversationIds.length} conversations...`);

    for (const id of conversationIds) {
      try {
        const relationships = await this.findRelatedConversations(id, minSimilarity);
        results.success++;
        results.relationships += relationships.length;
        console.log(`✓ Found ${relationships.length} related conversations for ${id.substring(0, 8)}`);
      } catch (error) {
        console.error(`✗ Failed to process relationships for ${id}:`, error);
        results.failed++;
      }
    }

    return results;
  }

  /**
   * Get relationship statistics
   */
  async getRelationshipStats(): Promise<{
    total_relationships: number;
    by_type: Record<string, number>;
    avg_similarity: number;
  }> {
    const result = await this.db.query(`
      SELECT
        COUNT(*) as total,
        relationship_type,
        AVG(similarity_score) as avg_score
      FROM conversation_relationships
      GROUP BY relationship_type
    `);

    const byType: Record<string, number> = {};
    let totalRelationships = 0;
    let totalScore = 0;

    for (const row of result.rows) {
      byType[row.relationship_type] = parseInt(row.total);
      totalRelationships += parseInt(row.total);
      totalScore += parseFloat(row.avg_score) * parseInt(row.total);
    }

    return {
      total_relationships: totalRelationships,
      by_type: byType,
      avg_similarity: totalRelationships > 0 ? totalScore / totalRelationships : 0,
    };
  }

  /**
   * Get related conversations for a specific conversation
   */
  async getRelatedConversationsFromDB(
    conversationId: string,
    minSimilarity: number = 0.7
  ): Promise<Array<{
    id: string;
    relationship_type: string;
    similarity_score: number;
    project: string;
    started_at: Date;
  }>> {
    const result = await this.db.query(
      'SELECT * FROM get_related_conversations($1, $2)',
      [conversationId, minSimilarity]
    );

    return result.rows.map(row => ({
      id: row.related_id,
      relationship_type: row.relationship_type,
      similarity_score: row.similarity_score,
      project: row.project,
      started_at: row.started_at,
    }));
  }
}
