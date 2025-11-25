#!/usr/bin/env bun

/**
 * Topic Extraction Script
 * Extracts topics from conversations using NLP
 */

import { Pool } from 'pg';
import { NLPProcessor } from '../nlp-processor';

const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/prompt_harvester',
});

const nlpProcessor = new NLPProcessor(db);

async function main() {
  const limit = parseInt(process.argv[2] || '100');

  console.log(`Extracting topics from up to ${limit} conversations...\n`);

  const results = await nlpProcessor.batchProcess(limit);

  console.log(`\n✅ Topic extraction complete!`);
  console.log(`   Success: ${results.success}`);
  console.log(`   Failed: ${results.failed}`);

  // Show top topics
  const topicStats = await nlpProcessor.getTopicStats();
  console.log(`\n📊 Top 10 Topics:`);
  topicStats.slice(0, 10).forEach((topic, i) => {
    console.log(`   ${i + 1}. ${topic.topic_name} (${topic.usage_count} uses, ${topic.recent_count} recent)`);
  });

  // Update categories
  await nlpProcessor.updateTopicCategories();

  await db.end();
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
