#!/usr/bin/env bun

/**
 * Batch Embeddings Script
 * Processes conversations and generates embeddings
 */

import { Pool } from 'pg';
import { EmbeddingService } from '../embedding-service';

const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/prompt_harvester',
});

const embeddingService = new EmbeddingService(db, {
  mode: (process.env.EMBEDDING_MODE as 'cloud' | 'local') || 'local',
  openaiKey: process.env.OPENAI_API_KEY,
  qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
});

async function main() {
  const limit = parseInt(process.argv[2] || '100');

  console.log(`Processing up to ${limit} conversations...`);
  console.log(`Mode: ${process.env.EMBEDDING_MODE || 'local'}\n`);

  // Initialize Qdrant collection
  await embeddingService.initializeQdrant();

  // Process conversations
  const results = await embeddingService.batchProcessExisting(limit);

  console.log(`\n✅ Batch processing complete!`);
  console.log(`   Success: ${results.success}`);
  console.log(`   Failed: ${results.failed}`);

  // Show stats
  const stats = await embeddingService.getStats();
  console.log(`\n📊 Overall Statistics:`);
  console.log(`   Total: ${stats.total}`);
  console.log(`   Embedded: ${stats.embedded}`);
  console.log(`   Pending: ${stats.pending}`);
  console.log(`   Failed: ${stats.failed}`);

  await db.end();
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
