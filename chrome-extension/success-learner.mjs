/**
 * Success Learning & Analytics System
 * Tracks successful applications and learns from patterns
 * Improves future auto-fills based on what worked
 */

export class SuccessLearner {
  constructor() {
    this.analytics = {
      totalApplications: 0,
      successfulApplications: 0,
      failedApplications: 0,
      portalStats: {},
      fieldSuccessRates: {},
      averageTimeTaken: 0
    };
    this.loadAnalytics();
  }

  /**
   * Load analytics from storage
   */
  loadAnalytics() {
    try {
      const stored = localStorage.getItem('career-ops-analytics');
      if (stored) {
        const data = JSON.parse(stored);
        this.analytics = { ...this.analytics, ...data };
      }
    } catch (e) {
      console.warn('Failed to load analytics:', e);
    }
  }

  /**
   * Save analytics to storage
   */
  saveAnalytics() {
    try {
      localStorage.setItem('career-ops-analytics', JSON.stringify(this.analytics));
    } catch (e) {
      console.warn('Failed to save analytics:', e);
    }
  }

  /**
   * Record a completed application
   */
  recordApplication(report) {
    const {
      portal = 'unknown',
      company = 'unknown',
      role = 'unknown',
      success = false,
      duration = 0,
      filled = 0,
      attempted = 0,
      pdfAttached = false,
      submitted = false,
      errors = [],
      fieldsFilled = {}
    } = report;

    // Update total counts
    this.analytics.totalApplications += 1;
    if (success && submitted) {
      this.analytics.successfulApplications += 1;
    } else if (errors.length > 0) {
      this.analytics.failedApplications += 1;
    }

    // Update portal stats
    if (!this.analytics.portalStats[portal]) {
      this.analytics.portalStats[portal] = {
        attempts: 0,
        successful: 0,
        failed: 0,
        avgTime: 0,
        avgFieldsFilled: 0
      };
    }

    const portStats = this.analytics.portalStats[portal];
    portStats.attempts += 1;
    if (success && submitted) portStats.successful += 1;
    if (errors.length > 0) portStats.failed += 1;

    // Update average time
    portStats.avgTime = (portStats.avgTime * (portStats.attempts - 1) + duration) / portStats.attempts;
    portStats.avgFieldsFilled = (portStats.avgFieldsFilled || 0) * 0.7 + filled * 0.3;

    // Record field success rates
    for (const [fieldType, wasFilled] of Object.entries(fieldsFilled || {})) {
      if (!this.analytics.fieldSuccessRates[fieldType]) {
        this.analytics.fieldSuccessRates[fieldType] = {
          attempts: 0,
          successful: 0,
          successRate: 0
        };
      }

      const fieldStats = this.analytics.fieldSuccessRates[fieldType];
      fieldStats.attempts += 1;
      if (wasFilled) fieldStats.successful += 1;
      fieldStats.successRate = fieldStats.successful / fieldStats.attempts;
    }

    // Save updated analytics
    this.saveAnalytics();

    // Return insights
    return this.getInsights(portal);
  }

  /**
   * Get insights about a specific portal
   */
  getInsights(portal) {
    const stats = this.analytics.portalStats[portal];
    if (!stats) return null;

    const successRate = stats.attempts > 0 
      ? (stats.successful / stats.attempts * 100).toFixed(1)
      : 0;

    return {
      portal,
      attempts: stats.attempts,
      successRate: `${successRate}%`,
      avgTime: `${stats.avgTime.toFixed(1)}s`,
      avgFieldsFilled: stats.avgFieldsFilled.toFixed(1),
      confidence: this.getConfidenceLevel(stats.attempts)
    };
  }

  /**
   * Get confidence level based on sample size
   */
  getConfidenceLevel(attempts) {
    if (attempts < 3) return 'low';
    if (attempts < 10) return 'medium';
    return 'high';
  }

  /**
   * Get field-specific success rates
   */
  getFieldStats(fieldType) {
    return this.analytics.fieldSuccessRates[fieldType] || null;
  }

  /**
   * Get recommended field priority
   */
  getFieldPriority() {
    const priority = [];

    for (const [fieldType, stats] of Object.entries(this.analytics.fieldSuccessRates)) {
      priority.push({
        field: fieldType,
        successRate: stats.successRate,
        attempts: stats.attempts,
        score: stats.successRate * Math.log(stats.attempts + 1)
      });
    }

    return priority.sort((a, b) => b.score - a.score);
  }

  /**
   * Get best performing portals
   */
  getBestPortals() {
    const portals = [];

    for (const [portal, stats] of Object.entries(this.analytics.portalStats)) {
      if (stats.attempts < 2) continue; // Need at least 2 attempts

      portals.push({
        portal,
        successRate: (stats.successful / stats.attempts * 100).toFixed(1),
        attempts: stats.attempts,
        avgTime: stats.avgTime.toFixed(1)
      });
    }

    return portals.sort((a, b) => b.successRate - a.successRate);
  }

  /**
   * Get overall success rate
   */
  getOverallSuccessRate() {
    if (this.analytics.totalApplications === 0) return 0;
    return (this.analytics.successfulApplications / this.analytics.totalApplications * 100).toFixed(1);
  }

  /**
   * Export analytics for reporting
   */
  exportAnalytics() {
    return {
      ...this.analytics,
      overallSuccessRate: this.getOverallSuccessRate(),
      bestPortals: this.getBestPortals(),
      fieldPriority: this.getFieldPriority(),
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Reset analytics (for testing)
   */
  reset() {
    this.analytics = {
      totalApplications: 0,
      successfulApplications: 0,
      failedApplications: 0,
      portalStats: {},
      fieldSuccessRates: {},
      averageTimeTaken: 0
    };
    localStorage.removeItem('career-ops-analytics');
  }

  /**
   * Generate a performance summary
   */
  getSummary() {
    const portals = Object.keys(this.analytics.portalStats).length;
    const successRate = this.getOverallSuccessRate();

    return {
      totalApplications: this.analytics.totalApplications,
      successfulApplications: this.analytics.successfulApplications,
      failedApplications: this.analytics.failedApplications,
      successRatePercent: successRate,
      portalsUsed: portals,
      topField: this.getFieldPriority()[0]?.field || 'N/A',
      bestPortal: this.getBestPortals()[0]?.portal || 'N/A'
    };
  }
}

/**
 * Track user behavior on application forms
 */
export class FormBehaviorTracker {
  constructor() {
    this.behaviors = [];
    this.startTime = null;
  }

  /**
   * Start tracking form interactions
   */
  startTracking() {
    this.startTime = Date.now();
    this.trackFormEvents();
  }

  /**
   * Track form events
   */
  trackFormEvents() {
    document.addEventListener('input', (e) => {
      if (e.target.matches('input, textarea, select')) {
        this.recordBehavior('field_input', {
          fieldLabel: this.getFieldLabel(e.target),
          fieldType: e.target.type,
          valueLength: String(e.target.value || '').length
        });
      }
    });

    document.addEventListener('change', (e) => {
      if (e.target.matches('select, input[type="radio"], input[type="checkbox"]')) {
        this.recordBehavior('field_change', {
          field: this.getFieldLabel(e.target),
          value: e.target.value
        });
      }
    });

    document.addEventListener('click', (e) => {
      if (e.target.matches('button, input[type="button"], input[type="submit"]')) {
        this.recordBehavior('button_click', {
          buttonText: e.target.textContent.trim(),
          buttonType: e.target.type
        });
      }
    });
  }

  /**
   * Get field label
   */
  getFieldLabel(element) {
    return element.getAttribute('aria-label')
      || element.getAttribute('placeholder')
      || element.getAttribute('name')
      || 'unknown';
  }

  /**
   * Record a behavior
   */
  recordBehavior(type, data) {
    this.behaviors.push({
      type,
      data,
      timestamp: Date.now() - this.startTime
    });
  }

  /**
   * Get tracked behaviors
   */
  getBehaviors() {
    return this.behaviors;
  }

  /**
   * Analyze form complexity based on behaviors
   */
  analyzeComplexity() {
    const inputCount = this.behaviors.filter(b => b.type === 'field_input').length;
    const changeCount = this.behaviors.filter(b => b.type === 'field_change').length;
    const totalTime = this.behaviors[this.behaviors.length - 1]?.timestamp || 0;

    return {
      inputsAttempted: inputCount,
      fieldsChanged: changeCount,
      timeSpent: `${(totalTime / 1000).toFixed(1)}s`,
      complexity: inputCount > 10 ? 'high' : inputCount > 5 ? 'medium' : 'low'
    };
  }
}

// Initialize globally
globalThis.__SUCCESS_LEARNER__ = new SuccessLearner();

export default SuccessLearner;
