const API_BASE = '/api';

export interface Conversation {
  id: string;
  platform: string;
  model?: string;
  project?: string;
  started_at: string;
  message_count: number;
  total_tokens: number;
  topics?: string[];
  user_prompt?: string;
  last_response?: string;
  quality_rating?: number;
  related_count?: number;
  similarity_score?: number;
}

export interface SearchFilters {
  project?: string;
  platform?: string;
  dateFrom?: string;
  dateTo?: string;
  topics?: string[];
}

export interface Analytics {
  token_usage_daily: Array<{
    date: string;
    platform: string;
    total_tokens: number;
    conversation_count: number;
  }>;
  trending_topics: Array<{
    topic_name: string;
    usage_count: number;
    recent_count: number;
  }>;
  platform_efficiency: Array<{
    platform: string;
    total_conversations: number;
    avg_tokens_used: number;
    success_rate_pct: number;
  }>;
}

export const api = {
  async searchConversations(
    query: string,
    mode: 'semantic' | 'fulltext' | 'hybrid' = 'hybrid',
    filters?: SearchFilters,
    limit: number = 20
  ): Promise<{ results: Conversation[]; total: number }> {
    const response = await fetch(`${API_BASE}/search/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, filters, limit }),
    });
    return response.json();
  },

  async getConversation(id: string): Promise<Conversation & { messages: any[] }> {
    const response = await fetch(`${API_BASE}/conversations/${id}`);
    return response.json();
  },

  async getConversations(
    filters?: SearchFilters,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ results: Conversation[]; total: number }> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      ...(filters?.project && { project: filters.project }),
      ...(filters?.platform && { platform: filters.platform }),
    });
    const response = await fetch(`${API_BASE}/conversations?${params}`);
    return response.json();
  },

  async getAnalytics(): Promise<Analytics> {
    const response = await fetch(`${API_BASE}/analytics`);
    return response.json();
  },

  async getTopics(): Promise<
    Array<{ topic_name: string; usage_count: number; recent_count: number; category?: string }>
  > {
    const response = await fetch(`${API_BASE}/topics`);
    return response.json();
  },

  async getTemplates(): Promise<
    Array<{
      id: string;
      pattern: string;
      parameterized_pattern: string;
      occurrences: number;
      effectiveness_score: number;
      category: string;
    }>
  > {
    const response = await fetch(`${API_BASE}/templates`);
    return response.json();
  },

  async getRelatedConversations(id: string, minSimilarity: number = 0.7): Promise<Conversation[]> {
    const response = await fetch(
      `${API_BASE}/conversations/${id}/related?min_similarity=${minSimilarity}`
    );
    return response.json();
  },

  async exportConversations(
    format: 'markdown' | 'json' | 'csv',
    filters?: SearchFilters
  ): Promise<Blob> {
    const response = await fetch(`${API_BASE}/export/${format}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters }),
    });
    return response.blob();
  },

  async getEmbeddingStats(): Promise<{
    total: number;
    embedded: number;
    pending: number;
    failed: number;
  }> {
    const response = await fetch(`${API_BASE}/embeddings/status`);
    return response.json();
  },
};
