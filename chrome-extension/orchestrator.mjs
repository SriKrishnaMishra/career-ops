/**
 * Application Automation Orchestrator
 * Manages the complete job application workflow across all portals
 * Handles multi-step forms, validation, and automatic submission
 */

export class ApplicationOrchestrator {
  constructor(mapper, portalHandlers) {
    this.mapper = mapper;
    this.portalHandlers = portalHandlers;
    this.currentStep = 0;
    this.totalSteps = 0;
    this.applicationState = {
      started: false,
      filled: {},
      errors: [],
      warnings: [],
      requiredMissing: 0
    };
    this.metrics = {
      startTime: null,
      endTime: null,
      fieldsAttempted: 0,
      fieldsFilled: 0,
      pdfAttached: false,
      submitted: false
    };
  }

  /**
   * Start application workflow
   */
  async startApplication(pack, options = {}) {
    console.log('[Career-Ops] Starting application workflow', { pack: pack.role });
    
    this.applicationState.started = true;
    this.metrics.startTime = Date.now();
    
    const { 
      autoSubmit = false, 
      skipResume = false, 
      retryOnError = true,
      maxRetries = 2 
    } = options;
    
    try {
      // Step 1: Detect portal and load handlers
      await this.detectAndLoadPortal();
      this.notifyProgress('Portal detected', 1, 5);
      
      // Step 2: Fill basic information
      const fillResult = await this.fillAllFields(pack);
      this.applicationState.filled = fillResult;
      this.notifyProgress('Fields filled', 2, 5);
      
      // Step 3: Attach resume/PDF
      if (!skipResume) {
        const attachResult = await this.attachResume(pack);
        this.metrics.pdfAttached = attachResult.success;
        this.notifyProgress('Resume attached', 3, 5);
      }
      
      // Step 4: Handle any validation
      await this.handleValidation();
      this.notifyProgress('Form validated', 4, 5);
      
      // Step 5: Submit if requested
      if (autoSubmit) {
        const submitResult = await this.submitApplication();
        this.metrics.submitted = submitResult.success;
        this.notifyProgress('Application submitted', 5, 5);
      } else {
        this.notifyProgress('Ready to submit', 5, 5);
      }
      
      return this.getFinalReport();
      
    } catch (error) {
      this.applicationState.errors.push({
        step: this.currentStep,
        message: error.message,
        timestamp: new Date().toISOString()
      });
      
      if (retryOnError && this.currentStep === 1) {
        console.warn('[Career-Ops] Retrying field fill...', error);
        if (maxRetries > 0) {
          await this.sleep(1000);
          return this.fillAllFields(pack, maxRetries - 1);
        }
      }
      
      throw error;
    }
  }

  /**
   * Detect current portal and load specific handlers
   */
  async detectAndLoadPortal() {
    const host = window.location.hostname;
    const portal = this.portalHandlers.detectPortal();
    
    this.currentPortal = portal;
    console.log('[Career-Ops] Detected portal:', portal.key);
    
    // Check for multi-step application
    if (portal.portal.multiStepConfig?.enabled) {
      this.totalSteps = portal.portal.multiStepConfig.steps.length;
      console.log('[Career-Ops] Multi-step application detected:', this.totalSteps, 'steps');
    }
  }

  /**
   * Fill all form fields intelligently
   */
  async fillAllFields(pack, retryCount = 0) {
    this.currentStep = 1;
    
    const profile = pack.profile || {};
    const answers = pack.formAnswers || pack.answers || {};
    
    const filledFields = {};
    let totalAttempted = 0;
    
    // Attempt to fill all visible form fields
    const visibleFields = this.getVisibleFields();
    totalAttempted = visibleFields.length;
    
    for (const field of visibleFields) {
      const label = this.mapper.getFieldLabel(field);
      if (!label) continue;
      
      // Try intelligent matching first
      const fieldType = this.inferFieldType(label);
      const value = this.resolveValue(fieldType, profile, answers);
      
      if (value) {
        this.mapper.setFieldValue(field, value);
        filledFields[fieldType] = true;
        this.metrics.fieldsFilled += 1;
      }
    }
    
    this.metrics.fieldsAttempted = totalAttempted;
    
    // Wait for form reactions
    await this.sleep(1000);
    
    // Check for required fields still missing
    const requiredMissing = visibleFields.filter(f => 
      this.isRequired(f) && !this.isFilledField(f)
    ).length;
    
    this.applicationState.requiredMissing = requiredMissing;
    
    if (requiredMissing > 0 && retryCount < 2) {
      console.warn('[Career-Ops] Still missing required fields, retrying...', requiredMissing);
      await this.sleep(1000);
      return this.fillAllFields(pack, retryCount + 1);
    }
    
    return filledFields;
  }

  /**
   * Infer field type from label
   */
  inferFieldType(label) {
    const normalized = this.mapper.normalizeFieldName(label);
    
    if (/first[\s-]*name|given[\s-]*name|fname/.test(normalized)) return 'first name';
    if (/last[\s-]*name|family[\s-]*name|surname|lname/.test(normalized)) return 'last name';
    if (/^name$|full[\s-]*name|your[\s-]*name/.test(normalized)) return 'name';
    if (/email|e-mail|mail/.test(normalized)) return 'email';
    if (/phone|mobile|telephone|cell|contact[\s-]*number/.test(normalized)) return 'phone';
    if (/linkedin/.test(normalized)) return 'linkedin';
    if (/github|git[\s-]*hub/.test(normalized)) return 'github';
    if (/location|city|address/.test(normalized)) return 'location';
    if (/experience|years|years[\s-]*of/.test(normalized)) return 'years of experience';
    if (/website|portfolio|personal/.test(normalized)) return 'website';
    if (/work[\s-]*auth|authorized|authorization/.test(normalized)) return 'work authorization';
    if (/resume|cv|curriculum/.test(normalized)) return 'resume';
    
    return null;
  }

  /**
   * Resolve value for a field from profile or answers
   */
  resolveValue(fieldType, profile, answers) {
    if (!fieldType) return '';
    
    // Direct answer
    if (answers[fieldType]) return answers[fieldType];
    
    // Profile field
    const key = fieldType.replace(/ /g, '');
    if (profile[key]) return profile[key];
    
    // Computed values
    if (fieldType === 'first name') return (profile.name || '').split(' ')[0];
    if (fieldType === 'last name') return (profile.name || '').split(' ').slice(-1)[0];
    
    // Fallbacks from profile
    switch(fieldType) {
      case 'email': return profile.email || '';
      case 'phone': return profile.phone || '';
      case 'linkedin': return profile.linkedin || '';
      case 'github': return profile.github || '';
      case 'location': return profile.location || 'India';
      case 'years of experience': return profile.years || '0-2';
      case 'work authorization': return 'Yes';
      default: return '';
    }
  }

  /**
   * Get all visible form fields
   */
  getVisibleFields() {
    const fields = document.querySelectorAll('input, textarea, select');
    return Array.from(fields).filter(f => this.mapper.isFieldUsable(f));
  }

  /**
   * Check if field is required
   */
  isRequired(field) {
    return field.required 
      || field.getAttribute('aria-required') === 'true'
      || field.getAttribute('required') !== null;
  }

  /**
   * Check if field is filled
   */
  isFilledField(field) {
    const type = (field.type || '').toLowerCase();
    
    if (type === 'radio' || type === 'checkbox') return field.checked;
    if (field.tagName === 'SELECT') return Boolean(field.value?.trim());
    return Boolean(field.value?.trim());
  }

  /**
   * Attach resume PDF to the application
   */
  async attachResume(pack) {
    console.log('[Career-Ops] Attaching resume:', pack.pdfPath);
    
    const pdfPath = pack.pdfPath;
    if (!pdfPath) {
      return { success: false, error: 'PDF path missing' };
    }
    
    try {
      // Fetch PDF file
      const response = await fetch(`/api/pdf?path=${encodeURIComponent(pdfPath)}`);
      if (!response.ok) {
        throw new Error(`Failed to load PDF: HTTP ${response.status}`);
      }
      
      const blob = await response.blob();
      const file = new File([blob], pdfPath.split('/').pop(), { type: 'application/pdf' });
      
      // Find file input
      let fileInput = document.querySelector('input[type="file"][name*="resume" i]')
        || document.querySelector('input[type="file"]');
      
      if (!fileInput) {
        // Try clicking apply button to reveal file input
        const applyBtn = document.querySelector('[class*="apply" i], button:contains("Apply"), a:contains("Apply")');
        if (applyBtn) {
          applyBtn.click();
          await this.sleep(1500);
          fileInput = document.querySelector('input[type="file"]');
        }
      }
      
      if (!fileInput) {
        return { success: false, error: 'Resume file input not found' };
      }
      
      // Attach file via DataTransfer
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      console.log('[Career-Ops] Resume attached successfully');
      return { success: true };
      
    } catch (error) {
      console.error('[Career-Ops] Failed to attach resume:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle form validation and required field errors
   */
  async handleValidation() {
    const maxAttempts = 3;
    let attempt = 0;
    
    while (attempt < maxAttempts) {
      const requiredMissing = this.getVisibleFields().filter(f =>
        this.isRequired(f) && !this.isFilledField(f)
      );
      
      if (requiredMissing.length === 0) {
        console.log('[Career-Ops] All required fields filled');
        return true;
      }
      
      console.warn('[Career-Ops] Required fields missing:', requiredMissing.length);
      
      // Try to fill with generic responses
      for (const field of requiredMissing) {
        const label = this.mapper.getFieldLabel(field);
        const genericValue = this.getGenericValueForField(label);
        
        if (genericValue) {
          this.mapper.setFieldValue(field, genericValue);
        }
      }
      
      await this.sleep(800);
      attempt += 1;
    }
    
    // Log any remaining issues
    const stilMissing = this.getVisibleFields().filter(f =>
      this.isRequired(f) && !this.isFilledField(f)
    );
    
    if (stilMissing.length > 0) {
      this.applicationState.warnings.push({
        type: 'missing_required_fields',
        count: stilMissing.length,
        fields: stilMissing.map(f => this.mapper.getFieldLabel(f))
      });
    }
  }

  /**
   * Get generic value for common field types
   */
  getGenericValueForField(label) {
    const normalized = this.mapper.normalizeFieldName(label);
    
    if (/gender|demographic|diversity/.test(normalized)) return 'Prefer not to respond';
    if (/authorization|authorized|work authorization/.test(normalized)) return 'Yes';
    if (/notice|period/.test(normalized)) return 'Immediate';
    if (/location|where do you/.test(normalized)) return 'India';
    if (/reason|why|motivation/.test(normalized)) return 'I am interested in this opportunity.';
    
    return null;
  }

  /**
   * Submit the application
   */
  async submitApplication() {
    console.log('[Career-Ops] Submitting application...');
    
    try {
      // Find submit button
      const submitBtn = document.querySelector(
        'button[type="submit"], button:contains("Submit"), [data-automation-id*="submit"], ' +
        'input[type="submit"], a:contains("Submit"), [class*="submit" i]'
      );
      
      if (!submitBtn) {
        return { success: false, error: 'Submit button not found' };
      }
      
      // Scroll to submit button
      submitBtn.scrollIntoView({ behavior: 'smooth' });
      await this.sleep(500);
      
      // Click submit
      submitBtn.click();
      
      console.log('[Career-Ops] Application submitted');
      await this.sleep(2000); // Wait for post-submit navigation
      
      return { success: true };
      
    } catch (error) {
      console.error('[Career-Ops] Failed to submit:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Notify progress to UI/panel
   */
  notifyProgress(message, step, totalSteps) {
    console.log(`[Career-Ops] ${message} (${step}/${totalSteps})`);
    
    // Send to panel
    try {
      chrome.runtime.sendMessage({
        type: 'application-progress',
        message,
        step,
        totalSteps
      }).catch(() => {}); // Ignore if no panel listening
    } catch (e) {
      // Extension context may not be available
    }
  }

  /**
   * Get final application report
   */
  getFinalReport() {
    this.metrics.endTime = Date.now();
    const duration = (this.metrics.endTime - this.metrics.startTime) / 1000;
    
    return {
      success: !this.applicationState.errors.length,
      duration: `${duration}s`,
      filled: this.metrics.fieldsFilled,
      attempted: this.metrics.fieldsAttempted,
      pdfAttached: this.metrics.pdfAttached,
      submitted: this.metrics.submitted,
      errors: this.applicationState.errors,
      warnings: this.applicationState.warnings,
      requiredMissing: this.applicationState.requiredMissing,
      metrics: this.metrics
    };
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ApplicationOrchestrator;
