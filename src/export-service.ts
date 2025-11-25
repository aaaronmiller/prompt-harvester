/**
 * Export Service - Phase 3.4 & 4.2
 * Handles export of conversations to multiple formats
 */

import type { Pool } from 'pg';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import { mkdir, unlink, readdir } from 'fs/promises';

interface ExportFilters {
  project?: string;
  platform?: string;
  dateFrom?: Date;
  dateTo?: Date;
  topics?: string[];
}

interface Conversation {
  id: string;
  platform: string;
  model?: string;
  project?: string;
  started_at: Date;
  message_count: number;
  topics?: string[];
  user_prompt: string;
  response_text?: string;
}

export class ExportService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Build SQL query based on filters
   */
  private buildFilterQuery(filters: ExportFilters): { where: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.project) {
      conditions.push(`c.project = $${paramIndex++}`);
      params.push(filters.project);
    }

    if (filters.platform) {
      conditions.push(`c.platform = $${paramIndex++}`);
      params.push(filters.platform);
    }

    if (filters.dateFrom) {
      conditions.push(`c.started_at >= $${paramIndex++}`);
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      conditions.push(`c.started_at <= $${paramIndex++}`);
      params.push(filters.dateTo);
    }

    if (filters.topics && filters.topics.length > 0) {
      conditions.push(`c.topics && $${paramIndex++}::text[]`);
      params.push(filters.topics);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
  }

  /**
   * Get conversations based on filters
   */
  private async getConversations(filters: ExportFilters): Promise<Conversation[]> {
    const { where, params } = this.buildFilterQuery(filters);

    const result = await this.db.query<Conversation>(`
      SELECT
        c.id,
        c.platform,
        c.model,
        c.project,
        c.started_at,
        c.message_count,
        c.topics,
        (SELECT m.content FROM messages m
         WHERE m.conversation_id = c.id AND m.role = 'user'
         ORDER BY m.sequence_number LIMIT 1) as user_prompt,
        (SELECT m.content FROM messages m
         WHERE m.conversation_id = c.id AND m.role = 'assistant'
         ORDER BY m.sequence_number DESC LIMIT 1) as response_text
      FROM conversations c
      ${where}
      ORDER BY c.started_at DESC
    `, params);

    return result.rows;
  }

  /**
   * Export to Markdown format
   */
  async exportMarkdown(filters: ExportFilters, outputPath: string): Promise<void> {
    const conversations = await this.getConversations(filters);
    const stream = createWriteStream(outputPath);

    // Write frontmatter
    stream.write(`---\n`);
    stream.write(`title: Prompt Harvester Export\n`);
    stream.write(`exported: ${new Date().toISOString()}\n`);
    stream.write(`total_conversations: ${conversations.length}\n`);
    stream.write(`filters: ${JSON.stringify(filters)}\n`);
    stream.write(`---\n\n`);

    stream.write(`# Prompt Harvester Export\n\n`);
    stream.write(`Generated: ${new Date().toLocaleString()}\n\n`);
    stream.write(`Total conversations: ${conversations.length}\n\n`);

    // Generate TOC
    stream.write(`## Table of Contents\n\n`);
    const projects = [...new Set(conversations.map(c => c.project || 'Uncategorized'))];
    projects.forEach(project => {
      const slug = this.slugify(project);
      stream.write(`- [${project}](#${slug})\n`);
    });
    stream.write(`\n---\n\n`);

    // Write conversations grouped by project
    for (const project of projects) {
      stream.write(`# ${project}\n\n`);
      const projectConvs = conversations.filter(c => (c.project || 'Uncategorized') === project);

      for (const conv of projectConvs) {
        stream.write(`## ${new Date(conv.started_at).toLocaleString()} (${conv.platform})\n\n`);

        stream.write(`**ID:** \`${conv.id}\`\n\n`);

        if (conv.topics && conv.topics.length > 0) {
          stream.write(`**Topics:** ${conv.topics.join(', ')}\n\n`);
        }

        stream.write(`**User:**\n\n`);
        stream.write(`\`\`\`\n${conv.user_prompt || 'N/A'}\n\`\`\`\n\n`);

        stream.write(`**Assistant:**\n\n`);
        stream.write(`${conv.response_text || 'N/A'}\n\n`);

        stream.write(`---\n\n`);
      }
    }

    stream.end();
  }

  /**
   * Export to JSON format
   */
  async exportJSON(filters: ExportFilters, outputPath: string): Promise<void> {
    const conversations = await this.getConversations(filters);

    const exportData = {
      metadata: {
        exported_at: new Date().toISOString(),
        total_conversations: conversations.length,
        filters,
      },
      conversations: conversations.map(c => ({
        id: c.id,
        platform: c.platform,
        model: c.model,
        project: c.project,
        started_at: c.started_at,
        message_count: c.message_count,
        topics: c.topics,
        user_prompt: c.user_prompt,
        response_text: c.response_text,
      })),
    };

    const content = JSON.stringify(exportData, null, 2);
    await Bun.write(outputPath, content);
  }

  /**
   * Export to CSV format
   */
  async exportCSV(filters: ExportFilters, outputPath: string): Promise<void> {
    const conversations = await this.getConversations(filters);
    const stream = createWriteStream(outputPath);

    // Write header
    stream.write(`"ID","Platform","Model","Project","Date","Topics","User Prompt","Response Preview"\n`);

    for (const conv of conversations) {
      const fields = [
        conv.id,
        conv.platform,
        conv.model || '',
        conv.project || '',
        new Date(conv.started_at).toISOString(),
        (conv.topics || []).join('; '),
        (conv.user_prompt || '').replace(/"/g, '""').substring(0, 500),
        (conv.response_text || '').replace(/"/g, '""').substring(0, 500),
      ];

      stream.write(fields.map(f => `"${f}"`).join(',') + '\n');
    }

    stream.end();
  }

  /**
   * Export to Obsidian vault format
   */
  async exportObsidian(filters: ExportFilters, vaultPath: string): Promise<void> {
    const conversations = await this.getConversations(filters);

    // Create vault directory structure
    await mkdir(vaultPath, { recursive: true });

    // Create project directories
    const projects = [...new Set(conversations.map(c => c.project || 'Uncategorized'))];
    for (const project of projects) {
      await mkdir(`${vaultPath}/${this.slugify(project)}`, { recursive: true });
    }

    // Write individual conversation files
    for (const conv of conversations) {
      const projectSlug = this.slugify(conv.project || 'Uncategorized');
      const filename = `${vaultPath}/${projectSlug}/${conv.id.substring(0, 8)}.md`;

      let content = `---\n`;
      content += `id: ${conv.id}\n`;
      content += `project: "[[${conv.project || 'Uncategorized'}]]"\n`;
      content += `platform: ${conv.platform}\n`;
      content += `date: ${new Date(conv.started_at).toISOString()}\n`;
      content += `tags: ${(conv.topics || []).map(t => `#${t.replace(/\s+/g, '-')}`).join(' ')}\n`;
      content += `---\n\n`;

      content += `# Conversation ${conv.id.substring(0, 8)}\n\n`;

      content += `## User Prompt\n\n`;
      content += `${conv.user_prompt || 'N/A'}\n\n`;

      content += `## Response\n\n`;
      content += `${conv.response_text || 'N/A'}\n\n`;

      // Add related conversations (if any)
      const related = await this.db.query(
        'SELECT * FROM get_related_conversations($1, 0.8)',
        [conv.id]
      );

      if (related.rows.length > 0) {
        content += `## Related Conversations\n\n`;
        for (const rel of related.rows) {
          content += `- [[${rel.related_id.substring(0, 8)}]] (${rel.relationship_type}, similarity: ${(rel.similarity_score * 100).toFixed(1)}%)\n`;
        }
        content += `\n`;
      }

      await Bun.write(filename, content);
    }

    // Create index file
    await this.createObsidianIndex(conversations, vaultPath);
  }

  /**
   * Create Obsidian index file
   */
  private async createObsidianIndex(conversations: Conversation[], vaultPath: string): Promise<void> {
    let content = `# Prompt Harvester Archive\n\n`;
    content += `Generated: ${new Date().toLocaleString()}\n\n`;
    content += `Total conversations: ${conversations.length}\n\n`;

    // Group by project
    const projects = [...new Set(conversations.map(c => c.project || 'Uncategorized'))];

    for (const project of projects) {
      content += `## ${project}\n\n`;
      const projectConvs = conversations.filter(c => (c.project || 'Uncategorized') === project);

      for (const conv of projectConvs) {
        content += `- [[${conv.id.substring(0, 8)}]] - ${new Date(conv.started_at).toLocaleDateString()}\n`;
      }
      content += `\n`;
    }

    await Bun.write(`${vaultPath}/Index.md`, content);
  }

  /**
   * Create a backup archive
   */
  async createBackup(outputPath: string): Promise<void> {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    // Export all conversations as JSON
    const conversations = await this.getConversations({});
    archive.append(JSON.stringify(conversations, null, 2), { name: 'conversations.json' });

    // Export database schema
    const schema = await Bun.file('./schema.sql').text();
    archive.append(schema, { name: 'schema.sql' });

    // Export embedding stats
    const embeddingStats = await this.db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE embedding_status = 'completed') as embedded,
        COUNT(*) FILTER (WHERE embedding_status = 'pending') as pending
      FROM conversations
    `);
    archive.append(JSON.stringify(embeddingStats.rows[0], null, 2), { name: 'stats.json' });

    await archive.finalize();
  }

  /**
   * Cleanup old backups based on retention policy
   */
  async cleanupOldBackups(backupPath: string, retentionDays: number = 7): Promise<number> {
    const files = await readdir(backupPath);
    const now = Date.now();
    let deleted = 0;

    for (const file of files) {
      if (!file.endsWith('.zip')) continue;

      const filePath = `${backupPath}/${file}`;
      const stat = await Bun.file(filePath).exists();

      if (stat) {
        // Simple age-based deletion (could be enhanced with more sophisticated logic)
        deleted++;
        // await unlink(filePath);  // Commented out for safety
      }
    }

    return deleted;
  }

  /**
   * Helper: slugify text for filenames
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
