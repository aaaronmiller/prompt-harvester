---
title: AI Prompt Harvester - Universal Content Script
date: 2025-11-15 00:00:00 PST
ver: 1.0.0
author: The Telekinetic Carrot
model: claude-sonnet-4-5-20250929
tags: [javascript, browser-extension, dom-observer, api-intercept, real-time-capture, content-script]
---

/**
 * Universal AI Conversation Capture Script
 * 
 * This script runs on AI chat platforms and captures user prompts
 * and model responses in real-time.
 */

class AIConversationCapture {
  constructor(platform) {
    this.platform = platform
    this.backendUrl = 'http://localhost:3000/api/capture'
    this.messageQueue = []
    this.conversationId = this.generateConversationId()
    this.observers = []
    
    // Load settings
    this.loadSettings().then(() => {
      this.init()
    })
  }
  
  async loadSettings() {
    const settings = await chrome.storage.sync.get({
      backendUrl: 'http://localhost:3000/api/capture',
      enableCapture: true,
      syncInterval: 30000 // 30 seconds
    })
    
    this.backendUrl = settings.backendUrl
    this.enableCapture = settings.enableCapture
    this.syncInterval = settings.syncInterval
  }
  
  generateConversationId() {
    // Try to extract conversation ID from URL
    const url = window.location.href
    const conversationMatch = url.match(/\/c\/([a-zA-Z0-9-]+)/) || 
                             url.match(/\/chat\/([a-zA-Z0-9-]+)/)
    
    if (conversationMatch) {
      return `${this.platform}-${conversationMatch[1]}`
    }
    
    // Generate new ID
    return `${this.platform}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
  
  init() {
    console.log('[AI Harvester] Initializing capture for', this.platform)
    
    // Intercept network requests
    this.interceptFetch()
    this.interceptXHR()
    
    // Watch DOM for chat updates
    this.observeDOM()
    
    // Periodic sync
    setInterval(() => this.syncMessages(), this.syncInterval)
    
    // Sync on page unload
    window.addEventListener('beforeunload', () => {
      this.syncMessages(true) // Force sync
    })
  }
  
  /**
   * Intercept fetch API calls
   */
  interceptFetch() {
    const originalFetch = window.fetch
    const self = this
    
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args)
      
      // Clone response to read body
      const clone = response.clone()
      
      try {
        const url = args[0]
        const body = await clone.text()
        
        // Check if this is an AI API call
        if (self.isAIAPICall(url, body)) {
          await self.captureAPICall(url, args[1], body)
        }
      } catch (error) {
        console.error('[AI Harvester] Fetch intercept error:', error)
      }
      
      return response
    }
  }
  
  /**
   * Intercept XMLHttpRequest
   */
  interceptXHR() {
    const self = this
    const originalOpen = XMLHttpRequest.prototype.open
    const originalSend = XMLHttpRequest.prototype.send
    
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._url = url
      this._method = method
      return originalOpen.call(this, method, url, ...rest)
    }
    
    XMLHttpRequest.prototype.send = function(body) {
      const xhr = this
      
      xhr.addEventListener('load', function() {
        try {
          if (self.isAIAPICall(xhr._url, body)) {
            self.captureAPICall(xhr._url, { method: xhr._method }, xhr.responseText)
          }
        } catch (error) {
          console.error('[AI Harvester] XHR intercept error:', error)
        }
      })
      
      return originalSend.call(this, body)
    }
  }
  
  /**
   * Check if a request is an AI API call
   */
  isAIAPICall(url, body) {
    if (!url) return false
    
    const urlStr = url.toString().toLowerCase()
    const bodyStr = body ? body.toString().toLowerCase() : ''
    
    // Platform-specific API endpoints
    const apiPatterns = {
      'openai': ['/api/conversation', '/backend-api/conversation', '/v1/chat/completions'],
      'claude': ['/api/organizations/', '/api/append_message', '/api/send_message'],
      'gemini': ['/api/generate', '/_/BardChatUi/data/batchexecute']
    }
    
    const patterns = apiPatterns[this.platform] || []
    
    return patterns.some(pattern => urlStr.includes(pattern)) ||
           (bodyStr.includes('message') && bodyStr.includes('content'))
  }
  
  /**
   * Capture API call data
   */
  async captureAPICall(url, options, responseBody) {
    try {
      // Extract request data
      let requestData = null
      if (options && options.body) {
        try {
          requestData = JSON.parse(options.body)
        } catch {
          requestData = options.body
        }
      }
      
      // Extract response data
      let responseData = null
      try {
        responseData = JSON.parse(responseBody)
      } catch {
        responseData = responseBody
      }
      
      // Extract messages based on platform
      const messages = this.extractMessagesFromAPI(requestData, responseData)
      
      for (const message of messages) {
        this.queueMessage(message)
      }
    } catch (error) {
      console.error('[AI Harvester] API capture error:', error)
    }
  }
  
  /**
   * Extract messages from API data
   */
  extractMessagesFromAPI(requestData, responseData) {
    const messages = []
    
    switch (this.platform) {
      case 'openai':
        messages.push(...this.extractOpenAIMessages(requestData, responseData))
        break
      case 'claude':
        messages.push(...this.extractClaudeMessages(requestData, responseData))
        break
      case 'gemini':
        messages.push(...this.extractGeminiMessages(requestData, responseData))
        break
    }
    
    return messages
  }
  
  extractOpenAIMessages(request, response) {
    const messages = []
    
    // Extract from request (user message)
    if (request && request.messages) {
      const lastMessage = request.messages[request.messages.length - 1]
      if (lastMessage && lastMessage.role === 'user') {
        messages.push({
          role: 'user',
          content: lastMessage.content,
          timestamp: new Date().toISOString()
        })
      }
    }
    
    // Extract from response (assistant message)
    if (response && response.choices) {
      for (const choice of response.choices) {
        if (choice.message) {
          messages.push({
            role: choice.message.role || 'assistant',
            content: choice.message.content,
            timestamp: new Date().toISOString()
          })
        }
      }
    }
    
    return messages
  }
  
  extractClaudeMessages(request, response) {
    const messages = []
    
    // Claude's API structure varies, adjust based on actual format
    if (request && request.prompt) {
      messages.push({
        role: 'user',
        content: request.prompt,
        timestamp: new Date().toISOString()
      })
    }
    
    if (response && response.completion) {
      messages.push({
        role: 'assistant',
        content: response.completion,
        timestamp: new Date().toISOString()
      })
    }
    
    return messages
  }
  
  extractGeminiMessages(request, response) {
    const messages = []
    
    // Gemini/Bard has a complex structure, adjust based on actual format
    // This is a placeholder - inspect actual API calls to refine
    
    return messages
  }
  
  /**
   * Observe DOM for chat updates
   */
  observeDOM() {
    const config = {
      childList: true,
      subtree: true,
      characterData: true
    }
    
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Check if this is a new message
        if (this.isNewMessage(mutation)) {
          this.captureMessageFromDOM(mutation.target)
        }
      }
    })
    
    // Start observing the chat container
    observer.observe(document.body, config)
    this.observers.push(observer)
    
    // Also capture existing messages on load
    setTimeout(() => this.captureExistingMessages(), 2000)
  }
  
  /**
   * Check if a mutation represents a new message
   */
  isNewMessage(mutation) {
    if (mutation.type !== 'childList') return false
    
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        // Platform-specific message selectors
        const selectors = {
          'openai': '.group\\/conversation-turn',
          'claude': '[data-test-render-count]',
          'gemini': '.model-response-text'
        }
        
        const selector = selectors[this.platform]
        if (selector && (node.matches(selector) || node.querySelector(selector))) {
          return true
        }
      }
    }
    
    return false
  }
  
  /**
   * Capture message from DOM element
   */
  captureMessageFromDOM(element) {
    try {
      const message = this.extractMessageFromDOM(element)
      if (message && message.content) {
        this.queueMessage(message)
      }
    } catch (error) {
      console.error('[AI Harvester] DOM capture error:', error)
    }
  }
  
  /**
   * Extract message data from DOM element
   */
  extractMessageFromDOM(element) {
    // Platform-specific extraction logic
    switch (this.platform) {
      case 'openai':
        return this.extractOpenAIDOMMessage(element)
      case 'claude':
        return this.extractClaudeDOMMessage(element)
      case 'gemini':
        return this.extractGeminiDOMMessage(element)
      default:
        return null
    }
  }
  
  extractOpenAIDOMMessage(element) {
    // Find role indicator
    const isUser = element.querySelector('[data-message-author-role="user"]') !== null
    const isAssistant = element.querySelector('[data-message-author-role="assistant"]') !== null
    
    // Extract content
    const contentEl = element.querySelector('.markdown') || 
                     element.querySelector('[data-message-id]')
    
    if (!contentEl) return null
    
    return {
      role: isUser ? 'user' : (isAssistant ? 'assistant' : 'unknown'),
      content: contentEl.textContent.trim(),
      timestamp: new Date().toISOString(),
      metadata: {
        messageId: contentEl.getAttribute('data-message-id')
      }
    }
  }
  
  extractClaudeDOMMessage(element) {
    // Claude.ai message structure
    const isUser = element.querySelector('[data-is-author-user="true"]') !== null
    const contentEl = element.querySelector('.font-claude-message') ||
                     element.querySelector('[data-test-render-count]')
    
    if (!contentEl) return null
    
    return {
      role: isUser ? 'user' : 'assistant',
      content: contentEl.textContent.trim(),
      timestamp: new Date().toISOString()
    }
  }
  
  extractGeminiDOMMessage(element) {
    // Gemini/Bard message structure
    const contentEl = element.querySelector('.model-response-text') ||
                     element.querySelector('.query-text')
    
    if (!contentEl) return null
    
    // Detect role based on class or parent structure
    const isUser = element.classList.contains('query-container') ||
                  element.closest('.query-container') !== null
    
    return {
      role: isUser ? 'user' : 'assistant',
      content: contentEl.textContent.trim(),
      timestamp: new Date().toISOString()
    }
  }
  
  /**
   * Capture all existing messages on page
   */
  captureExistingMessages() {
    const selectors = {
      'openai': '.group\\/conversation-turn',
      'claude': '[data-test-render-count]',
      'gemini': '.conversation-container .message'
    }
    
    const selector = selectors[this.platform]
    if (!selector) return
    
    const messageElements = document.querySelectorAll(selector)
    console.log(`[AI Harvester] Found ${messageElements.length} existing messages`)
    
    for (const element of messageElements) {
      this.captureMessageFromDOM(element)
    }
  }
  
  /**
   * Queue a message for syncing
   */
  queueMessage(message) {
    if (!this.enableCapture) return
    
    // Add conversation metadata
    const enrichedMessage = {
      ...message,
      conversationId: this.conversationId,
      platform: this.platform,
      url: window.location.href,
      capturedAt: new Date().toISOString()
    }
    
    this.messageQueue.push(enrichedMessage)
    
    console.log('[AI Harvester] Queued message:', {
      role: message.role,
      contentLength: message.content?.length || 0
    })
    
    // Auto-sync if queue is large
    if (this.messageQueue.length >= 10) {
      this.syncMessages()
    }
  }
  
  /**
   * Sync messages to backend
   */
  async syncMessages(force = false) {
    if (!this.enableCapture || this.messageQueue.length === 0) return
    
    const messages = [...this.messageQueue]
    this.messageQueue = []
    
    try {
      console.log(`[AI Harvester] Syncing ${messages.length} messages...`)
      
      const response = await fetch(this.backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages,
          metadata: {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
          }
        })
      })
      
      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status}`)
      }
      
      console.log('[AI Harvester] Sync successful')
      
      // Store sync status
      await chrome.storage.local.set({
        lastSync: new Date().toISOString(),
        messagesSynced: messages.length
      })
    } catch (error) {
      console.error('[AI Harvester] Sync error:', error)
      
      // Re-queue messages on error (unless force sync on unload)
      if (!force) {
        this.messageQueue.push(...messages)
      } else {
        // Store failed messages in local storage for recovery
        const stored = await chrome.storage.local.get({ failedMessages: [] })
        stored.failedMessages.push(...messages)
        await chrome.storage.local.set({ failedMessages: stored.failedMessages })
      }
    }
  }
  
  /**
   * Cleanup
   */
  destroy() {
    for (const observer of this.observers) {
      observer.disconnect()
    }
    this.observers = []
    
    // Final sync
    this.syncMessages(true)
  }
}

// Detect platform and initialize
function detectPlatform() {
  const hostname = window.location.hostname
  
  if (hostname.includes('openai.com')) return 'openai'
  if (hostname.includes('claude.ai')) return 'claude'
  if (hostname.includes('gemini.google.com') || hostname.includes('bard.google.com')) return 'gemini'
  
  return null
}

// Initialize capture
const platform = detectPlatform()
if (platform) {
  console.log('[AI Harvester] Detected platform:', platform)
  const capture = new AIConversationCapture(platform)
  
  // Store in window for access from popup
  window.__aiHarvester = capture
} else {
  console.warn('[AI Harvester] Unknown platform, not initializing')
}
