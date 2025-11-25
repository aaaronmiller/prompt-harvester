<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { darkMode } from '$lib/stores/theme';

  let isOpen = true;

  onMount(() => {
    // Check for saved dark mode preference
    const saved = localStorage.getItem('darkMode');
    if (saved) {
      darkMode.set(saved === 'true');
    }

    // Apply dark mode class
    darkMode.subscribe((value) => {
      if (value) {
        document.body.classList.add('dark');
      } else {
        document.body.classList.remove('dark');
      }
    });
  });

  function toggleDarkMode() {
    darkMode.update((v) => {
      const newValue = !v;
      localStorage.setItem('darkMode', String(newValue));
      return newValue;
    });
  }

  const navigation = [
    { name: 'Dashboard', href: '/', icon: '📊' },
    { name: 'Search', href: '/search', icon: '🔍' },
    { name: 'Analytics', href: '/analytics', icon: '📈' },
    { name: 'Topics', href: '/topics', icon: '🏷️' },
    { name: 'Templates', href: '/templates', icon: '📝' },
    { name: 'Export', href: '/export', icon: '💾' },
  ];
</script>

<div class="flex h-screen bg-gray-100 dark:bg-gray-900">
  <!-- Sidebar -->
  <aside
    class="w-64 bg-white dark:bg-gray-800 shadow-lg transition-all duration-300"
    class:w-20={!isOpen}
  >
    <div class="flex items-center justify-between p-4 border-b dark:border-gray-700">
      {#if isOpen}
        <h1 class="text-xl font-bold text-gray-800 dark:text-white">Prompt Harvester</h1>
      {/if}
      <button
        on:click={() => (isOpen = !isOpen)}
        class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        {isOpen ? '◀' : '▶'}
      </button>
    </div>

    <nav class="p-4 space-y-2">
      {#each navigation as item}
        <a
          href={item.href}
          class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors"
          class:bg-primary-100={$page.url.pathname === item.href}
          class:dark:bg-primary-900={$page.url.pathname === item.href}
          class:text-primary-700={$page.url.pathname === item.href}
          class:dark:text-primary-300={$page.url.pathname === item.href}
          class:hover:bg-gray-100={$page.url.pathname !== item.href}
          class:dark:hover:bg-gray-700={$page.url.pathname !== item.href}
        >
          <span class="text-xl">{item.icon}</span>
          {#if isOpen}
            <span class="font-medium">{item.name}</span>
          {/if}
        </a>
      {/each}
    </nav>

    <div class="absolute bottom-4 left-4 right-4">
      <button
        on:click={toggleDarkMode}
        class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        <span class="text-xl">{$darkMode ? '🌙' : '☀️'}</span>
        {#if isOpen}
          <span>{$darkMode ? 'Dark' : 'Light'} Mode</span>
        {/if}
      </button>
    </div>
  </aside>

  <!-- Main content -->
  <main class="flex-1 overflow-auto">
    <slot />
  </main>
</div>
