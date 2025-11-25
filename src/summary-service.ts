/**
 * Summary Service - Phase 5.1
 * Generates AI summaries for large conversations
 */

import { OpenAI } from 'openai';
import type { Pool } from 'pg';

export class SummaryService {
  private openai?: OpenAI;
  private db: Pool;
  private mode: 'local' | 'cloud';

  constructor(db: Pool, mode: 'local' | 'cloud', openaiKey?: string) {
    this.db = db;
    this.mode = mode;
    if (mode === 'cloud' && openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
    }
  }

  async generateSummary(conversationId: string): Promise<string> {
    const result = await this.db.query(
      `SELECT
        (SELECT m.content FROM messages m
         WHERE m.conversation_id = c.id AND m.role = 'user'
         ORDER BY m.sequence_number LIMIT 1) as user_prompt,
        (SELECT m.content FROM messages m
         WHERE m.conversation_id = c.id AND m.role = 'assistant'
         ORDER BY m.sequence_number DESC LIMIT 1) as response_text
       FROM conversations c WHERE c.id = $1`,
      [conversationId]
    );

    if (result.rows.length === 0) return '';

    const text = `User: ${result.rows[0].user_prompt}\n\nAssistant: ${result.rows[0].response_text || ''}`;

    if (this.mode === 'cloud' && this.openai) {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: `Summarize in 3 sentences: ${text.substring(0, 2000)}` }],
        max_tokens: 200,
      });
      return completion.choices[0].message.content || text.substring(0, 500);
    }

    return text.substring(0, 500) + '...';
  }
}
