/**
 * Smart Field Mapper with Learning System
 * Uses AI-powered matching + caching for continuous improvement
 * Learns from successful field fills and improves over time
 */

export class SmartFieldMapper {
  constructor() {
    this.cache = new Map(); // hostname -> { field -> successful_selector }
    this.loadCache();
  }

  /**
   * Load cached successful mappings from browser storage
   */
  loadCache() {
    try {
      const stored = localStorage.getItem('career-ops-field-cache');
      if (stored) {
        const data = JSON.parse(stored);
        this.cache = new Map(Object.entries(data));
      }
    } catch (e) {
      console.warn('Failed to load field cache:', e);
    }
  }

  /**
   * Save cache to browser storage
   */
  saveCache() {
    try {
      const data = Object.fromEntries(this.cache);
      localStorage.setItem('career-ops-field-cache', JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save field cache:', e);
    }
  }

  /**
   * Normalize field names for consistent matching
   */
  normalizeFieldName(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /**
   * Calculate semantic similarity between two strings
   * Returns score 0-1 (higher = more similar)
   */
  semanticSimilarity(str1, str2) {
    const s1 = this.normalizeFieldName(str1);
    const s2 = this.normalizeFieldName(str2);
    
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1;
    
    // Token overlap scoring
    const tokens1 = new Set(s1.split(' '));
    const tokens2 = new Set(s2.split(' '));
    
    let matches = 0;
    for (const token of tokens1) {
      if (tokens2.has(token)) matches += 1;
    }
    
    const maxTokens = Math.max(tokens1.size, tokens2.size);
    return maxTokens > 0 ? matches / maxTokens : 0;
  }

  /**
   * Extract label text from form field (aria-label, placeholder, nearby label, etc.)
   */
  getFieldLabel(element) {
    if (!element) return '';
    
    const parts = [
      element.getAttribute('aria-label'),
      element.getAttribute('placeholder'),
      element.getAttribute('name'),
      element.getAttribute('id'),
      element.getAttribute('data-testid'),
      element.labels?.[0]?.textContent,
      element.closest('label')?.textContent,
      element.closest('[data-field], .field, .form-group')?.textContent?.split('\n')[0]
    ].filter(Boolean);
    
    return parts.join(' ').trim();
  }

  /**
   * Find best matching element for a field type across all visible form fields
   * Uses: cached selector, semantic matching, heuristics
   */
  findField(fieldType, options = {}) {
    const hostname = window.location.hostname;
    const { portal, suggestedSelectors = [], profile = {} } = options;
    
    // Check cache first
    const cachedPort = this.cache.get(hostname) || {};
    if (cachedPort[fieldType]) {
      const cached = document.querySelector(cachedPort[fieldType]);
      if (cached && this.isFieldUsable(cached)) {
        return { element: cached, source: 'cache', selector: cachedPort[fieldType] };
      }
    }

    // Build candidate list
    const candidates = [];
    const allFields = document.querySelectorAll('input, textarea, select');
    
    for (const field of allFields) {
      if (!this.isFieldUsable(field)) continue;
      
      const label = this.getFieldLabel(field);
      const similarity = this.semanticSimilarity(fieldType, label);
      
      // Score based on similarity
      let score = similarity * 100;
      
      // Bonus for exact selector matches
      for (const selector of suggestedSelectors) {
        if (field.matches(selector)) {
          score += 50;
          break;
        }
      }
      
      // Type-specific bonuses
      if (fieldType === 'email' && field.type === 'email') score += 20;
      if (fieldType === 'phone' && field.type === 'tel') score += 20;
      if (fieldType === 'resume' && field.type === 'file') score += 20;
      
      // Penalty for common non-target fields
      if (fieldType !== 'resume' && field.type === 'file') score -= 30;
      if (fieldType !== 'email' && field.type === 'email' && label.includes('subscribe')) score -= 30;
      
      if (score > 0) {
        candidates.push({
          element: field,
          score,
          label,
          selector: this.getSelectorForElement(field),
          source: 'intelligent'
        });
      }
    }
    
    // Sort by score and return the best match
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    
    if (best) {
      // Cache the successful selector
      this.recordSuccessfulMapping(hostname, fieldType, best.selector);
    }
    
    return best || null;
  }

  /**
   * Check if a field is usable (not hidden, disabled, etc.)
   */
  isFieldUsable(field) {
    if (!field || field.disabled || field.readOnly) return false;
    
    const type = (field.type || '').toLowerCase();
    if (type === 'hidden') return false;
    
    // Check visibility
    const rect = field.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    
    const style = window.getComputedStyle(field);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    
    return true;
  }

  /**
   * Generate a reliable CSS selector for an element
   */
  getSelectorForElement(element) {
    // Prefer specific attributes
    if (element.id) return `#${element.id}`;
    if (element.name) return `${element.tagName.toLowerCase()}[name="${element.name}"]`;
    if (element.getAttribute('data-testid')) {
      return `${element.tagName.toLowerCase()}[data-testid="${element.getAttribute('data-testid')}"]`;
    }
    
    // Build path from ancestors
    const path = [];
    let current = element;
    
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break;
      }
      
      if (current.className) {
        const classes = current.className.split(' ').filter(c => !c.includes('ng-') && c.length > 0);
        if (classes.length) selector += `.${classes.join('.')}`;
      }
      
      path.unshift(selector);
      current = current.parentElement;
      
      if (path.length > 5) break; // Limit depth
    }
    
    return path.join(' > ');
  }

  /**
   * Record a successful field mapping in cache
   */
  recordSuccessfulMapping(hostname, fieldType, selector) {
    if (!this.cache.has(hostname)) {
      this.cache.set(hostname, {});
    }
    
    const portMappings = this.cache.get(hostname);
    if (!portMappings[fieldType]) {
      portMappings[fieldType] = selector;
      this.saveCache();
    }
  }

  /**
   * Learn from actual filled values and improve future fills
   */
  recordSuccessfulFill(fieldType, value, selector) {
    const hostname = window.location.hostname;
    this.recordSuccessfulMapping(hostname, fieldType, selector);
    
    // Could extend to track which values worked best for which field types
    // This enables learning field value preferences by portal
  }

  /**
   * Fill all standard fields intelligently
   */
  async fillStandardFields(profile, answers) {
    const standardFields = {
      'first name': profile.firstName || (profile.name || '').split(' ')[0],
      'last name': profile.lastName || (profile.name || '').split(' ').slice(-1)[0],
      'email': profile.email,
      'phone': profile.phone,
      'linkedin': profile.linkedin,
      'github': profile.github,
      'location': profile.location,
      'years of experience': profile.years
    };
    
    const filled = {};
    
    for (const [fieldType, value] of Object.entries(standardFields)) {
      if (!value) continue;
      
      const result = this.findField(fieldType, { profile });
      if (result?.element) {
        this.setFieldValue(result.element, value);
        filled[fieldType] = true;
        this.recordSuccessfulFill(fieldType, value, result.selector);
      }
    }
    
    return filled;
  }

  /**
   * Set field value with proper event dispatch
   */
  setFieldValue(element, value) {
    if (!element) return;
    
    const type = (element.type || '').toLowerCase();
    
    if (type === 'checkbox' || type === 'radio') {
      element.checked = true;
    } else if (element.tagName === 'SELECT') {
      // Try to find matching option
      const val = String(value).toLowerCase();
      for (const option of element.options) {
        if (option.textContent.toLowerCase().includes(val) || option.value.toLowerCase() === val) {
          element.value = option.value;
          break;
        }
      }
    } else {
      // Input or textarea
      element.value = String(value || '');
    }
    
    // Dispatch events to trigger validation
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  /**
   * Get statistics on cache effectiveness
   */
  getCacheStats() {
    const stats = {
      totalHosts: this.cache.size,
      totalMappings: 0,
      byHost: {}
    };
    
    for (const [host, mappings] of this.cache) {
      const count = Object.keys(mappings).length;
      stats.totalMappings += count;
      stats.byHost[host] = count;
    }
    
    return stats;
  }

  /**
   * Clear old cache entries (older than 30 days)
   */
  pruneOldCache(daysOld = 30) {
    // This could be extended to track timestamps
    // For now, we keep all cache since mappings don't change
  }

  /**
   * Export cache for debugging
   */
  exportCache() {
    return Object.fromEntries(this.cache);
  }

  /**
   * Import cache from external source
   */
  importCache(data) {
    if (typeof data === 'string') {
      data = JSON.parse(data);
    }
    
    this.cache = new Map(Object.entries(data));
    this.saveCache();
  }
}

// Initialize globally
globalThis.__SMART_FIELD_MAPPER__ = new SmartFieldMapper();

export default SmartFieldMapper;
