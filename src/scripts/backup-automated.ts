#!/usr/bin/env bun

/**
 * Automated Backup Script - Phase 4.2
 * Creates daily/weekly backups with retention policy
 */

import { Pool } from 'pg';
import { ExportService } from '../export-service';
import { mkdir, readdir, stat, unlink } from 'fs/promises';
import { existsSync } from 'fs';

const db = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/prompt_harvester',
});

const exportService = new ExportService(db);

interface BackupConfig {
  type: 'daily' | 'weekly';
  retention: {
    daily: number; // Keep last N daily backups
    weekly: number; // Keep last N weekly backups
    monthly: number; // Keep last N monthly backups
  };
  backupPath: string;
}

const config: BackupConfig = {
  type: process.argv[2] === 'weekly' ? 'weekly' : 'daily',
  retention: {
    daily: parseInt(process.env.BACKUP_RETENTION_DAILY || '7'),
    weekly: parseInt(process.env.BACKUP_RETENTION_WEEKLY || '4'),
    monthly: parseInt(process.env.BACKUP_RETENTION_MONTHLY || '12'),
  },
  backupPath: process.env.BACKUP_PATH || './backups',
};

async function main() {
  console.log(`🔄 Starting ${config.type} backup...`);

  // Ensure backup directory exists
  if (!existsSync(config.backupPath)) {
    await mkdir(config.backupPath, { recursive: true });
    console.log(`✅ Created backup directory: ${config.backupPath}`);
  }

  // Create backup filename with timestamp
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const filename = `${config.backupPath}/backup-${config.type}-${timestamp}.zip`;

  try {
    // Create backup
    await exportService.createBackup(filename);
    console.log(`✅ Backup created: ${filename}`);

    // Get file size
    const stats = await stat(filename);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`📦 Backup size: ${sizeMB} MB`);

    // Cleanup old backups
    const cleaned = await cleanupOldBackups(config);
    console.log(`🗑️  Cleaned up ${cleaned} old backups`);

    // Log backup info to database
    await logBackup(filename, stats.size, config.type);

    console.log(`✅ ${config.type} backup completed successfully!`);
  } catch (error) {
    console.error(`❌ Backup failed:`, error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

async function cleanupOldBackups(config: BackupConfig): Promise<number> {
  const files = await readdir(config.backupPath);
  const backupFiles = files.filter((f) => f.startsWith('backup-') && f.endsWith('.zip'));

  // Group by type
  const dailyBackups = backupFiles
    .filter((f) => f.includes('-daily-'))
    .sort()
    .reverse();
  const weeklyBackups = backupFiles
    .filter((f) => f.includes('-weekly-'))
    .sort()
    .reverse();

  let deleted = 0;

  // Clean up old daily backups
  if (dailyBackups.length > config.retention.daily) {
    const toDelete = dailyBackups.slice(config.retention.daily);
    for (const file of toDelete) {
      await unlink(`${config.backupPath}/${file}`);
      console.log(`  Deleted old daily backup: ${file}`);
      deleted++;
    }
  }

  // Clean up old weekly backups
  if (weeklyBackups.length > config.retention.weekly) {
    const toDelete = weeklyBackups.slice(config.retention.weekly);
    for (const file of toDelete) {
      await unlink(`${config.backupPath}/${file}`);
      console.log(`  Deleted old weekly backup: ${file}`);
      deleted++;
    }
  }

  return deleted;
}

async function logBackup(filename: string, size: number, type: string): Promise<void> {
  try {
    await db.query(
      `CREATE TABLE IF NOT EXISTS backup_log (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        backup_type VARCHAR(20) NOT NULL,
        size_bytes BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        status VARCHAR(20) DEFAULT 'success'
      )`
    );

    await db.query(
      `INSERT INTO backup_log (filename, backup_type, size_bytes) VALUES ($1, $2, $3)`,
      [filename, type, size]
    );
  } catch (error) {
    console.warn('Failed to log backup to database:', error);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
