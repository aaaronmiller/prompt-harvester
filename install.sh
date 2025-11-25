#!/bin/bash

# Prompt Harvester Phase 2/3 Installation Script

set -e

echo "🚀 Prompt Harvester Phase 2/3 Installation"
echo "==========================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Please install from https://bun.sh"
    exit 1
fi
echo "✅ Bun found: $(bun --version)"

if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL client not found"
    exit 1
fi
echo "✅ PostgreSQL client found"

# Check if Qdrant is running
if ! curl -s http://localhost:6333/health > /dev/null; then
    echo "⚠️  Qdrant is not running on localhost:6333"
    echo "   Would you like to start Qdrant with Docker? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "Starting Qdrant..."
        docker pull qdrant/qdrant
        docker run -d -p 6333:6333 -p 6334:6334 \
          -v $(pwd)/qdrant_storage:/qdrant/storage \
          --name prompt-harvester-qdrant \
          qdrant/qdrant
        echo "✅ Qdrant started"
    else
        echo "Please start Qdrant manually before continuing"
        exit 1
    fi
else
    echo "✅ Qdrant is running"
fi

# Install dependencies
echo ""
echo "Installing dependencies..."
bun install

# Setup environment
if [ ! -f .env ]; then
    echo ""
    echo "Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit .env and configure your settings"
    echo "   Especially: DATABASE_URL, EMBEDDING_MODE, and API keys if using cloud mode"
fi

# Update database schema
echo ""
echo "Would you like to update the database schema? (y/n)"
read -r response
if [[ "$response" =~ ^[Yy]$ ]]; then
    echo "Updating database schema..."
    psql -d prompt_harvester -f schema.sql
    echo "✅ Database schema updated"
fi

# Make scripts executable
chmod +x mcp-server/server.ts
chmod +x src/scripts/*.ts

echo ""
echo "✅ Installation complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env and configure your settings"
echo "2. Run: bun run embeddings:batch     # Generate embeddings"
echo "3. Run: bun run src/scripts/extract-topics.ts  # Extract topics"
echo "4. Follow PHASE2_SETUP.md for complete setup guide"
echo ""
echo "To start the MCP server for Claude integration:"
echo "Add to ~/.config/claude/mcp_config.json:"
echo '{"mcpServers": {"prompt-harvester": {"command": "bun", "args": ["run", "'$(pwd)'/mcp-server/server.ts"]}}}'
echo ""
