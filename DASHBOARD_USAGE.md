# Dashboard User Guide

Complete guide to using the Prompt Harvester web dashboard.

## Getting Started

### Accessing the Dashboard

```bash
# Development mode
cd dashboard
npm run dev

# Production mode
npm run build
npm run preview
```

Visit: http://localhost:5173

### First Time Setup

1. Ensure API server is running on http://localhost:3000
2. Database schema is loaded (see PHASE2_SETUP.md)
3. At least some conversations have been captured

## Dashboard Overview

### Home Page

The dashboard home page provides:
- **Statistics Cards**: Total conversations, embedding status, pending/failed counts
- **Quick Actions**: Fast access to search, analytics, and export
- **Recent Conversations**: Latest 10 conversations with full details

**Keyboard Shortcuts:**
- `Cmd+K` / `Ctrl+K`: Quick search
- `Cmd+N`: New search
- `Cmd+E`: Export conversations

### Dark Mode

Toggle between light and dark mode:
- Click the sun/moon icon in the sidebar
- Preference is saved to localStorage
- Respects system preferences on first visit

## Features

### 1. Search Conversations

**Location**: Search icon in sidebar

#### Search Modes

**Hybrid Search** (Recommended)
- Combines vector similarity and full-text search
- Best overall results
- Balanced between semantic understanding and keyword matching

**Semantic Search**
- Uses AI embeddings to find conceptually similar conversations
- Great for: "Find conversations about authentication"
- Understands intent and context

**Full-Text Search**
- Traditional keyword search
- Great for: exact function names, error messages
- Fast and precise for known terms

#### Using Filters

Click "▶ Advanced Filters" to show filter panel:

- **Project**: Filter by project name (e.g., "my-app")
- **Platform**: claude-code, openai, gemini
- **Date From/To**: Limit results to date range

**Tips:**
- Use semantic search for concepts: "authentication implementation"
- Use full-text for specifics: "createUser function"
- Combine filters to narrow results
- Results show similarity percentage for semantic search

### 2. Conversation Details

Click "View Details →" on any conversation card.

**Features:**
- Full conversation thread with all messages
- Topics and tags
- Related conversations
- Token usage and platform info
- Export single conversation

**Relationship Graph:**
- Interactive D3.js visualization
- Shows connected conversations
- Color-coded by relationship type:
  - 🟢 Green: Builds On
  - 🟡 Yellow: Solves Same Problem
  - 🔵 Blue: References
  - 🔴 Red: Contradicts
  - ⚪ Gray: Related

**Interactions:**
- Drag nodes to rearrange
- Hover for details
- Click to navigate to related conversation

### 3. Analytics

**Location**: Analytics icon in sidebar

#### Token Usage Chart
- Line chart showing daily token consumption
- Last 30 days by default
- Aggregated across all platforms
- Hover for exact values

#### Platform Distribution
- Doughnut chart showing conversation count by platform
- Color-coded for easy identification
- Click legend to toggle platforms

#### Platform Efficiency Table

Metrics per platform:
- **Total Conversations**: Count of conversations
- **Avg Tokens**: Average tokens per conversation
- **Success Rate**: % of conversations without follow-up problems

#### Trending Topics

- Top 20 most used topics
- Usage count (total)
- Recent count (last 7 days)
- Green arrow indicates active topics

### 4. Topics

**Location**: Topics icon in sidebar

**Features:**
- Complete list of all extracted topics
- Usage statistics for each topic
- Category classification
- Filter conversations by topic

**Topic Categories:**
- 🐛 Debugging
- 🧪 Testing
- ✨ Creation
- ♻️ Refactoring
- 📚 Explanation
- ⚙️ Configuration
- 📝 General

### 5. Prompt Templates

**Location**: Templates icon in sidebar

**What are Templates?**
Templates are reusable prompt patterns automatically extracted from your conversation history.

**Template Components:**
- **Pattern**: Original prompt text
- **Template**: Parameterized version with placeholders
- **Category**: Auto-categorized (debugging, creation, etc.)
- **Occurrences**: How many times pattern appeared
- **Effectiveness**: Success rate (0-100%)

**Using Templates:**
1. Browse extracted templates
2. Click "📋 Copy Pattern" for original text
3. Click "📄 Copy Template" for parameterized version
4. Modify placeholders like `{language}`, `{task}`, `{framework}`

**Example:**
```
Pattern: Create a Python function to parse JSON data
Template: Create a {language} function to {task}
```

**Effectiveness Score:**
- Calculated based on follow-up conversations
- High score (>70%) = rarely needs clarification
- Low score (<50%) = often requires follow-ups

### 6. Export

**Location**: Export icon in sidebar

#### Export Formats

**Markdown**
- Human-readable format
- Includes frontmatter with metadata
- Table of contents
- Organized by project
- Great for documentation

**JSON**
- Machine-readable
- Complete metadata
- Programmatic access
- API integration

**CSV**
- Spreadsheet compatible
- Import to Excel/Google Sheets
- Data analysis
- Reporting

#### Export Process

1. Select format
2. (Optional) Apply filters:
   - Project name
   - Platform
   - Date range
3. Click "💾 Export Conversations"
4. File downloads automatically

**Export Sizes:**
- Small (<100 conversations): Instant
- Medium (100-1000): 1-5 seconds
- Large (1000+): 5-30 seconds

### 7. Navigation

**Sidebar Navigation:**
- Collapsible (click ◀/▶ button)
- Active page highlighted
- Icons for compact view
- Dark mode toggle at bottom

**Page Structure:**
- Fixed sidebar
- Scrollable main content
- Responsive design (works on mobile)

## Tips & Tricks

### Efficient Searching

1. **Start Broad**: Use semantic search with general terms
2. **Refine**: Add filters to narrow down
3. **Be Specific**: Switch to full-text for exact matches
4. **Save Common Searches**: Bookmark URLs with filters

### Finding Related Work

1. View any conversation detail
2. Scroll to relationship graph
3. Look for "builds_on" relationships
4. Follow the chain of related conversations

### Understanding Patterns

1. Go to Templates page
2. Sort by effectiveness score
3. Study high-performing patterns
4. Reuse successful prompt structures

### Organizing Conversations

Best practices:
- Use consistent project names
- Tag important conversations
- Rate conversation quality (1-5 stars)
- Review recurring problems weekly

## Keyboard Shortcuts

Global shortcuts (works on any page):

- `Cmd/Ctrl + K`: Focus search bar
- `Cmd/Ctrl + N`: New search (clears filters)
- `Cmd/Ctrl + E`: Open export page
- `Esc`: Clear current filters
- `←/→` Arrow keys: Navigate between pages (when applicable)

Search page shortcuts:
- `Enter`: Execute search
- `Tab`: Move between filter fields

## Performance

### Loading Times

- Dashboard home: <1 second
- Search results: <500ms (P95)
- Analytics: 1-2 seconds (loads multiple datasets)
- Templates: <1 second

### Optimization

For large datasets (>10K conversations):
- Use filters to limit results
- Semantic search is cached
- Infinite scroll on conversation lists
- Virtualized rendering for >100 items

## Troubleshooting

### Dashboard won't load

1. Check API server is running:
   ```bash
   curl http://localhost:3000/health
   ```

2. Check browser console (F12) for errors

3. Clear browser cache and reload

### Search returns no results

1. Verify conversations are in database:
   ```bash
   psql prompt_harvester -c "SELECT COUNT(*) FROM conversations"
   ```

2. Check if embeddings are generated:
   ```bash
   curl http://localhost:3000/api/embeddings/status
   ```

3. Try full-text search instead of semantic

### Slow performance

1. Check database connection
2. Ensure indexes are created (see schema.sql)
3. Limit search results (use filters)
4. Clear browser cache

### Charts not displaying

1. Ensure analytics data exists in database
2. Check browser console for JavaScript errors
3. Try refreshing the page
4. Verify Chart.js library loaded

## Advanced Usage

### URL Parameters

Share searches with URL parameters:

```
/search?q=authentication&mode=semantic&project=my-app
```

### API Integration

Dashboard uses REST API endpoints:

```javascript
// Search conversations
fetch('/api/search/hybrid', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'authentication',
    filters: { project: 'my-app' },
    limit: 20
  })
})
```

### Custom Themes

Modify `dashboard/tailwind.config.js` for custom colors:

```javascript
theme: {
  extend: {
    colors: {
      primary: {
        600: '#your-color',
        // ...
      }
    }
  }
}
```

## Data Privacy

- All data stays on your server
- No external tracking or analytics
- Embeddings generated locally or via OpenAI (configurable)
- Exports contain your data only
- Dark mode preference stored in localStorage only

## Updates

Dashboard updates automatically when:
- New conversations are captured
- Embeddings are generated
- Topics are extracted
- Relationships are mapped

Refresh the page to see latest data.

---

For technical setup, see [PHASE2_SETUP.md](./PHASE2_SETUP.md)
For deployment, see [DEPLOYMENT.md](./DEPLOYMENT.md)
For troubleshooting, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
