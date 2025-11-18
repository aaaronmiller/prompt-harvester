---
title: Prompt Harvester PostgreSQL Schema
date: 2025-11-15 00:00:00 PST
ver: 1.0.0
author: The Telekinetic Carrot
model: claude-sonnet-4-5-20250929
tags: [postgresql, database-schema, sql, migrations, indexes, full-text-search]
---

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Conversations: Top-level conversation containers
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source information
    platform VARCHAR(50) NOT NULL CHECK (platform IN (
        'claude-code', 'claude-web', 'openai', 'gemini', 'anthropic-api', 'other'
    )),
    model VARCHAR(100),
    source_id VARCHAR(500), -- Original ID from source system
    
    -- Project and categorization
    project VARCHAR(200),
    detected_language VARCHAR(50), -- Primary programming language if code-heavy
    
    -- Timestamps
    started_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    last_synced_at TIMESTAMP DEFAULT NOW(),
    
    -- Statistics
    message_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    total_size_bytes BIGINT DEFAULT 0,
    
    -- Flexible metadata
    metadata JSONB DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Prevent duplicates from same source
    UNIQUE(platform, source_id)
);

-- Indexes for conversations
CREATE INDEX idx_conversations_project ON conversations(project) WHERE project IS NOT NULL;
CREATE INDEX idx_conversations_platform ON conversations(platform);
CREATE INDEX idx_conversations_started_at ON conversations(started_at DESC);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX idx_conversations_model ON conversations(model);
CREATE INDEX idx_conversations_metadata ON conversations USING GIN(metadata);
CREATE INDEX idx_conversations_language ON conversations(detected_language) WHERE detected_language IS NOT NULL;

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    
    -- Message details
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    sequence_number INTEGER NOT NULL, -- Order within conversation
    
    -- Content storage
    content TEXT, -- For small messages (< 10KB for user, < 5KB for assistant)
    content_summary TEXT, -- AI-generated summary for large messages
    content_tail TEXT, -- Last 50-100 lines for large messages
    content_size INTEGER NOT NULL,
    content_location VARCHAR(500), -- R2 path: r2://bucket/path/to/message.txt
    
    -- Content type flags
    has_code BOOLEAN DEFAULT FALSE,
    has_mermaid BOOLEAN DEFAULT FALSE,
    has_images BOOLEAN DEFAULT FALSE,
    
    -- Timing
    timestamp TIMESTAMP NOT NULL,
    processing_time_ms INTEGER, -- For assistant messages
    
    -- Flexible metadata
    metadata JSONB DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Ensure ordering
    UNIQUE(conversation_id, sequence_number)
);

-- Indexes for messages
CREATE INDEX idx_messages_conversation ON messages(conversation_id, sequence_number);
CREATE INDEX idx_messages_role ON messages(role);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX idx_messages_metadata ON messages USING GIN(metadata);
CREATE INDEX idx_messages_has_code ON messages(has_code) WHERE has_code = TRUE;
CREATE INDEX idx_messages_size ON messages(content_size);

-- ============================================================================
-- TOPICS AND TAGGING
-- ============================================================================

CREATE TABLE topics (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) UNIQUE NOT NULL,
    category VARCHAR(100), -- 'technology', 'project', 'concept', etc.
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_topics_name ON topics(name);
CREATE INDEX idx_topics_category ON topics(category);
CREATE INDEX idx_topics_name_trgm ON topics USING GIN(name gin_trgm_ops); -- Fuzzy search

CREATE TABLE message_topics (
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
    extraction_method VARCHAR(50), -- 'keyword', 'llm', 'manual'
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (message_id, topic_id)
);

CREATE INDEX idx_message_topics_message ON message_topics(message_id);
CREATE INDEX idx_message_topics_topic ON message_topics(topic_id);
CREATE INDEX idx_message_topics_confidence ON message_topics(confidence DESC);

-- ============================================================================
-- CONVERSATION RELATIONSHIPS
-- ============================================================================

CREATE TABLE conversation_relationships (
    conversation_a UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    conversation_b UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    similarity_score FLOAT CHECK (similarity_score >= 0 AND similarity_score <= 1),
    relationship_type VARCHAR(50) CHECK (relationship_type IN (
        'similar', 'continuation', 'related', 'duplicate'
    )),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (conversation_a, conversation_b),
    CHECK (conversation_a < conversation_b) -- Prevent duplicates (a,b) vs (b,a)
);

CREATE INDEX idx_conv_rel_a ON conversation_relationships(conversation_a);
CREATE INDEX idx_conv_rel_b ON conversation_relationships(conversation_b);
CREATE INDEX idx_conv_rel_score ON conversation_relationships(similarity_score DESC);

-- ============================================================================
-- FULL-TEXT SEARCH
-- ============================================================================

CREATE TABLE message_search (
    message_id UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    search_vector tsvector NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_message_search_vector ON message_search USING GIN(search_vector);

-- Trigger to auto-update search vector
CREATE OR REPLACE FUNCTION update_message_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO message_search (message_id, search_vector)
    VALUES (
        NEW.id,
        setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.content_summary, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.metadata->>'topics', '')), 'C')
    )
    ON CONFLICT (message_id)
    DO UPDATE SET
        search_vector = EXCLUDED.search_vector,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_message_search
AFTER INSERT OR UPDATE OF content, content_summary, metadata
ON messages
FOR EACH ROW
EXECUTE FUNCTION update_message_search_vector();

-- ============================================================================
-- PROJECTS TABLE (Optional: for explicit project management)
-- ============================================================================

CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) UNIQUE NOT NULL,
    description TEXT,
    repository_url VARCHAR(500),
    keywords TEXT[], -- Array of keywords
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_projects_name ON projects(name);
CREATE INDEX idx_projects_keywords ON projects USING GIN(keywords);

-- ============================================================================
-- FILE REFERENCES (Track files mentioned in conversations)
-- ============================================================================

CREATE TABLE file_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_type VARCHAR(50), -- Extension or detected type
    action VARCHAR(50), -- 'created', 'modified', 'deleted', 'read'
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_file_refs_message ON file_references(message_id);
CREATE INDEX idx_file_refs_path ON file_references(file_path);
CREATE INDEX idx_file_refs_type ON file_references(file_type);

-- ============================================================================
-- TOOLS USED (Track which tools were used in conversations)
-- ============================================================================

CREATE TABLE tools_used (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    tool_name VARCHAR(200) NOT NULL,
    tool_parameters JSONB,
    execution_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tools_message ON tools_used(message_id);
CREATE INDEX idx_tools_name ON tools_used(tool_name);

-- ============================================================================
-- SYNC STATUS (Track what's been synced from various sources)
-- ============================================================================

CREATE TABLE sync_status (
    id SERIAL PRIMARY KEY,
    source VARCHAR(100) NOT NULL, -- 'claude-code', 'openai-export', etc.
    last_sync_at TIMESTAMP NOT NULL,
    last_item_id VARCHAR(500), -- Last processed item for incremental sync
    items_processed INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'success',
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sync_source ON sync_status(source);
CREATE INDEX idx_sync_last_sync ON sync_status(last_sync_at DESC);

-- ============================================================================
-- PROBLEM-SOLUTION PAIRS (Extracted from conversations)
-- ============================================================================

CREATE TABLE problem_solution_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    solution_message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    problem_description TEXT NOT NULL,
    solution_description TEXT NOT NULL,
    effectiveness_score FLOAT, -- If available from follow-up
    topics TEXT[],
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ps_problem ON problem_solution_pairs(problem_message_id);
CREATE INDEX idx_ps_solution ON problem_solution_pairs(solution_message_id);
CREATE INDEX idx_ps_topics ON problem_solution_pairs USING GIN(topics);

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View: Recent conversations with message counts
CREATE VIEW v_recent_conversations AS
SELECT 
    c.id,
    c.platform,
    c.model,
    c.project,
    c.started_at,
    c.updated_at,
    c.message_count,
    c.total_tokens,
    array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) as topics
FROM conversations c
LEFT JOIN messages m ON m.conversation_id = c.id
LEFT JOIN message_topics mt ON mt.message_id = m.id
LEFT JOIN topics t ON t.id = mt.topic_id
GROUP BY c.id
ORDER BY c.updated_at DESC;

-- View: User prompts with metadata
CREATE VIEW v_user_prompts AS
SELECT 
    m.id,
    m.conversation_id,
    c.platform,
    c.project,
    m.content,
    m.content_summary,
    m.timestamp,
    m.has_code,
    array_agg(DISTINCT t.name) FILTER (WHERE t.name IS NOT NULL) as topics
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
LEFT JOIN message_topics mt ON mt.message_id = m.id
LEFT JOIN topics t ON t.id = mt.topic_id
WHERE m.role = 'user'
GROUP BY m.id, c.platform, c.project
ORDER BY m.timestamp DESC;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function: Get conversation with all messages
CREATE OR REPLACE FUNCTION get_conversation_full(conv_id UUID)
RETURNS TABLE (
    conversation JSONB,
    messages JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        row_to_json(c)::JSONB as conversation,
        jsonb_agg(
            jsonb_build_object(
                'id', m.id,
                'role', m.role,
                'content', COALESCE(m.content, m.content_summary),
                'timestamp', m.timestamp,
                'has_code', m.has_code
            ) ORDER BY m.sequence_number
        ) as messages
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE c.id = conv_id
    GROUP BY c.id;
END;
$$ LANGUAGE plpgsql;

-- Function: Find conversations by topic
CREATE OR REPLACE FUNCTION find_by_topic(topic_name TEXT, limit_count INTEGER DEFAULT 20)
RETURNS TABLE (
    conversation_id UUID,
    platform VARCHAR,
    project VARCHAR,
    started_at TIMESTAMP,
    topic_match_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.platform,
        c.project,
        c.started_at,
        COUNT(DISTINCT mt.message_id) as topic_match_count
    FROM conversations c
    JOIN messages m ON m.conversation_id = c.id
    JOIN message_topics mt ON mt.message_id = m.id
    JOIN topics t ON t.id = mt.topic_id
    WHERE t.name ILIKE '%' || topic_name || '%'
    GROUP BY c.id, c.platform, c.project, c.started_at
    ORDER BY topic_match_count DESC, c.started_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Search messages using full-text search
CREATE OR REPLACE FUNCTION search_messages(query_text TEXT, limit_count INTEGER DEFAULT 50)
RETURNS TABLE (
    message_id UUID,
    conversation_id UUID,
    role VARCHAR,
    content_preview TEXT,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.conversation_id,
        m.role,
        LEFT(COALESCE(m.content, m.content_summary), 200) as content_preview,
        ts_rank(ms.search_vector, plainto_tsquery('english', query_text)) as rank
    FROM messages m
    JOIN message_search ms ON ms.message_id = m.id
    WHERE ms.search_vector @@ plainto_tsquery('english', query_text)
    ORDER BY rank DESC, m.timestamp DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SAMPLE QUERIES
-- ============================================================================

/*
-- Find all conversations about a specific project
SELECT * FROM conversations WHERE project = 'DataKiln';

-- Get all user prompts mentioning 'MCP server'
SELECT * FROM v_user_prompts WHERE content ILIKE '%MCP server%';

-- Search across all messages
SELECT * FROM search_messages('mcp server configuration', 20);

-- Find conversations by topic
SELECT * FROM find_by_topic('agent-skills', 10);

-- Get full conversation
SELECT * FROM get_conversation_full('some-uuid-here');

-- Find related conversations
SELECT 
    cr.conversation_b as related_conversation_id,
    c.project,
    c.started_at,
    cr.similarity_score
FROM conversation_relationships cr
JOIN conversations c ON c.id = cr.conversation_b
WHERE cr.conversation_a = 'some-uuid-here'
ORDER BY cr.similarity_score DESC;

-- Top topics across all conversations
SELECT 
    t.name,
    t.category,
    COUNT(DISTINCT mt.message_id) as message_count,
    COUNT(DISTINCT m.conversation_id) as conversation_count
FROM topics t
JOIN message_topics mt ON mt.topic_id = t.id
JOIN messages m ON m.id = mt.message_id
GROUP BY t.id, t.name, t.category
ORDER BY conversation_count DESC
LIMIT 50;

-- Recent conversations with their primary topics
SELECT 
    c.id,
    c.platform,
    c.project,
    c.started_at,
    c.message_count,
    array_agg(DISTINCT t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL) as topics
FROM conversations c
LEFT JOIN messages m ON m.conversation_id = c.id
LEFT JOIN message_topics mt ON mt.message_id = m.id
LEFT JOIN topics t ON t.id = mt.topic_id
WHERE c.started_at > NOW() - INTERVAL '7 days'
GROUP BY c.id
ORDER BY c.started_at DESC;
*/
