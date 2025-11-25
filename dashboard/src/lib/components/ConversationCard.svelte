<script lang="ts">
  import type { Conversation } from '$lib/api';

  export let conversation: Conversation;
  export let showRelated = false;

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }

  function truncate(text: string | undefined, length: number = 300): string {
    if (!text) return 'N/A';
    return text.length > length ? text.substring(0, length) + '...' : text;
  }
</script>

<div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
  <!-- Header -->
  <div class="flex items-start justify-between mb-4">
    <div class="flex-1">
      <div class="flex items-center gap-2 mb-2">
        <span
          class="px-2 py-1 text-xs font-semibold rounded-full"
          class:bg-blue-100={conversation.platform === 'claude-code'}
          class:text-blue-800={conversation.platform === 'claude-code'}
          class:bg-green-100={conversation.platform === 'openai'}
          class:text-green-800={conversation.platform === 'openai'}
          class:bg-purple-100={conversation.platform === 'gemini'}
          class:text-purple-800={conversation.platform === 'gemini'}
          class:dark:bg-opacity-20={true}
        >
          {conversation.platform}
        </span>
        {#if conversation.project}
          <span class="text-sm font-medium text-gray-600 dark:text-gray-400">
            {conversation.project}
          </span>
        {/if}
        {#if conversation.similarity_score}
          <span class="ml-auto text-xs text-gray-500 dark:text-gray-400">
            {(conversation.similarity_score * 100).toFixed(1)}% match
          </span>
        {/if}
      </div>
      <time class="text-xs text-gray-500 dark:text-gray-400">
        {formatDate(conversation.started_at)}
      </time>
    </div>
  </div>

  <!-- User Prompt -->
  <div class="mb-4">
    <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
      User Prompt
    </h3>
    <p class="text-sm text-gray-800 dark:text-gray-200">
      {truncate(conversation.user_prompt)}
    </p>
  </div>

  <!-- Response Preview -->
  {#if conversation.last_response}
    <div class="mb-4">
      <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
        Response
      </h3>
      <p class="text-sm text-gray-600 dark:text-gray-300">
        {truncate(conversation.last_response, 200)}
      </p>
    </div>
  {/if}

  <!-- Topics -->
  {#if conversation.topics && conversation.topics.length > 0}
    <div class="flex flex-wrap gap-2 mb-4">
      {#each conversation.topics.slice(0, 5) as topic}
        <span
          class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
        >
          #{topic}
        </span>
      {/each}
      {#if conversation.topics.length > 5}
        <span class="text-xs text-gray-500">+{conversation.topics.length - 5} more</span>
      {/if}
    </div>
  {/if}

  <!-- Footer -->
  <div class="flex items-center justify-between pt-4 border-t dark:border-gray-700">
    <div class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
      <span>💬 {conversation.message_count} messages</span>
      <span>🎯 {conversation.total_tokens.toLocaleString()} tokens</span>
      {#if conversation.related_count && conversation.related_count > 0}
        <span>🔗 {conversation.related_count} related</span>
      {/if}
    </div>

    <a
      href="/conversation/{conversation.id}"
      class="text-sm text-primary-600 dark:text-primary-400 hover:underline"
    >
      View Details →
    </a>
  </div>

  <!-- Related Conversations -->
  {#if showRelated && conversation.related_count && conversation.related_count > 0}
    <div class="mt-4 pt-4 border-t dark:border-gray-700">
      <button
        class="text-sm text-primary-600 dark:text-primary-400 hover:underline"
        on:click={() => (window.location.href = `/conversation/${conversation.id}#related`)}
      >
        View {conversation.related_count} Related Conversations
      </button>
    </div>
  {/if}
</div>
