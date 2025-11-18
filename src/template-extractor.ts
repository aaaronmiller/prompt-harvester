/**
 * Template Extractor - Phase 3.3
 * Extracts reusable prompt patterns from conversations
 */

import type { Pool } from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';

interface Conversation {
  id: string;
  user_prompt: string;
  topics: string[];
  started_at: Date;
}

interface Template {
  pattern: string;
  parameterized_pattern: string;
  occurrences: number;
  examples: string[];
  effectiveness_score: number;
  category: string;
}

export class TemplateExtractor {
  private db: Pool;
  private qdrant: QdrantClient;

  constructor(db: Pool, qdrantUrl: string = 'http://localhost:6333') {
    this.db = db;
    this.qdrant = new QdrantClient({ url: qdrantUrl });
  }

  /**
   * Extract templates from conversations
   */
  async extractTemplates(minOccurrences: number = 3): Promise<Template[]> {
    console.log('Extracting prompt templates...');

    // Get all conversations with user prompts
    const result = await this.db.query<Conversation>(`
      SELECT
        c.id,
        c.topics,
        c.started_at,
        (SELECT m.content FROM messages m
         WHERE m.conversation_id = c.id AND m.role = 'user'
         ORDER BY m.sequence_number LIMIT 1) as user_prompt
      FROM conversations c
      WHERE c.embedding_status = 'completed'
      ORDER BY c.started_at DESC
      LIMIT 1000
    `);

    const conversations = result.rows;
    console.log(`Analyzing ${conversations.length} conversations...`);

    // Cluster similar prompts using embeddings
    const clusters = await this.clusterSimilarPrompts(conversations, 0.85);

    const templates: Template[] = [];

    for (const cluster of clusters) {
      if (cluster.members.length < minOccurrences) continue;

      // Extract common pattern
      const pattern = this.extractCommonPattern(cluster.members);
      const parameterized = this.parameterizePattern(pattern, cluster.members);

      // Calculate effectiveness
      const effectiveness = await this.calculateEffectiveness(cluster.memberIds);

      // Determine category
      const category = this.categorizeTemplate(pattern, cluster.topics);

      templates.push({
        pattern,
        parameterized_pattern: parameterized,
        occurrences: cluster.members.length,
        examples: cluster.members.slice(0, 3),
        effectiveness_score: effectiveness,
        category,
      });
    }

    // Sort by occurrences
    templates.sort((a, b) => b.occurrences - a.occurrences);

    // Store templates in database
    await this.storeTemplates(templates);

    console.log(`✓ Extracted ${templates.length} templates`);
    return templates;
  }

  /**
   * Cluster similar prompts using vector similarity
   */
  private async clusterSimilarPrompts(
    conversations: Conversation[],
    similarityThreshold: number = 0.85
  ): Promise<Array<{ members: string[]; memberIds: string[]; topics: string[] }>> {
    const clusters: Array<{ members: string[]; memberIds: string[]; topics: string[] }> = [];
    const processed = new Set<string>();

    for (const conv of conversations) {
      if (processed.has(conv.id) || !conv.user_prompt) continue;

      // Find similar conversations using Qdrant
      try {
        const sourcePoint = await this.qdrant.retrieve('prompts', {
          ids: [conv.id],
          with_vectors: true,
        });

        if (sourcePoint.length === 0) continue;

        const similarResults = await this.qdrant.search('prompts', {
          vector: sourcePoint[0].vector as number[],
          limit: 50,
          score_threshold: similarityThreshold,
        });

        const clusterMembers: string[] = [conv.user_prompt];
        const clusterIds: string[] = [conv.id];
        const clusterTopics = new Set<string>(conv.topics || []);

        for (const match of similarResults) {
          const matchConv = conversations.find(c => c.id === match.id);
          if (matchConv && !processed.has(matchConv.id) && matchConv.user_prompt) {
            clusterMembers.push(matchConv.user_prompt);
            clusterIds.push(matchConv.id);
            processed.add(matchConv.id);

            // Collect topics
            if (matchConv.topics) {
              matchConv.topics.forEach(t => clusterTopics.add(t));
            }
          }
        }

        processed.add(conv.id);

        if (clusterMembers.length >= 2) {
          clusters.push({
            members: clusterMembers,
            memberIds: clusterIds,
            topics: Array.from(clusterTopics),
          });
        }
      } catch (error) {
        console.warn(`Failed to cluster conversation ${conv.id}:`, error);
        continue;
      }
    }

    return clusters;
  }

  /**
   * Extract common pattern from similar prompts
   */
  private extractCommonPattern(prompts: string[]): string {
    if (prompts.length === 0) return '';
    if (prompts.length === 1) return prompts[0];

    // Find the longest common substring approach
    // For simplicity, we'll use the first prompt as base and find commonalities

    const words = prompts.map(p => p.toLowerCase().split(/\s+/));

    // Find common starting words
    const commonStart: string[] = [];
    for (let i = 0; i < Math.min(...words.map(w => w.length)); i++) {
      const firstWord = words[0][i];
      if (words.every(w => w[i] === firstWord)) {
        commonStart.push(firstWord);
      } else {
        break;
      }
    }

    // If we have common starting words, use that as pattern
    if (commonStart.length > 2) {
      return commonStart.join(' ');
    }

    // Otherwise, return the shortest prompt as representative
    return prompts.reduce((shortest, current) =>
      current.length < shortest.length ? current : shortest
    );
  }

  /**
   * Parameterize a pattern to make it reusable
   */
  private parameterizePattern(pattern: string, examples: string[]): string {
    let parameterized = pattern;

    // Common parameterization patterns
    const replacements: Array<{ regex: RegExp; replacement: string }> = [
      // Programming languages
      { regex: /\b(python|javascript|typescript|java|rust|go|c\+\+|ruby|php)\b/gi, replacement: '{language}' },

      // File paths
      { regex: /\b[\w-]+\.(js|ts|py|java|rs|go|rb|php|html|css|json|md)\b/gi, replacement: '{file}' },

      // Frameworks/libraries
      { regex: /\b(react|vue|angular|svelte|django|flask|express|fastapi)\b/gi, replacement: '{framework}' },

      // Actions
      { regex: /\b(create|add|update|delete|fix|modify|refactor)\b/gi, replacement: '{action}' },

      // Numbers
      { regex: /\b\d+\b/g, replacement: '{number}' },
    ];

    for (const { regex, replacement } of replacements) {
      parameterized = parameterized.replace(regex, replacement);
    }

    // Remove duplicate placeholders
    parameterized = parameterized.replace(/\{(\w+)\}(\s+\{\1\})+/g, '{$1}');

    return parameterized;
  }

  /**
   * Calculate template effectiveness (success rate)
   */
  private async calculateEffectiveness(conversationIds: string[]): Promise<number> {
    if (conversationIds.length === 0) return 0;

    // Measure: Did the response solve the problem?
    // Heuristic: No follow-up conversation on same topic within 24h = success
    let successCount = 0;

    for (const convId of conversationIds) {
      const followUps = await this.db.query(`
        SELECT COUNT(*) as count
        FROM conversations c2
        WHERE c2.id != $1
        AND c2.project = (SELECT project FROM conversations WHERE id = $1)
        AND c2.started_at > (SELECT started_at FROM conversations WHERE id = $1)
        AND c2.started_at < (SELECT started_at FROM conversations WHERE id = $1) + INTERVAL '24 hours'
        AND EXISTS (
          SELECT 1 FROM messages m
          WHERE m.conversation_id = c2.id
          AND m.role = 'user'
          AND (
            m.content ILIKE '%same%' OR
            m.content ILIKE '%still%' OR
            m.content ILIKE '%again%' OR
            m.content ILIKE '%error%'
          )
        )
      `, [convId]);

      if (parseInt(followUps.rows[0].count) === 0) {
        successCount++;
      }
    }

    return successCount / conversationIds.length;
  }

  /**
   * Categorize template
   */
  private categorizeTemplate(pattern: string, topics: string[]): string {
    // Check topics first
    if (topics.includes('error') || topics.includes('bug') || topics.includes('fix')) {
      return 'debugging';
    }

    if (topics.includes('test') || topics.includes('testing')) {
      return 'testing';
    }

    // Check pattern content
    const patternLower = pattern.toLowerCase();

    if (patternLower.includes('create') || patternLower.includes('new')) {
      return 'creation';
    }

    if (patternLower.includes('refactor') || patternLower.includes('improve')) {
      return 'refactoring';
    }

    if (patternLower.includes('explain') || patternLower.includes('what') || patternLower.includes('how')) {
      return 'explanation';
    }

    if (patternLower.includes('configure') || patternLower.includes('setup')) {
      return 'configuration';
    }

    return 'general';
  }

  /**
   * Store templates in database
   */
  private async storeTemplates(templates: Template[]): Promise<void> {
    for (const template of templates) {
      const result = await this.db.query(`
        INSERT INTO prompt_templates
        (pattern, parameterized_pattern, occurrence_count, effectiveness_score, category)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (pattern)
        DO UPDATE SET
          occurrence_count = EXCLUDED.occurrence_count,
          effectiveness_score = EXCLUDED.effectiveness_score,
          updated_at = NOW()
        RETURNING id
      `, [
        template.pattern,
        template.parameterized_pattern,
        template.occurrences,
        template.effectiveness_score,
        template.category,
      ]);

      const templateId = result.rows[0].id;

      // Store examples (we'd need to track which conversations match this template)
      // For now, we'll skip this as it requires more complex tracking
    }
  }

  /**
   * Get all templates
   */
  async getTemplates(limit: number = 50): Promise<Template[]> {
    const result = await this.db.query(`
      SELECT
        pattern,
        parameterized_pattern,
        occurrence_count as occurrences,
        effectiveness_score,
        category
      FROM prompt_templates
      ORDER BY occurrence_count DESC, effectiveness_score DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => ({
      pattern: row.pattern,
      parameterized_pattern: row.parameterized_pattern,
      occurrences: row.occurrences,
      examples: [], // Would need to fetch from template_examples
      effectiveness_score: row.effectiveness_score || 0,
      category: row.category || 'general',
    }));
  }

  /**
   * Rate a template
   */
  async rateTemplate(templateId: string, userId: string, rating: number, feedback?: string): Promise<void> {
    await this.db.query(`
      INSERT INTO template_ratings (template_id, user_id, rating, feedback)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (template_id, user_id)
      DO UPDATE SET
        rating = EXCLUDED.rating,
        feedback = EXCLUDED.feedback,
        rated_at = NOW()
    `, [templateId, userId, rating, feedback]);
  }

  /**
   * Get template statistics
   */
  async getTemplateStats(): Promise<{
    total_templates: number;
    by_category: Record<string, number>;
    avg_effectiveness: number;
  }> {
    const result = await this.db.query(`
      SELECT
        COUNT(*) as total,
        category,
        AVG(effectiveness_score) as avg_score
      FROM prompt_templates
      GROUP BY category
    `);

    const byCategory: Record<string, number> = {};
    let totalTemplates = 0;
    let totalScore = 0;

    for (const row of result.rows) {
      byCategory[row.category] = parseInt(row.total);
      totalTemplates += parseInt(row.total);
      totalScore += parseFloat(row.avg_score || 0) * parseInt(row.total);
    }

    return {
      total_templates: totalTemplates,
      by_category: byCategory,
      avg_effectiveness: totalTemplates > 0 ? totalScore / totalTemplates : 0,
    };
  }
}
