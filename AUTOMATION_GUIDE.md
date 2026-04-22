# Career-Ops Enhanced Automation Guide

## 🎯 Complete Automated Job Application System

Your career-ops system now has **enterprise-grade automation** for applying to jobs across multiple portals with **zero manual intervention**.

---

## 📊 System Components

### 1. **Portal Handler Registry** (`portal-handlers.mjs`)
- Detects job portals automatically
- Provides portal-specific field mappings
- Supports: Capgemini, TCS, Accenture, Infosys, Workday, Greenhouse, Ashby, Lever, LinkedIn
- Falls back to intelligent generic handler for unknown portals

**Supported Portals:**
| Portal | Support Level | Auto-Fill | Multi-Step |
|--------|--------------|-----------|-----------|
| Capgemini | 🟢 Full | ✅ Yes | ✅ Yes |
| TCS | 🟢 Full | ✅ Yes | ✅ Yes |
| Accenture | 🟢 Full | ✅ Yes | ✅ Yes |
| Infosys | 🟢 Full | ✅ Yes | ✅ Yes |
| Workday | 🟢 Full | ✅ Yes | ✅ Yes |
| Greenhouse | 🟢 Full | ✅ Yes | ✅ Yes |
| Ashby | 🟢 Full | ✅ Yes | ✅ Yes |
| Lever | 🟢 Full | ✅ Yes | ✅ Yes |
| LinkedIn (Easy Apply) | 🟡 Good | ✅ Yes | ❌ No |
| Generic/Custom | 🟡 Good | ✅ Yes | ⚠️ Best-effort |

### 2. **Smart Field Mapper** (`smart-field-mapper.mjs`)
- Learns from every application you fill
- Uses semantic similarity to match fields
- **Caches successful selectors** for future use
- No manual field mapping needed

**How it learns:**
```
First application on Capgemini → Scanner finds "firstName" field
Maps it to the exact selector and caches
Second application on Capgemini → Uses cached selector (instant match)
If selector changes → Re-learns automatically
```

### 3. **Application Orchestrator** (`orchestrator.mjs`)
- Manages complete multi-step application workflows
- Handles validation and error recovery
- Automatic resume attachment
- Conditional form submission

**Workflow Steps:**
1. Detect portal and load handlers
2. Fill all visible form fields intelligently
3. Attach tailored resume PDF
4. Validate form (with retry logic)
5. Submit application (manual or automatic)

### 4. **Success Learner & Analytics** (`success-learner.mjs`)
- Tracks which portals/fields work best
- Calculates success rates per portal
- Recommends field focus areas
- Provides performance dashboards

**Metrics Tracked:**
- Total applications (all time)
- Success rate per portal
- Average time per portal
- Field fill success rates
- Form complexity analysis

### 5. **Integration Bridge** (`enhanced-integration.mjs`)
- Connects new systems with existing code
- Provides unified API for extensions/services
- Manages inter-module communication

---

## 🚀 Quick Start: Fully Automatic Application

### **Option 1: Single Application (Capgemini Example)**

```bash
# 1. Open the Capgemini job link in browser
# https://careers.capgemini.com/job/Mumbai-Software-Engineer/1204734401/

# 2. Add the job to your pipeline
npm run apply-link https://careers.capgemini.com/job/Mumbai-Software-Engineer/1204734401/ \
  --category ai/ml

# 3. Open the Extension Panel (Ctrl+Shift+9 or icon)
# - Select the generated role from "Applications" list
# - Click "Update resume + ATS"
# - Wait for tailored resume generation

# 4. Click "Start Automatic Application" button
# - System auto-fills all fields
# - Attaches tailored resume
# - Shows you completed form (ready to review)
# - Option to auto-submit or review first
```

### **Option 2: Batch Apply (Multiple Jobs)**

```bash
# Apply to 5 jobs automatically
for url in \
  "https://careers.capgemini.com/job/Mumbai-Software-Engineer/1204734401/" \
  "https://careers.accenture.com/job/ai-engineer" \
  "https://careers.tcs.com/job/ml-specialist"
do
  npm run apply-link "$url" --category ai/ml
done

# Then use batch runner
npm run batch-apply --auto-submit --max-concurrent=2
```

### **Option 3: Command-Line Full Automation**

```bash
# Everything automatic - add job, generate resume, apply, submit
npm run auto-apply https://careers.capgemini.com/job/Mumbai-Software-Engineer/1204734401/ \
  --auto-submit \
  --wait-for-result \
  --log-report

# Output:
# ✅ Application started
# ✅ Portal detected: capgemini
# ✅ 12 fields filled (email, phone, resume, etc.)
# ✅ Resume attached: output/role-resumes/capgemini-software-engineer.pdf
# ✅ Application submitted
# 📊 Success! Duration: 24s
```

---

## 🎛️ Configuration & Customization

### **Automatic Learning Config**

Create `config/automation.yml`:

```yaml
# Automation settings
automation:
  # Which portals to auto-apply to
  enabled_portals:
    - capgemini
    - tcs
    - accenture
    - infosys
    - workday
  
  # Auto-submit settings
  auto_submit:
    enabled: false  # Manual review first (recommended)
    confidence_threshold: 0.85  # Only submit if 85%+ confidence
    required_fields_filled: 0.95  # At least 95% required fields
  
  # Retry/recovery
  retry:
    max_retries: 2
    wait_between_retries: 1000ms
    on_missing_fields: skip  # or 'skip' / 'fill_generic'
  
  # Logging
  logging:
    verbose: true
    save_reports: true
    report_path: "data/application-reports/"
  
  # Learning system
  learning:
    cache_successful_selectors: true
    cache_field_patterns: true
    track_success_rates: true
    export_stats_daily: true

# Portal-specific customization
portals:
  capgemini:
    priority: 10
    wait_after_detect: 2000ms
    special_fields:
      notice_period: "Immediate"
      work_authorization: "India"
  
  workday:
    multi_step: true
    wait_between_steps: 1500ms
    navigation_timeout: 5000ms
```

### **Custom Field Mapping**

For portals not in default registry:

```javascript
// In portal-handlers.mjs, add:
export const CUSTOM_PORTALS = {
  'your-company-careers': {
    name: 'Your Company',
    detectors: [host => host.includes('careers.yourcompany.com')],
    priority: 9,
    fieldMappings: {
      firstName: {
        selectors: ['#firstName', 'input[name="fname"]']
      },
      // ... other fields
    }
  }
};
```

---

## 📈 Monitoring & Analytics

### **View Application Statistics**

```bash
# Get summary of all applications
npm run show-stats

# Output:
# 📊 Career-Ops Statistics
# Total Applications: 47
# Success Rate: 92%
# ✅ Successful: 43
# ❌ Failed: 2
# ⏳ Pending: 2
# 
# Best Portal: Capgemini (95% success)
# Best Field: Email (100% fill rate)
# Avg Time: 28 seconds
```

### **View Portal-Specific Stats**

```bash
npm run stats --portal capgemini

# Capgemini Statistics
# Total Attempts: 5
# Success: 4 (80%)
# Avg Time: 26 seconds
# Fields Filled: 12/13 (92%)
```

### **Export Analytics Report**

```bash
# Export for analysis
npm run export-analytics --format=json --output=reports/2026-04-21-report.json

# Includes:
# - Success rates by portal
# - Field fill success rates
# - Form complexity analysis
# - Recommended improvements
```

---

## 🔄 Continuous Learning & Improvement

### **How the System Learns**

1. **Field Pattern Learning**
   - First fill on a portal → Smart mapper learns the field structure
   - Caches successful selectors in browser storage
   - Next fill on same portal → Uses cached selectors (instant match)

2. **Success Rate Tracking**
   - Tracks which fields fill successfully
   - Identifies problem portals/fields
   - Suggests improvements

3. **Behavioral Analysis**
   - Tracks form interactions (inputs, clicks, validation)
   - Measures form complexity
   - Identifies difficult form patterns

### **Accessing Learning Data**

```javascript
// In browser console:

// View field cache statistics
console.log(__SMART_FIELD_MAPPER__.getCacheStats());
// Output: { totalHosts: 8, totalMappings: 56, byHost: {...} }

// View success analytics
console.log(__SUCCESS_LEARNER__.exportAnalytics());
// Output: { totalApplications: 47, successRate: 92%, byPortal: {...} }

// View field success rates
console.log(__SUCCESS_LEARNER__.getFieldPriority());
// Most successful fields first
```

---

## 🛡️ Error Handling & Recovery

### **Automatic Error Recovery**

The system automatically:
- Retries failed field fills (2 attempts by default)
- Waits for form interactions to complete
- Validates required fields after fill
- Provides detailed error reports

### **Common Issues & Solutions**

| Issue | Cause | Solution |
|-------|-------|----------|
| Fields not filling | Form not loaded yet | Increase wait time in config |
| Resume not attaching | File input not found | Check selector pattern |
| Required fields missing | Field not recognized | Manually fill + system will learn |
| Submit button not found | Portal layout unknown | Manual submission or add custom handler |
| Portal not recognized | Unknown portal structure | Falls back to generic handler |

### **Detailed Error Reports**

```bash
npm run show-last-error

# Output:
# Last Application Error
# Portal: capgemini
# Step: Fill Fields
# Error: Required field "location" still empty
# Missing Fields: ['location'] (1 critical)
# Attempt: 1/2
# 
# Recommendation: Add location to profile or answers
# Command: npm run update-profile --location "Mumbai"
```

---

## 🔐 Privacy & Data Storage

All learning data is stored **locally in your browser**:
- Field cache → Browser localStorage
- Success analytics → Browser localStorage
- Form behaviors → Browser sessionStorage only

**No data sent to any server** except job portals themselves.

**Export/Backup your data:**

```bash
npm run backup-career-ops

# Creates backup file:
# backup-2026-04-21-career-ops.json
# Contains: field cache, analytics, settings
```

---

## 📋 Commands Reference

### **Quick Apply**
```bash
npm run auto-apply <URL>              # Auto-apply to a job
npm run batch-apply                   # Apply to all queued jobs
npm run apply-link <URL>              # Add job to pipeline
```

### **Generation & Prep**
```bash
npm run generate-tailored-resumes     # Generate all tailored resumes
npm run regenerate-single-pack <path> # Regenerate specific job pack
npm run generate-pdf                  # Generate PDFs
```

### **Automation & Control**
```bash
npm run start-automation              # Start the automation service
npm run stop-automation               # Stop automation
npm run reset-learning                # Clear all learning data
npm run test-portal-detection         # Test portal detection
```

### **Monitoring**
```bash
npm run show-stats                    # Show summary statistics
npm run show-pipeline                 # Show queued applications
npm run show-last-error               # Show last error
npm run export-analytics              # Export full analytics
```

---

## 🧪 Testing & Validation

### **Test Portal Detection**

```bash
npm run test-portal-detection
# Tests all portals, shows detection accuracy
```

### **Dry-Run Application**

```bash
npm run auto-apply <URL> --dry-run --verbose
# Shows what would be filled without actually filling
```

### **Validate Configuration**

```bash
npm run validate-config
# Checks portal handlers, field mappings, automation settings
```

---

## 🎓 Advanced: Custom Portal Handler

Add a new portal in 30 seconds:

```javascript
// In portal-handlers.mjs

export const PORTAL_REGISTRY = {
  // ... existing portals ...
  
  mycompany: {
    name: 'My Company Careers',
    detectors: [
      host => host.includes('careers.mycompany.com'),
      host => host.includes('mycompany.com/jobs')
    ],
    priority: 9,
    
    fieldMappings: {
      firstName: {
        selectors: ['input[name="fname"]', '#firstName'],
        fallback: (profile) => (profile.name || '').split(' ')[0]
      },
      email: {
        selectors: ['input[type="email"]'],
        fallback: (profile) => profile.email || ''
      },
      // ... add all fields
    },
    
    // Optional: Special handling
    multiStepConfig: {
      enabled: true,
      steps: [
        { name: 'personal_info', fields: ['firstName', 'email'] },
        { name: 'resume', fields: ['resume'] },
        { name: 'review', fields: [] }
      ]
    }
  }
};
```

---

## 📞 Troubleshooting

### **No fields are filling?**

1. Check console for errors:
   ```javascript
   // In browser console
   console.log(__CAREER_OPS_ENHANCED__.getStatistics());
   ```

2. Verify form is loaded:
   ```javascript
   document.querySelectorAll('input, textarea, select').length
   ```

3. Check current portal detected:
   ```javascript
   console.log(detectPortal());
   ```

### **Resume not attaching?**

1. Verify PDF path is correct in pack file
2. Check file input selector:
   ```javascript
   document.querySelector('input[type="file"]')
   ```

3. Try manual attachment first so system learns the selector

### **Application not submitting?**

1. Check if form validation passes:
   ```javascript
   document.querySelectorAll('input[required]:invalid').length
   ```

2. Verify submit button is visible and clickable:
   ```javascript
   document.querySelector('button[type="submit"]')
   ```

### **Still having issues?**

```bash
# Get detailed debug report
npm run debug-last-application --verbose

# This will show:
# - Complete field fill log
# - Resume attachment attempts
# - Form validation results
# - Submission attempts
# - Exact error messages
```

---

## 🎉 You're All Set!

Your career-ops system is now:

✅ **Fully automatic** - Apply with one click or command  
✅ **Self-learning** - Improves with every application  
✅ **Multi-portal** - Works on Capgemini, TCS, Accenture, Infosys, Workday, and more  
✅ **Intelligent** - Semantic field matching, not just regex  
✅ **Logged & tracked** - Full analytics and reporting  
✅ **Error-resilient** - Automatic retry and recovery  
✅ **Privacy-first** - All data stored locally  

**Ready to apply?** Start with:
```bash
npm run auto-apply https://careers.capgemini.com/job/Mumbai-Software-Engineer/1204734401/ --dry-run
```

Then remove `--dry-run` to actually apply!

---

**Last Updated:** April 21, 2026  
**System Version:** Career-Ops Enhanced 2.0
