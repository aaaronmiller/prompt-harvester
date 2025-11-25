/**
 * NLP Processor - Phase 2.3
 * Extracts topics and keywords from conversations using TF-IDF and natural language processing
 */

import natural from 'natural';
import type { Pool } from 'pg';

const TfIdf = natural.TfIdf;
const tokenizer = new natural.WordTokenizer();

interface Conversation {
  id: string;
  user_prompt: string;
  response_summary?: string;
  response_text?: string;
}

export class NLPProcessor {
  private tfidf: natural.TfIdf;
  private stopWords: Set<string>;
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
    this.tfidf = new TfIdf();
    this.stopWords = new Set([
      // Common English stop words
      'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
      'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them', 'their',
      'this', 'that', 'these', 'those', 'what', 'which', 'who', 'when',
      'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
      'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
      'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
      'about', 'above', 'after', 'again', 'against', 'along', 'also',
      'although', 'always', 'am', 'among', 'amongst', 'any', 'anyone',
      'anything', 'anywhere', 'around', 'as', 'at', 'back', 'because',
      'before', 'behind', 'below', 'beside', 'besides', 'between',
      'beyond', 'by', 'down', 'during', 'either', 'else', 'elsewhere',
      'even', 'ever', 'for', 'from', 'get', 'give', 'go', 'here',
      'however', 'if', 'in', 'into', 'last', 'least', 'less', 'like',
      'make', 'many', 'me', 'much', 'my', 'near', 'never', 'next',
      'now', 'of', 'off', 'on', 'once', 'one', 'onto', 'out', 'over',
      'please', 'put', 'see', 'since', 'still', 'take', 'then',
      'there', 'through', 'to', 'together', 'toward', 'under', 'until',
      'up', 'upon', 'us', 'use', 'used', 'using', 'via', 'want',
      'well', 'while', 'with', 'within', 'without', 'yet', 'your',

      // Programming/conversational common words to filter
      'need', 'want', 'help', 'please', 'thanks', 'thank', 'sure',
      'ok', 'okay', 'yes', 'yeah', 'yep', 'nope', 'let', 'lets',
      'make', 'create', 'add', 'update', 'change', 'fix', 'show',
      'tell', 'explain', 'write', 'read', 'run', 'execute', 'call',
      'going', 'trying', 'working', 'looking', 'seems', 'appears',
    ]);
  }

  /**
   * Extract topics from text using TF-IDF
   */
  extractTopics(text: string, numTopics: number = 5): string[] {
    // Tokenize and clean
    const tokens = tokenizer.tokenize(text.toLowerCase()) || [];

    const filtered = tokens.filter(token => {
      // Must be at least 3 characters
      if (token.length < 3) return false;

      // Must be alphabetic (or contain hyphen/underscore for programming terms)
      if (!/^[a-z][a-z0-9_-]*$/.test(token)) return false;

      // Not a stop word
      if (this.stopWords.has(token)) return false;

      return true;
    });

    if (filtered.length === 0) {
      return [];
    }

    // Add to TF-IDF corpus
    this.tfidf.addDocument(filtered);

    // Extract top terms
    const topics: string[] = [];
    const docIndex = this.tfidf.documents.length - 1;

    this.tfidf.listTerms(docIndex)
      .slice(0, numTopics)
      .forEach(item => {
        if (item.tfidf > 0) {
          topics.push(item.term);
        }
      });

    return topics;
  }

  /**
   * Extract topics using simple frequency analysis (backup method)
   */
  extractTopicsFrequency(text: string, numTopics: number = 5): string[] {
    const tokens = tokenizer.tokenize(text.toLowerCase()) || [];
    const frequency: Map<string, number> = new Map();

    // Count frequencies
    for (const token of tokens) {
      if (
        token.length >= 3 &&
        /^[a-z][a-z0-9_-]*$/.test(token) &&
        !this.stopWords.has(token)
      ) {
        frequency.set(token, (frequency.get(token) || 0) + 1);
      }
    }

    // Sort by frequency and return top N
    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, numTopics)
      .map(([term]) => term);
  }

  /**
   * Process a conversation and extract topics
   */
  async processConversation(conversationId: string): Promise<string[]> {
    try {
      // Get conversation
      const result = await this.db.query<Conversation>(
        `SELECT
          c.id,
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
      const combinedText = `${conv.user_prompt || ''} ${conv.response_summary || conv.response_text || ''}`;

      // Extract topics (try TF-IDF first, fallback to frequency)
      let topics: string[];
      try {
        topics = this.extractTopics(combinedText, 7);
        if (topics.length === 0) {
          topics = this.extractTopicsFrequency(combinedText, 7);
        }
      } catch {
        topics = this.extractTopicsFrequency(combinedText, 7);
      }

      // Store topics in conversations table
      await this.db.query(
        'UPDATE conversations SET topics = $1 WHERE id = $2',
        [topics, conversationId]
      );

      // Update global topic counts
      for (const topic of topics) {
        await this.db.query('SELECT increment_topic_count($1)', [topic]);
      }

      console.log(`✓ Extracted ${topics.length} topics for conversation ${conversationId.substring(0, 8)}`);

      return topics;
    } catch (error) {
      console.error(`✗ Failed to process conversation ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * Batch process conversations for topic extraction
   */
  async batchProcess(limit: number = 100): Promise<{ success: number; failed: number }> {
    const result = await this.db.query(
      `SELECT id FROM conversations
       WHERE topics = '{}' OR topics IS NULL
       ORDER BY started_at DESC
       LIMIT $1`,
      [limit]
    );

    const conversationIds = result.rows.map(row => row.id);
    const results = { success: 0, failed: 0 };

    console.log(`Processing ${conversationIds.length} conversations for topic extraction...`);

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
   * Get topic statistics
   */
  async getTopicStats(): Promise<Array<{
    topic_name: string;
    usage_count: number;
    category: string | null;
    recent_count: number;
  }>> {
    const result = await this.db.query(`
      SELECT
        topic_name,
        usage_count,
        category,
        recent_count
      FROM trending_topics
      ORDER BY usage_count DESC
      LIMIT 50
    `);

    return result.rows;
  }

  /**
   * Get topics for a specific conversation
   */
  async getConversationTopics(conversationId: string): Promise<string[]> {
    const result = await this.db.query(
      'SELECT topics FROM conversations WHERE id = $1',
      [conversationId]
    );

    if (result.rows.length === 0) {
      return [];
    }

    return result.rows[0].topics || [];
  }

  /**
   * Categorize a topic (basic heuristics, can be enhanced)
   */
  categorizeTopicSimple(topic: string): string {
    const categories: { [key: string]: RegExp } = {
      'programming-language': /^(python|javascript|typescript|java|rust|go|cpp|csharp|ruby|php|swift|kotlin)$/i,
      'framework': /^(react|vue|angular|svelte|django|flask|express|nextjs|remix|astro)$/i,
      'database': /^(postgresql|mysql|mongodb|redis|sqlite|dynamodb|qdrant)$/i,
      'devops': /^(docker|kubernetes|aws|gcp|azure|terraform|ansible|jenkins|github|gitlab)$/i,
      'ai-ml': /^(openai|claude|gemini|llm|embedding|vector|semantic|rag|mcp)$/i,
      'web-tech': /^(api|rest|graphql|websocket|http|cors|auth|oauth|jwt)$/i,
      'testing': /^(test|testing|jest|pytest|vitest|cypress|playwright)$/i,
      'error': /^(error|bug|issue|problem|failed|exception)$/i,
    };

    for (const [category, pattern] of Object.entries(categories)) {
      if (pattern.test(topic)) {
        return category;
      }
    }

    return 'general';
  }

  /**
   * Update topic categories
   */
  async updateTopicCategories(): Promise<number> {
    const result = await this.db.query(
      'SELECT topic_name FROM conversation_topics WHERE category IS NULL'
    );

    let updated = 0;
    for (const row of result.rows) {
      const category = this.categorizeTopicSimple(row.topic_name);
      await this.db.query(
        'UPDATE conversation_topics SET category = $1 WHERE topic_name = $2',
        [category, row.topic_name]
      );
      updated++;
    }

    console.log(`Updated categories for ${updated} topics`);
    return updated;
  }
}
