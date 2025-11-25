<script lang="ts">
  import { onMount } from 'svelte';
  import * as d3 from 'd3';

  export let conversationId: string;
  export let relationships: Array<{
    id: string;
    relationship_type: string;
    similarity_score: number;
    project?: string;
  }> = [];

  let container: HTMLDivElement;
  let width = 800;
  let height = 600;

  interface Node {
    id: string;
    label: string;
    type: 'current' | 'related';
    relationshipType?: string;
  }

  interface Link {
    source: string;
    target: string;
    type: string;
    score: number;
  }

  onMount(() => {
    if (relationships.length === 0) return;

    // Prepare nodes
    const nodes: Node[] = [
      {
        id: conversationId,
        label: 'Current',
        type: 'current',
      },
    ];

    // Add related conversation nodes
    relationships.forEach((rel) => {
      nodes.push({
        id: rel.id,
        label: rel.project || rel.id.substring(0, 8),
        type: 'related',
        relationshipType: rel.relationship_type,
      });
    });

    // Prepare links
    const links: Link[] = relationships.map((rel) => ({
      source: conversationId,
      target: rel.id,
      type: rel.relationship_type,
      score: rel.similarity_score,
    }));

    // Create SVG
    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);

    // Create force simulation
    const simulation = d3
      .forceSimulation(nodes as any)
      .force(
        'link',
        d3
          .forceLink(links)
          .id((d: any) => d.id)
          .distance(150)
      )
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50));

    // Create arrow markers for directed edges
    svg
      .append('defs')
      .selectAll('marker')
      .data(['builds_on', 'solves_same_problem', 'references', 'contradicts', 'related'])
      .join('marker')
      .attr('id', (d) => `arrow-${d}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', (d) => getRelationshipColor(d))
      .attr('d', 'M0,-5L10,0L0,5');

    // Create links
    const link = svg
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d) => getRelationshipColor(d.type))
      .attr('stroke-width', (d) => 1 + d.score * 3)
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', (d) => `url(#arrow-${d.type})`);

    // Create nodes
    const node = svg
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .call(drag(simulation) as any);

    // Add circles to nodes
    node
      .append('circle')
      .attr('r', (d) => (d.type === 'current' ? 20 : 15))
      .attr('fill', (d) => {
        if (d.type === 'current') return '#3b82f6';
        return getRelationshipColor(d.relationshipType || 'related');
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Add labels to nodes
    node
      .append('text')
      .text((d) => d.label)
      .attr('x', 0)
      .attr('y', 30)
      .attr('text-anchor', 'middle')
      .attr('font-size', 12)
      .attr('fill', 'currentColor');

    // Add tooltips
    node.append('title').text((d) => {
      if (d.type === 'current') return 'Current Conversation';
      return `${d.relationshipType}\n${d.id.substring(0, 8)}`;
    });

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });
  });

  function getRelationshipColor(type: string): string {
    const colors: Record<string, string> = {
      builds_on: '#10b981',
      solves_same_problem: '#f59e0b',
      references: '#6366f1',
      contradicts: '#ef4444',
      near_duplicate: '#8b5cf6',
      related: '#94a3b8',
    };
    return colors[type] || colors.related;
  }

  function drag(simulation: any) {
    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended);
  }
</script>

<div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
  <h3 class="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Relationship Graph</h3>

  {#if relationships.length === 0}
    <p class="text-gray-500 dark:text-gray-400 text-center py-8">
      No related conversations found.
    </p>
  {:else}
    <div bind:this={container} class="relative" style="min-height: {height}px;"></div>

    <!-- Legend -->
    <div class="mt-6 flex flex-wrap gap-4 text-sm">
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-green-500"></div>
        <span>Builds On</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
        <span>Solves Same Problem</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-indigo-500"></div>
        <span>References</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-red-500"></div>
        <span>Contradicts</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-gray-400"></div>
        <span>Related</span>
      </div>
    </div>
  {/if}
</div>
