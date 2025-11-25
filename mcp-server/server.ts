#!/usr/bin/env bun

/**
 * MCP Server - Phase 2.5
 * Provides natural language query interface for Claude Code to search conversations
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Pool } from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import { EmbeddingService } from '../src/embedding-service.js';

// Database connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/prompt_harvester',
});

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
});

const embeddingService = new EmbeddingService(db, {
  mode: (process.env.EMBEDDING_MODE as 'cloud' | 'local') || 'local',
  openaiKey: process.env.OPENAI_API_KEY,
  qdrantUrl: process.env.QDRANT_URL,
});

// Create MCP server
const server = new Server(
  {
    name: 'prompt-harvester',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool: Search conversations
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'search_conversations') {
    const { query, project, platform, limit = 10 } = args as {
      query: string;
      project?: string;
      platform?: string;
      limit?: number;
    };

    try {
      // Generate embedding for query
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      // Build filter
      const filter: any = {};
      if (project) {
        filter.must = filter.must || [];
        filter.must.push({ key: 'project', match: { value: project } });
      }
      if (platform) {
        filter.must = filter.must || [];
        filter.must.push({ key: 'platform', match: { value: platform } });
      }

      // Search Qdrant
      const vectorResults = await qdrant.search('prompts', {
        vector: queryEmbedding,
        limit: limit,
        score_threshold: 0.7,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
      });

      // Get full conversation details
      const conversationIds = vectorResults.map(r => r.id);
      if (conversationIds.length === 0) {
        return {
          content: [{ type: 'text', text: 'No matching conversations found.' }],
        };
      }

      const result = await db.query(
        `SELECT * FROM v_conversation_details WHERE id = ANY($1::uuid[])`,
        [conversationIds]
      );

      const conversations = result.rows;

      // Format for LLM
      const formatted = conversations
        .map((c, i) => {
          const score = vectorResults.find(v => v.id === c.id)?.score || 0;
          return `
**Conversation ${i + 1}** (ID: ${c.id.substring(0, 8)})
- **Platform**: ${c.platform}
- **Project**: ${c.project || 'N/A'}
- **Date**: ${new Date(c.started_at).toLocaleDateString()}
- **Similarity**: ${(score * 100).toFixed(1)}%
- **Topics**: ${(c.topics || []).join(', ') || 'None'}

**User Prompt:**
${c.user_prompt?.substring(0, 300) || 'N/A'}${c.user_prompt?.length > 300 ? '...' : ''}

---
`;
        })
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${conversations.length} relevant conversations:\n\n${formatted}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error searching conversations: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'get_conversation') {
    const { conversation_id } = args as { conversation_id: string };

    try {
      const result = await db.query(
        `SELECT
          c.*,
          (SELECT json_agg(m ORDER BY m.sequence_number)
           FROM messages m WHERE m.conversation_id = c.id) as messages
         FROM conversations c
         WHERE c.id = $1`,
        [conversation_id]
      );

      if (result.rows.length === 0) {
        return {
          content: [{ type: 'text', text: 'Conversation not found.' }],
        };
      }

      const conv = result.rows[0];
      const messages = conv.messages || [];

      const formatted = `
# Conversation Details

**ID**: ${conv.id}
**Platform**: ${conv.platform}
**Project**: ${conv.project || 'N/A'}
**Date**: ${new Date(conv.started_at).toLocaleString()}
**Message Count**: ${conv.message_count}
**Topics**: ${(conv.topics || []).join(', ') || 'None'}

## Messages

${messages
  .map(
    (m: any, i: number) => `
### ${i + 1}. ${m.role.toUpperCase()}
${m.content || m.content_summary || 'N/A'}
`
  )
  .join('\n---\n')}
`;

      return {
        content: [{ type: 'text', text: formatted }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting conversation: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === 'get_trending_topics') {
    try {
      const result = await db.query(`
        SELECT topic_name, usage_count, recent_count
        FROM trending_topics
        LIMIT 20
      `);

      const formatted = result.rows
        .map(
          (r, i) => `${i + 1}. **${r.topic_name}** (${r.usage_count} total, ${r.recent_count} recent)`
        )
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `# Trending Topics\n\n${formatted}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting topics: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

// Register available tools
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'search_conversations',
        description:
          'Search through all AI conversation history using natural language queries. Returns semantically similar conversations.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural language search query (e.g., "find prompts about MCP configuration")',
            },
            project: {
              type: 'string',
              description: 'Filter by project name (optional)',
            },
            platform: {
              type: 'string',
              description: 'Filter by platform (claude-code, openai, gemini, etc.) (optional)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 10)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_conversation',
        description: 'Get full details of a specific conversation by ID',
        inputSchema: {
          type: 'object',
          properties: {
            conversation_id: {
              type: 'string',
              description: 'UUID of the conversation',
            },
          },
          required: ['conversation_id'],
        },
      },
      {
        name: 'get_trending_topics',
        description: 'Get the most popular topics across all conversations',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Start server
async function main() {
  console.error('Starting Prompt Harvester MCP server...');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
