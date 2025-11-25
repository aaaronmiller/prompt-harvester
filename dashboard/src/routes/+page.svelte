<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type Conversation } from '$lib/api';
  import ConversationCard from '$lib/components/ConversationCard.svelte';

  let recentConversations: Conversation[] = [];
  let stats = {
    total: 0,
    embedded: 0,
    pending: 0,
    failed: 0,
  };
  let loading = true;

  onMount(async () => {
    try {
      // Load recent conversations
      const response = await api.getConversations({}, 10);
      recentConversations = response.results;

      // Load embedding stats
      stats = await api.getEmbeddingStats();
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Dashboard - Prompt Harvester</title>
</svelte:head>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Dashboard</h1>
    <p class="text-gray-600 dark:text-gray-400">
      Overview of your AI conversation history and system status
    </p>
  </div>

  <!-- Stats Cards -->
  <div class="grid grid-cols-4 gap-6 mb-8">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-gray-600 dark:text-gray-400">Total Conversations</p>
          <p class="text-3xl font-bold text-gray-900 dark:text-white mt-2">
            {stats.total.toLocaleString()}
          </p>
        </div>
        <div class="text-4xl">💬</div>
      </div>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-gray-600 dark:text-gray-400">Embedded</p>
          <p class="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
            {stats.embedded.toLocaleString()}
          </p>
          <p class="text-xs text-gray-500 mt-1">
            {stats.total > 0 ? ((stats.embedded / stats.total) * 100).toFixed(1) : 0}%
          </p>
        </div>
        <div class="text-4xl">✅</div>
      </div>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-gray-600 dark:text-gray-400">Pending</p>
          <p class="text-3xl font-bold text-yellow-600 dark:text-yellow-400 mt-2">
            {stats.pending.toLocaleString()}
          </p>
        </div>
        <div class="text-4xl">⏳</div>
      </div>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-gray-600 dark:text-gray-400">Failed</p>
          <p class="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">
            {stats.failed.toLocaleString()}
          </p>
        </div>
        <div class="text-4xl">❌</div>
      </div>
    </div>
  </div>

  <!-- Quick Actions -->
  <div class="grid grid-cols-3 gap-6 mb-8">
    <a
      href="/search"
      class="bg-primary-600 hover:bg-primary-700 text-white rounded-lg shadow-md p-6 transition-colors"
    >
      <div class="text-3xl mb-3">🔍</div>
      <h3 class="text-xl font-bold mb-2">Search Conversations</h3>
      <p class="text-sm opacity-90">Find conversations using semantic or full-text search</p>
    </a>

    <a
      href="/analytics"
      class="bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-md p-6 transition-colors"
    >
      <div class="text-3xl mb-3">📈</div>
      <h3 class="text-xl font-bold mb-2">View Analytics</h3>
      <p class="text-sm opacity-90">Explore usage trends and statistics</p>
    </a>

    <a
      href="/export"
      class="bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-md p-6 transition-colors"
    >
      <div class="text-3xl mb-3">💾</div>
      <h3 class="text-xl font-bold mb-2">Export Data</h3>
      <p class="text-sm opacity-90">Download conversations in various formats</p>
    </a>
  </div>

  <!-- Recent Conversations -->
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Recent Conversations</h2>
      <a href="/search" class="text-primary-600 dark:text-primary-400 hover:underline">
        View All →
      </a>
    </div>

    {#if loading}
      <div class="text-center py-12">
        <p class="text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    {:else if recentConversations.length > 0}
      <div class="space-y-4">
        {#each recentConversations as conversation}
          <ConversationCard {conversation} />
        {/each}
      </div>
    {:else}
      <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
        <p class="text-gray-500 dark:text-gray-400">No conversations found.</p>
        <p class="text-sm text-gray-400 dark:text-gray-500 mt-2">
          Start by capturing some conversations!
        </p>
      </div>
    {/if}
  </div>
</div>
