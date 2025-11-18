---
title: Prompt Harvester Quick Start Script
date: 2025-11-15 00:00:00 PST
ver: 1.0.0
author: The Telekinetic Carrot
model: claude-sonnet-4-5-20250929
tags: [bash, setup-script, automation, installation, quick-start]
---

#!/usr/bin/env bash

set -e

echo "🌾 Prompt Harvester - Quick Start Setup"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

command -v bun >/dev/null 2>&1 || {
    echo -e "${RED}✗ Bun is not installed${NC}"
    echo "Install with: curl -fsSL https://bun.sh/install | bash"
    exit 1
}
echo -e "${GREEN}✓ Bun installed${NC}"

command -v psql >/dev/null 2>&1 || {
    echo -e "${YELLOW}⚠ PostgreSQL not found, please install it${NC}"
    echo "macOS: brew install postgresql@15"
    echo "Linux: apt-get install postgresql-15"
}

command -v docker >/dev/null 2>&1 || {
    echo -e "${YELLOW}⚠ Docker not found (needed for Qdrant)${NC}"
}

# Setup project directory
echo ""
echo "📁 Setting up project directory..."
PROJECT_DIR="${HOME}/prompt-harvester"
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# Create directory structure
mkdir -p {src,data,imports,logs}

echo -e "${GREEN}✓ Project directory created at ${PROJECT_DIR}${NC}"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
cat > package.json << 'EOF'
{
  "name": "prompt-harvester",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "bun run src/api-server.ts",
    "parse": "bun run src/claude-code-parser.ts",
    "db:setup": "psql -d prompt_harvester -f schema.sql"
  },
  "dependencies": {
    "hono": "latest",
    "@qdrant/js-client-rest": "latest",
    "pg": "latest"
  },
  "devDependencies": {
    "@types/pg": "latest",
    "bun-types": "latest"
  }
}
EOF

bun install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Create .env file
echo ""
echo "⚙️  Creating environment configuration..."
cat > .env << 'EOF'
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=prompt_harvester
POSTGRES_USER=postgres
POSTGRES_PASSWORD=

# Vector Database
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=

# API
PORT=3000
LOG_LEVEL=info

# Embeddings (optional)
OPENAI_API_KEY=
EMBEDDING_MODEL=text-embedding-3-small
EOF

echo -e "${GREEN}✓ Environment file created${NC}"
echo -e "${YELLOW}  → Edit .env to configure your settings${NC}"

# Database setup
echo ""
echo "🗄️  Setting up PostgreSQL database..."
read -p "Create database 'prompt_harvester'? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    createdb prompt_harvester 2>/dev/null || echo "Database may already exist"
    
    # Copy schema if it exists
    if [ -f "../schema.sql" ]; then
        cp ../schema.sql .
        psql prompt_harvester < schema.sql
        echo -e "${GREEN}✓ Database schema loaded${NC}"
    else
        echo -e "${YELLOW}⚠ schema.sql not found, skipping schema setup${NC}"
    fi
fi

# Qdrant setup
echo ""
echo "🔍 Setting up Qdrant vector database..."
read -p "Start Qdrant via Docker? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker run -d -p 6333:6333 -p 6334:6334 \
        --name qdrant \
        -v "$(pwd)/data/qdrant_storage:/qdrant/storage:z" \
        qdrant/qdrant
    
    echo -e "${GREEN}✓ Qdrant started${NC}"
    echo -e "${YELLOW}  → Access at http://localhost:6333/dashboard${NC}"
fi

# Copy source files
echo ""
echo "📝 Copying source files..."
if [ -d "../prompt-harvester-architecture" ]; then
    cp ../prompt-harvester-architecture/*.ts src/ 2>/dev/null || true
    cp ../prompt-harvester-architecture/*.js src/ 2>/dev/null || true
    cp ../prompt-harvester-architecture/*.json . 2>/dev/null || true
    echo -e "${GREEN}✓ Source files copied${NC}"
else
    echo -e "${YELLOW}⚠ Source files not found, you'll need to copy them manually${NC}"
fi

# Create systemd service (macOS - launchd)
echo ""
echo "🔄 Creating launch daemon (macOS)..."
cat > ~/Library/LaunchAgents/com.promptharvester.api.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.promptharvester.api</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(which bun)</string>
        <string>run</string>
        <string>${PROJECT_DIR}/src/api-server.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${PROJECT_DIR}/logs/api.log</string>
    <key>StandardErrorPath</key>
    <string>${PROJECT_DIR}/logs/api.error.log</string>
</dict>
</plist>
EOF

echo -e "${GREEN}✓ Launch daemon created${NC}"
echo -e "${YELLOW}  → Load with: launchctl load ~/Library/LaunchAgents/com.promptharvester.api.plist${NC}"

# Summary
echo ""
echo "================================================================"
echo -e "${GREEN}✅ Setup complete!${NC}"
echo "================================================================"
echo ""
echo "📍 Project location: ${PROJECT_DIR}"
echo ""
echo "🚀 Next steps:"
echo ""
echo "1. Configure your environment:"
echo "   nano ${PROJECT_DIR}/.env"
echo ""
echo "2. Start the API server:"
echo "   cd ${PROJECT_DIR}"
echo "   bun run dev"
echo ""
echo "3. Install browser extension:"
echo "   - Chrome: Load unpacked from browser-extension directory"
echo "   - Configure backend URL in extension popup"
echo ""
echo "4. Parse existing Claude Code history:"
echo "   bun run parse"
echo ""
echo "5. Test the API:"
echo "   curl http://localhost:3000/health"
echo ""
echo "================================================================"
echo ""
echo "📚 Documentation:"
echo "   README: ${PROJECT_DIR}/README.md"
echo "   Architecture: ${PROJECT_DIR}/system-architecture.md"
echo ""
echo "🌟 Happy harvesting!"
