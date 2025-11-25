<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';

  let templates: any[] = [];
  let loading = true;

  onMount(async () => {
    try {
      templates = await api.getTemplates();
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      loading = false;
    }
  });

  function getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      debugging: '🐛',
      testing: '🧪',
      creation: '✨',
      refactoring: '♻️',
      explanation: '📚',
      configuration: '⚙️',
      general: '📝',
    };
    return icons[category] || '📝';
  }

  function getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
      debugging: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
      testing: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      creation: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      refactoring: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300',
      explanation: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300',
      configuration: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300',
      general: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    };
    return colors[category] || colors.general;
  }
</script>

<svelte:head>
  <title>Templates - Prompt Harvester</title>
</svelte:head>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Prompt Templates</h1>
    <p class="text-gray-600 dark:text-gray-400">
      Reusable prompt patterns extracted from your conversation history
    </p>
  </div>

  {#if loading}
    <div class="text-center py-12">
      <p class="text-gray-500 dark:text-gray-400">Loading templates...</p>
    </div>
  {:else if templates.length > 0}
    <div class="space-y-4">
      {#each templates as template}
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <!-- Header -->
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center gap-3">
              <span class="text-2xl">{getCategoryIcon(template.category)}</span>
              <div>
                <div class="flex items-center gap-2">
                  <span
                    class="px-2 py-1 text-xs font-semibold rounded {getCategoryColor(
                      template.category
                    )}"
                  >
                    {template.category}
                  </span>
                  <span class="text-sm text-gray-500 dark:text-gray-400">
                    Used {template.occurrences} times
                  </span>
                </div>
              </div>
            </div>
            {#if template.effectiveness_score}
              <div class="text-right">
                <div class="text-sm text-gray-500 dark:text-gray-400">Effectiveness</div>
                <div class="text-lg font-bold text-green-600 dark:text-green-400">
                  {(template.effectiveness_score * 100).toFixed(0)}%
                </div>
              </div>
            {/if}
          </div>

          <!-- Pattern -->
          <div class="mb-4">
            <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
              Pattern
            </h3>
            <code
              class="block p-3 bg-gray-50 dark:bg-gray-900 rounded text-sm font-mono text-gray-800 dark:text-gray-200"
            >
              {template.pattern}
            </code>
          </div>

          <!-- Parameterized Version -->
          {#if template.parameterized_pattern && template.parameterized_pattern !== template.pattern}
            <div class="mb-4">
              <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                Template
              </h3>
              <code
                class="block p-3 bg-blue-50 dark:bg-blue-900/20 rounded text-sm font-mono text-blue-800 dark:text-blue-200"
              >
                {template.parameterized_pattern}
              </code>
            </div>
          {/if}

          <!-- Actions -->
          <div class="flex gap-3">
            <button
              class="px-4 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors"
              on:click={() => navigator.clipboard.writeText(template.pattern)}
            >
              📋 Copy Pattern
            </button>
            {#if template.parameterized_pattern}
              <button
                class="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                on:click={() => navigator.clipboard.writeText(template.parameterized_pattern)}
              >
                📄 Copy Template
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
      <p class="text-gray-500 dark:text-gray-400">No templates extracted yet.</p>
      <p class="text-sm text-gray-400 dark:text-gray-500 mt-2">
        Templates are automatically extracted from conversations that occur multiple times.
      </p>
    </div>
  {/if}
</div>
