#!/bin/bash

# Setup automated cron jobs for Prompt Harvester

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Setting up automated tasks for Prompt Harvester"
echo "Project directory: $PROJECT_DIR"
echo ""

# Create cron entries
CRON_ENTRIES="
# Prompt Harvester Automated Tasks

# Generate embeddings for new conversations (every hour)
0 * * * * cd $PROJECT_DIR && bun run embeddings:batch --limit=50 >> $PROJECT_DIR/logs/embeddings.log 2>&1

# Extract topics from conversations (daily at 2 AM)
0 2 * * * cd $PROJECT_DIR && bun run src/scripts/extract-topics.ts --limit=100 >> $PROJECT_DIR/logs/topics.log 2>&1

# Build conversation relationships (weekly on Sunday at 3 AM)
0 3 * * 0 cd $PROJECT_DIR && bun run src/scripts/build-relationships.ts --limit=500 >> $PROJECT_DIR/logs/relationships.log 2>&1

# Extract prompt templates (weekly on Sunday at 4 AM)
0 4 * * 0 cd $PROJECT_DIR && bun run src/scripts/extract-templates.ts >> $PROJECT_DIR/logs/templates.log 2>&1

# Daily backup (every day at 1 AM)
0 1 * * * cd $PROJECT_DIR && bun run src/scripts/backup-automated.ts daily >> $PROJECT_DIR/logs/backup.log 2>&1

# Weekly backup (every Sunday at 5 AM)
0 5 * * 0 cd $PROJECT_DIR && bun run src/scripts/backup-automated.ts weekly >> $PROJECT_DIR/logs/backup.log 2>&1
"

# Create logs directory
mkdir -p "$PROJECT_DIR/logs"

echo "Cron entries to add:"
echo "$CRON_ENTRIES"
echo ""

# Option to automatically add to crontab
read -p "Add these entries to crontab? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Get current crontab
    (crontab -l 2>/dev/null; echo "$CRON_ENTRIES") | crontab -
    echo "✅ Cron jobs added successfully!"
    echo ""
    echo "View current crontab with: crontab -l"
    echo "Edit crontab with: crontab -e"
else
    echo "To add manually, run: crontab -e"
    echo "Then paste the entries shown above."
fi

echo ""
echo "Log files will be created in: $PROJECT_DIR/logs/"
echo ""
echo "Manual commands:"
echo "  bun run embeddings:batch          # Generate embeddings"
echo "  bun run src/scripts/extract-topics.ts      # Extract topics"
echo "  bun run src/scripts/backup-automated.ts daily   # Run backup"
