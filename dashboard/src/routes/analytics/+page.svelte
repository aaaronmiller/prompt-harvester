<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { Chart, registerables } from 'chart.js';

  Chart.register(...registerables);

  let analytics: any = null;
  let loading = true;
  let tokenChart: any;
  let platformChart: any;

  onMount(async () => {
    try {
      analytics = await api.getAnalytics();

      // Create token usage chart
      if (analytics.token_usage_daily) {
        createTokenUsageChart();
      }

      // Create platform distribution chart
      if (analytics.platform_efficiency) {
        createPlatformChart();
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      loading = false;
    }
  });

  function createTokenUsageChart() {
    const ctx = document.getElementById('tokenChart') as HTMLCanvasElement;
    if (!ctx) return;

    // Group by date and aggregate platforms
    const dateMap = new Map();
    analytics.token_usage_daily.forEach((item: any) => {
      if (!dateMap.has(item.date)) {
        dateMap.set(item.date, 0);
      }
      dateMap.set(item.date, dateMap.get(item.date) + item.total_tokens);
    });

    const dates = Array.from(dateMap.keys()).sort().slice(-30); // Last 30 days
    const tokens = dates.map((date) => dateMap.get(date));

    tokenChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates.map((d) => new Date(d).toLocaleDateString()),
        datasets: [
          {
            label: 'Total Tokens',
            data: tokens,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Token Usage Over Time (Last 30 Days)',
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function (value) {
                return value.toLocaleString();
              },
            },
          },
        },
      },
    });
  }

  function createPlatformChart() {
    const ctx = document.getElementById('platformChart') as HTMLCanvasElement;
    if (!ctx) return;

    const platforms = analytics.platform_efficiency.map((p: any) => p.platform);
    const counts = analytics.platform_efficiency.map((p: any) => p.total_conversations);

    platformChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: platforms,
        datasets: [
          {
            data: counts,
            backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444'],
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Conversations by Platform',
          },
        },
      },
    });
  }
</script>

<svelte:head>
  <title>Analytics - Prompt Harvester</title>
</svelte:head>

<div class="p-8">
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Analytics</h1>
    <p class="text-gray-600 dark:text-gray-400">
      Insights and trends from your AI conversation history
    </p>
  </div>

  {#if loading}
    <div class="text-center py-12">
      <p class="text-gray-500 dark:text-gray-400">Loading analytics...</p>
    </div>
  {:else if analytics}
    <!-- Charts -->
    <div class="grid grid-cols-2 gap-6 mb-8">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <canvas id="tokenChart"></canvas>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <canvas id="platformChart"></canvas>
      </div>
    </div>

    <!-- Platform Efficiency -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-8">
      <h2 class="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
        Platform Efficiency
      </h2>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b dark:border-gray-700">
            <tr>
              <th class="text-left py-3 px-4">Platform</th>
              <th class="text-right py-3 px-4">Total Conversations</th>
              <th class="text-right py-3 px-4">Avg Tokens</th>
              <th class="text-right py-3 px-4">Success Rate</th>
            </tr>
          </thead>
          <tbody>
            {#each analytics.platform_efficiency as platform}
              <tr class="border-b dark:border-gray-700">
                <td class="py-3 px-4 font-medium">{platform.platform}</td>
                <td class="text-right py-3 px-4">{platform.total_conversations.toLocaleString()}</td>
                <td class="text-right py-3 px-4">
                  {Math.round(platform.avg_tokens_used).toLocaleString()}
                </td>
                <td class="text-right py-3 px-4">
                  <span class="text-green-600 dark:text-green-400">
                    {platform.success_rate_pct ? platform.success_rate_pct.toFixed(1) : '0'}%
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Trending Topics -->
    {#if analytics.trending_topics}
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h2 class="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Trending Topics</h2>
        <div class="flex flex-wrap gap-3">
          {#each analytics.trending_topics.slice(0, 20) as topic}
            <div class="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <span class="font-medium">{topic.topic_name}</span>
              <span class="text-sm text-gray-500 dark:text-gray-400 ml-2">
                {topic.usage_count} uses
              </span>
              {#if topic.recent_count > 0}
                <span class="text-xs text-green-600 dark:text-green-400 ml-1">
                  ↑ {topic.recent_count} recent
                </span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {:else}
    <div class="text-center py-12">
      <p class="text-gray-500 dark:text-gray-400">No analytics data available.</p>
    </div>
  {/if}
</div>
