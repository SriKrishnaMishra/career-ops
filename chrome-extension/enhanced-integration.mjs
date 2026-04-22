/**
 * Career-Ops Enhanced Integration Bridge
 * Bridges existing content-script.js with new automated systems
 * Enables smart filling, learning, and multi-portal support
 */

// Import the new modules (they will be loaded as part of extension)
// These are available as:
// - globalThis.__SMART_FIELD_MAPPER__ (SmartFieldMapper instance)
// - globalThis.__SUCCESS_LEARNER__ (SuccessLearner instance)

import { PORTAL_REGISTRY, detectPortal, getFieldSelector, getAllSelectorsForField } from './portal-handlers.mjs';
import SmartFieldMapper from './smart-field-mapper.mjs';
import ApplicationOrchestrator from './orchestrator.mjs';
import { SuccessLearner } from './success-learner.mjs';

/**
 * Enhanced Job Application Automation System
 * Replaces and enhances the existing filling logic
 */
export class CareerOpsEnhanced {
  constructor() {
    this.mapper = globalThis.__SMART_FIELD_MAPPER__ || new SmartFieldMapper();
    this.learner = globalThis.__SUCCESS_LEARNER__ || new SuccessLearner();
    this.orchestrator = null;
    this.currentPortal = null;
    this.applicationInProgress = false;

    console.log('[Career-Ops Enhanced] System initialized');
  }

  /**
   * Detect and get current portal info
   */
  getPortalInfo() {
    if (!this.currentPortal) {
      this.currentPortal = detectPortal();
    }
    return this.currentPortal;
  }

  /**
   * Enhanced field finding - uses smart mapper + portal registry
   */
  findField(fieldType) {
    const portal = this.getPortalInfo();
    const portalConfig = portal.portal;

    // Get suggested selectors from portal registry
    const suggestedSelectors = getAllSelectorsForField(fieldType, portal.key);

    // Use smart mapper to find the best match
    const result = this.mapper.findField(fieldType, {
      portal: portal.key,
      suggestedSelectors,
      profile: {}
    });

    return result;
  }

  /**
   * Enhanced field filling with smart mapping
   */
  async fillFieldsEnhanced(profile, answers) {
    const portalInfo = this.getPortalInfo();
    console.log('[Career-Ops Enhanced] Filling fields for:', portalInfo.key);

    const filled = {};
    const standardFields = [
      'first name', 'last name', 'email', 'phone', 
      'linkedin', 'github', 'location', 'years of experience'
    ];

    for (const fieldType of standardFields) {
      const value = this.resolveFieldValue(fieldType, profile, answers);
      if (!value) continue;

      const result = this.findField(fieldType);
      if (result?.element) {
        this.mapper.setFieldValue(result.element, value);
        filled[fieldType] = true;
      }
    }

    return filled;
  }

  /**
   * Resolve value for a field
   */
  resolveFieldValue(fieldType, profile, answers) {
    // Check answers first
    if (answers[fieldType]) return answers[fieldType];

    // Check profile
    const key = fieldType.replace(/ /g, '').toLowerCase();
    if (profile[key]) return profile[key];

    // Compute from profile
    switch(fieldType) {
      case 'first name':
        return (profile.name || '').split(' ')[0] || profile.firstName || '';
      case 'last name':
        return (profile.name || '').split(' ').slice(-1)[0] || profile.lastName || '';
      case 'email':
        return profile.email || '';
      case 'phone':
        return profile.phone || '';
      case 'linkedin':
        return profile.linkedin || '';
      case 'github':
        return profile.github || '';
      case 'location':
        return profile.location || 'India';
      case 'years of experience':
        return profile.years || '';
      default:
        return '';
    }
  }

  /**
   * Start automated application workflow
   */
  async startAutomatedApplication(pack, options = {}) {
    if (this.applicationInProgress) {
      console.warn('[Career-Ops Enhanced] Application already in progress');
      throw new Error('An application is already in progress');
    }

    this.applicationInProgress = true;

    try {
      // Create orchestrator for this application
      this.orchestrator = new ApplicationOrchestrator(this.mapper, { detectPortal });

      // Run the full workflow
      const report = await this.orchestrator.startApplication(pack, {
        autoSubmit: options.autoSubmit !== false,
        skipResume: options.skipResume === true,
        retryOnError: options.retryOnError !== false,
        maxRetries: options.maxRetries || 2
      });

      // Learn from the result
      const portal = this.getPortalInfo();
      const insights = this.learner.recordApplication({
        portal: portal.key,
        company: pack.company,
        role: pack.role,
        success: report.success && report.submitted,
        duration: parseFloat(report.duration),
        filled: report.filled,
        attempted: report.attempted,
        submitted: report.submitted,
        fieldsFilled: report.filled
      });

      console.log('[Career-Ops Enhanced] Application learning recorded:', insights);

      return report;

    } catch (error) {
      console.error('[Career-Ops Enhanced] Application workflow failed:', error);
      throw error;
    } finally {
      this.applicationInProgress = false;
    }
  }

  /**
   * Get application statistics
   */
  getStatistics() {
    return {
      learner: this.learner.getSummary(),
      cache: this.mapper.getCacheStats(),
      currentPortal: this.getPortalInfo().key
    };
  }

  /**
   * Export all system data for backup
   */
  exportSystemData() {
    return {
      fieldCache: this.mapper.exportCache(),
      analytics: this.learner.exportAnalytics(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Import system data from backup
   */
  importSystemData(data) {
    if (data.fieldCache) {
      this.mapper.importCache(data.fieldCache);
    }
    // Note: Analytics import would need to be added to SuccessLearner if needed
  }

  /**
   * Reset all learning data (for testing)
   */
  resetLearningData() {
    this.mapper.cache.clear();
    this.mapper.saveCache();
    this.learner.reset();
    console.log('[Career-Ops Enhanced] Learning data reset');
  }
}

/**
 * Initialize enhanced system
 */
function initializeEnhancedSystem() {
  if (globalThis.__CAREER_OPS_ENHANCED__) {
    return globalThis.__CAREER_OPS_ENHANCED__;
  }

  const enhanced = new CareerOpsEnhanced();
  globalThis.__CAREER_OPS_ENHANCED__ = enhanced;

  // Listen for commands from panel
  chrome.runtime.onMessage?.addListener?.((message, sender, sendResponse) => {
    if (message.type === 'start-application-enhanced') {
      enhanced.startAutomatedApplication(message.pack, message.options)
        .then(report => sendResponse({ success: true, report }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Will respond asynchronously
    }

    if (message.type === 'get-statistics') {
      sendResponse({ stats: enhanced.getStatistics() });
    }

    if (message.type === 'export-data') {
      sendResponse({ data: enhanced.exportSystemData() });
    }

    if (message.type === 'reset-data') {
      enhanced.resetLearningData();
      sendResponse({ success: true });
    }
  });

  console.log('[Career-Ops Enhanced] System ready');
  return enhanced;
}

// Auto-initialize when script loads
if (typeof chrome !== 'undefined' && chrome.runtime) {
  initializeEnhancedSystem();
}

export default CareerOpsEnhanced;
export { initializeEnhancedSystem };
