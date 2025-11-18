---
title: Claude Code History Parser
date: 2025-11-15 00:00:00 PST
ver: 1.0.0
author: The Telekinetic Carrot
model: claude-sonnet-4-5-20250929
tags: [typescript, claude-code, parser, data-extraction, conversation-mining, bun]
---

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'

/**
 * Types for Claude Code conversation structure
 */
interface ClaudeCodeMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  metadata?: Record<string, any>
}

interface ClaudeCodeConversation {
  id: string
  sessionId: string
  projectPath?: string
  messages: ClaudeCodeMessage[]
  startedAt: Date
  updatedAt: Date
  model?: string
  totalTokens?: number
}

interface ParsedConversation {
  sourceId: string
  platform: 'claude-code'
  model: string
  project?: string
  startedAt: Date
  updatedAt: Date
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: Date
    sequenceNumber: number
    metadata: Record<string, any>
  }>
  metadata: {
    sessionId: string
    projectPath?: string
    totalTokens?: number
    [key: string]: any
  }
}

/**
 * Claude Code History Parser
 * 
 * Scans the Claude Code history directory and extracts all conversations
 * with user prompts and model responses.
 */
export class ClaudeCodeParser {
  private historyPath: string
  
  /**
   * Initialize parser with Claude Code history path
   * 
   * Common locations:
   * - macOS: ~/.claude/history or ~/Library/Application Support/Claude/history
   * - Linux: ~/.claude/history or ~/.config/claude/history
   * - Windows: %APPDATA%/Claude/history
   */
  constructor(historyPath?: string) {
    if (historyPath) {
      this.historyPath = historyPath
    } else {
      // Try to detect default location
      const home = homedir()
      // This is a guess - adjust based on actual Claude Code storage
      this.historyPath = join(home, '.claude', 'history')
    }
  }
  
  /**
   * Scan the entire history directory and parse all conversations
   */
  async scanAll(): Promise<ParsedConversation[]> {
    const conversations: ParsedConversation[] = []
    
    try {
      const entries = await readdir(this.historyPath, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = join(this.historyPath, entry.name)
        
        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subConversations = await this.scanDirectory(fullPath)
          conversations.push(...subConversations)
        } else if (entry.isFile() && this.isConversationFile(entry.name)) {
          // Parse individual conversation file
          const conversation = await this.parseFile(fullPath)
          if (conversation) {
            conversations.push(conversation)
          }
        }
      }
    } catch (error) {
      console.error(`Failed to scan history path: ${this.historyPath}`, error)
    }
    
    return conversations
  }
  
  /**
   * Scan a specific directory for conversations
   */
  private async scanDirectory(dirPath: string): Promise<ParsedConversation[]> {
    const conversations: ParsedConversation[] = []
    
    try {
      const entries = await readdir(dirPath, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name)
        
        if (entry.isFile() && this.isConversationFile(entry.name)) {
          const conversation = await this.parseFile(fullPath)
          if (conversation) {
            conversations.push(conversation)
          }
        }
      }
    } catch (error) {
      console.error(`Failed to scan directory: ${dirPath}`, error)
    }
    
    return conversations
  }
  
  /**
   * Check if a file is likely a conversation file
   */
  private isConversationFile(filename: string): boolean {
    // Adjust based on actual Claude Code file format
    return (
      filename.endsWith('.json') ||
      filename.endsWith('.jsonl') ||
      filename.includes('conversation') ||
      filename.includes('session')
    )
  }
  
  /**
   * Parse a single conversation file
   */
  async parseFile(filePath: string): Promise<ParsedConversation | null> {
    try {
      const content = await readFile(filePath, 'utf-8')
      const fileStats = await stat(filePath)
      
      // Try to parse as JSON first
      let data: any
      try {
        data = JSON.parse(content)
      } catch {
        // If not JSON, might be JSONL
        return this.parseJSONL(content, filePath)
      }
      
      return this.normalizeConversation(data, filePath, fileStats.mtime)
    } catch (error) {
      console.error(`Failed to parse file: ${filePath}`, error)
      return null
    }
  }
  
  /**
   * Parse JSONL format (one JSON object per line)
   */
  private parseJSONL(content: string, filePath: string): ParsedConversation | null {
    try {
      const lines = content.split('\n').filter(line => line.trim())
      const messages: ClaudeCodeMessage[] = []
      
      for (const line of lines) {
        const obj = JSON.parse(line)
        // Extract message from JSONL format
        // Adjust based on actual format
        if (obj.role && obj.content) {
          messages.push({
            role: obj.role,
            content: obj.content,
            timestamp: obj.timestamp ? new Date(obj.timestamp) : new Date(),
            metadata: obj.metadata || {}
          })
        }
      }
      
      if (messages.length === 0) return null
      
      // Create conversation from messages
      const conversation: ClaudeCodeConversation = {
        id: basename(filePath, '.jsonl'),
        sessionId: basename(filePath, '.jsonl'),
        messages,
        startedAt: messages[0].timestamp,
        updatedAt: messages[messages.length - 1].timestamp
      }
      
      return this.normalizeConversation(conversation, filePath, new Date())
    } catch (error) {
      console.error(`Failed to parse JSONL: ${filePath}`, error)
      return null
    }
  }
  
  /**
   * Normalize conversation data into standard format
   */
  private normalizeConversation(
    data: any,
    filePath: string,
    fileModTime: Date
  ): ParsedConversation | null {
    try {
      // Extract fields based on actual Claude Code format
      // This is a template - adjust based on real data structure
      const conversation: ParsedConversation = {
        sourceId: data.id || data.sessionId || basename(filePath),
        platform: 'claude-code',
        model: data.model || 'unknown',
        project: this.detectProject(data),
        startedAt: data.startedAt ? new Date(data.startedAt) : fileModTime,
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : fileModTime,
        messages: this.extractMessages(data),
        metadata: {
          sessionId: data.sessionId || data.id || basename(filePath),
          projectPath: data.projectPath,
          totalTokens: data.totalTokens,
          filePath
        }
      }
      
      return conversation
    } catch (error) {
      console.error('Failed to normalize conversation', error)
      return null
    }
  }
  
  /**
   * Extract messages from conversation data
   */
  private extractMessages(data: any): ParsedConversation['messages'] {
    const messages: ParsedConversation['messages'] = []
    
    // Handle different possible data structures
    const rawMessages = data.messages || data.history || data.turns || []
    
    for (let i = 0; i < rawMessages.length; i++) {
      const msg = rawMessages[i]
      
      messages.push({
        role: msg.role || 'user',
        content: this.extractContent(msg),
        timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        sequenceNumber: i,
        metadata: {
          hasCode: this.detectCode(msg),
          hasMermaid: this.detectMermaid(msg),
          toolsUsed: msg.tools || msg.toolCalls || [],
          filesModified: msg.filesModified || [],
          ...msg.metadata
        }
      })
    }
    
    return messages
  }
  
  /**
   * Extract content from various message formats
   */
  private extractContent(msg: any): string {
    if (typeof msg.content === 'string') {
      return msg.content
    }
    
    if (Array.isArray(msg.content)) {
      // Handle multi-part content (text + images, etc.)
      return msg.content
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text || part.content)
        .join('\n\n')
    }
    
    if (msg.text) return msg.text
    if (msg.message) return msg.message
    
    return JSON.stringify(msg)
  }
  
  /**
   * Detect project from conversation data
   */
  private detectProject(data: any): string | undefined {
    // Try explicit project field
    if (data.project) return data.project
    
    // Try to extract from project path
    if (data.projectPath) {
      const parts = data.projectPath.split('/')
      return parts[parts.length - 1]
    }
    
    // Try to detect from messages
    const messages = data.messages || data.history || []
    for (const msg of messages) {
      const content = this.extractContent(msg)
      
      // Look for common project keywords
      const projectMatches = content.match(/(?:project|working on|building)\s+([A-Z][a-zA-Z0-9-_]+)/i)
      if (projectMatches) {
        return projectMatches[1]
      }
    }
    
    return undefined
  }
  
  /**
   * Detect if message contains code
   */
  private detectCode(msg: any): boolean {
    const content = this.extractContent(msg)
    return /```[\s\S]*?```/.test(content) || 
           /^\s*(function|class|const|let|var|import|export|def|async)/m.test(content)
  }
  
  /**
   * Detect if message contains Mermaid diagrams
   */
  private detectMermaid(msg: any): boolean {
    const content = this.extractContent(msg)
    return /```mermaid[\s\S]*?```/.test(content)
  }
  
  /**
   * Get conversations modified since a specific date
   * Useful for incremental syncs
   */
  async getConversationsSince(since: Date): Promise<ParsedConversation[]> {
    const all = await this.scanAll()
    return all.filter(conv => conv.updatedAt > since)
  }
  
  /**
   * Get conversations for a specific project
   */
  async getConversationsByProject(projectName: string): Promise<ParsedConversation[]> {
    const all = await this.scanAll()
    return all.filter(conv => 
      conv.project?.toLowerCase() === projectName.toLowerCase()
    )
  }
  
  /**
   * Extract only user prompts from all conversations
   */
  async extractAllUserPrompts(): Promise<Array<{
    conversationId: string
    project?: string
    timestamp: Date
    content: string
    metadata: Record<string, any>
  }>> {
    const conversations = await this.scanAll()
    const prompts: any[] = []
    
    for (const conv of conversations) {
      for (const msg of conv.messages) {
        if (msg.role === 'user') {
          prompts.push({
            conversationId: conv.sourceId,
            project: conv.project,
            timestamp: msg.timestamp,
            content: msg.content,
            metadata: msg.metadata
          })
        }
      }
    }
    
    return prompts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }
}

/**
 * Example usage
 */
async function main() {
  // Initialize parser
  const parser = new ClaudeCodeParser()
  
  // Or specify custom path
  // const parser = new ClaudeCodeParser('/path/to/claude/history')
  
  console.log('Scanning Claude Code history...')
  
  // Get all conversations
  const conversations = await parser.scanAll()
  console.log(`Found ${conversations.length} conversations`)
  
  // Get recent conversations (last 7 days)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const recent = await parser.getConversationsSince(weekAgo)
  console.log(`Found ${recent.length} conversations from last 7 days`)
  
  // Get all user prompts
  const userPrompts = await parser.extractAllUserPrompts()
  console.log(`Extracted ${userPrompts.length} user prompts`)
  
  // Show sample
  if (userPrompts.length > 0) {
    console.log('\nSample user prompt:')
    console.log(JSON.stringify(userPrompts[0], null, 2))
  }
  
  // Get conversations by project
  const datakiln = await parser.getConversationsByProject('DataKiln')
  console.log(`Found ${datakiln.length} DataKiln conversations`)
  
  // Calculate statistics
  const stats = {
    totalConversations: conversations.length,
    totalMessages: conversations.reduce((sum, conv) => sum + conv.messages.length, 0),
    userMessages: conversations.reduce((sum, conv) => 
      sum + conv.messages.filter(m => m.role === 'user').length, 0
    ),
    assistantMessages: conversations.reduce((sum, conv) => 
      sum + conv.messages.filter(m => m.role === 'assistant').length, 0
    ),
    messagesWithCode: conversations.reduce((sum, conv) => 
      sum + conv.messages.filter(m => m.metadata.hasCode).length, 0
    ),
    projects: new Set(conversations.map(c => c.project).filter(Boolean)).size
  }
  
  console.log('\nStatistics:')
  console.log(JSON.stringify(stats, null, 2))
}

// Run if executed directly
if (import.meta.main) {
  main().catch(console.error)
}

export default ClaudeCodeParser
