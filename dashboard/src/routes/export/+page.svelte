<script lang="ts">
  import { api, type SearchFilters } from '$lib/api';

  let format: 'markdown' | 'json' | 'csv' = 'markdown';
  let filters: SearchFilters = {};
  let exporting = false;

  async function handleExport() {
    exporting = true;
    try {
      const blob = await api.exportConversations(format, filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prompt-harvester-export-${Date.now()}.${format === 'markdown' ? 'md' : format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      exporting = false;
    }
  }
</script>

<svelte:head>
  <title>Export - Prompt Harvester</title>
</svelte:head>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Export Conversations</h1>
    <p class="text-gray-600 dark:text-gray-400">
      Download your conversation history in various formats
    </p>
  </div>

  <div class="max-w-2xl">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 space-y-6">
      <!-- Format Selection -->
      <div>
        <label class="block text-sm font-medium mb-3">Export Format</label>
        <div class="space-y-3">
          <label class="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            class:border-primary-600={format === 'markdown'}
            class:bg-primary-50={format === 'markdown'}
            class:dark:bg-primary-900/20={format === 'markdown'}
          >
            <input type="radio" bind:group={format} value="markdown" class="mt-1" />
            <div>
              <div class="font-medium">Markdown</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                Human-readable format with frontmatter and TOC
              </div>
            </div>
          </label>

          <label class="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            class:border-primary-600={format === 'json'}
            class:bg-primary-50={format === 'json'}
            class:dark:bg-primary-900/20={format === 'json'}
          >
            <input type="radio" bind:group={format} value="json" class="mt-1" />
            <div>
              <div class="font-medium">JSON</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                Machine-readable format for programmatic access
              </div>
            </div>
          </label>

          <label class="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            class:border-primary-600={format === 'csv'}
            class:bg-primary-50={format === 'csv'}
            class:dark:bg-primary-900/20={format === 'csv'}
          >
            <input type="radio" bind:group={format} value="csv" class="mt-1" />
            <div>
              <div class="font-medium">CSV</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">
                Spreadsheet-compatible format for analysis
              </div>
            </div>
          </label>
        </div>
      </div>

      <!-- Filters -->
      <div>
        <label class="block text-sm font-medium mb-3">Filters (Optional)</label>
        <div class="space-y-3">
          <div>
            <label class="block text-sm mb-1">Project</label>
            <input
              type="text"
              bind:value={filters.project}
              placeholder="e.g., my-project"
              class="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
            />
          </div>

          <div>
            <label class="block text-sm mb-1">Platform</label>
            <select
              bind:value={filters.platform}
              class="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
            >
              <option value="">All Platforms</option>
              <option value="claude-code">Claude Code</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm mb-1">From Date</label>
              <input
                type="date"
                bind:value={filters.dateFrom}
                class="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
            <div>
              <label class="block text-sm mb-1">To Date</label>
              <input
                type="date"
                bind:value={filters.dateTo}
                class="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Export Button -->
      <button
        on:click={handleExport}
        disabled={exporting}
        class="w-full px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {exporting ? '⏳ Exporting...' : '💾 Export Conversations'}
      </button>
    </div>

    <!-- Info Box -->
    <div class="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
      <h3 class="font-medium text-blue-900 dark:text-blue-200 mb-2">Export Information</h3>
      <ul class="text-sm text-blue-800 dark:text-blue-300 space-y-1">
        <li>• Exports include all metadata and conversation content</li>
        <li>• Large exports may take a few moments to generate</li>
        <li>• Filtered exports only include matching conversations</li>
        <li>• Consider using JSON for programmatic access</li>
      </ul>
    </div>
  </div>
</div>
