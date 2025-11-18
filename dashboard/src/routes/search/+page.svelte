<script lang="ts">
  import SearchInterface from '$lib/components/SearchInterface.svelte';
</script>

<svelte:head>
  <title>Search - Prompt Harvester</title>
</svelte:head>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Search Conversations</h1>
    <p class="text-gray-600 dark:text-gray-400">
      Use semantic, full-text, or hybrid search to find relevant conversations
    </p>
  </div>

  <SearchInterface />
</div>
