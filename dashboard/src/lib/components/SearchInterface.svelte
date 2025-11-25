<script lang="ts">
  import { api, type Conversation, type SearchFilters } from '$lib/api';
  import ConversationCard from './ConversationCard.svelte';

  let query = '';
  let mode: 'semantic' | 'fulltext' | 'hybrid' = 'hybrid';
  let results: Conversation[] = [];
  let loading = false;
  let error = '';

  // Filters
  let filters: SearchFilters = {};
  let showFilters = false;

  async function search() {
    if (!query.trim()) return;

    loading = true;
    error = '';

    try {
      const response = await api.searchConversations(query, mode, filters, 50);
      results = response.results;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Search failed';
      console.error('Search error:', e);
    } finally {
      loading = false;
    }
  }

  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      search();
    }
  }
</script>

<div class="space-y-6">
  <!-- Search Bar -->
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
    <div class="flex gap-3 mb-4">
      <input
        type="text"
        bind:value={query}
        on:keypress={handleKeyPress}
        placeholder="Search your AI conversations..."
        class="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
      />
      <button
        on:click={search}
        disabled={loading || !query.trim()}
        class="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? '🔄 Searching...' : '🔍 Search'}
      </button>
    </div>

    <!-- Search Mode Selection -->
    <div class="flex items-center gap-4 mb-4">
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Mode:</span>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="radio" bind:group={mode} value="hybrid" />
        <span class="text-sm">Hybrid (Recommended)</span>
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="radio" bind:group={mode} value="semantic" />
        <span class="text-sm">Semantic</span>
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="radio" bind:group={mode} value="fulltext" />
        <span class="text-sm">Full-Text</span>
      </label>
    </div>

    <!-- Filter Toggle -->
    <button
      on:click={() => (showFilters = !showFilters)}
      class="text-sm text-primary-600 dark:text-primary-400 hover:underline"
    >
      {showFilters ? '▼' : '▶'} Advanced Filters
    </button>

    <!-- Filters Panel -->
    {#if showFilters}
      <div class="mt-4 pt-4 border-t dark:border-gray-700 grid grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Project</label>
          <input
            type="text"
            bind:value={filters.project}
            placeholder="e.g., my-project"
            class="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Platform</label>
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
        <div>
          <label class="block text-sm font-medium mb-1">Date From</label>
          <input
            type="date"
            bind:value={filters.dateFrom}
            class="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
          />
        </div>
      </div>
    {/if}
  </div>

  <!-- Error Message -->
  {#if error}
    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
      <p class="text-red-800 dark:text-red-200">{error}</p>
    </div>
  {/if}

  <!-- Results -->
  {#if results.length > 0}
    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-gray-800 dark:text-white">
        Found {results.length} conversations
      </h2>
      {#each results as conversation}
        <ConversationCard {conversation} showRelated={true} />
      {/each}
    </div>
  {:else if !loading && query}
    <div class="text-center py-12 text-gray-500 dark:text-gray-400">
      <p class="text-lg">No conversations found matching your query.</p>
      <p class="text-sm mt-2">Try a different search term or adjust your filters.</p>
    </div>
  {/if}
</div>
