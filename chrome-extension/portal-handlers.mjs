/**
 * Portal Handler Registry
 * Centralized configuration for all job portals (Capgemini, TCS, Workday, etc.)
 * Each portal gets: detection rules, field mappings, and custom handlers
 */

export const PORTAL_REGISTRY = {
  capgemini: {
    name: 'Capgemini Careers',
    detectors: [
      host => host.includes('careers.capgemini.com'),
      host => host.includes('capgemini.com') && document.title.includes('Apply')
    ],
    domainPatterns: ['careers.capgemini.com'],
    priority: 10,
    
    // Field mapping: [form_selector, expected_field_names, value_source]
    fieldMappings: {
      firstName: {
        selectors: [
          'input[name*="first" i]',
          'input[data-testid*="firstName" i]',
          'input[placeholder*="first name" i]'
        ],
        fallback: (profile) => (profile.name || '').split(' ')[0]
      },
      lastName: {
        selectors: [
          'input[name*="last" i]',
          'input[data-testid*="lastName" i]',
          'input[placeholder*="last name" i]'
        ],
        fallback: (profile) => (profile.name || '').split(' ').slice(-1)[0]
      },
      email: {
        selectors: [
          'input[type="email"]',
          'input[name*="email" i]',
          'input[data-testid*="email" i]'
        ],
        fallback: (profile) => profile.email || ''
      },
      phone: {
        selectors: [
          'input[type="tel"]',
          'input[name*="phone" i]',
          'input[name*="mobile" i]',
          'input[data-testid*="phone" i]'
        ],
        fallback: (profile) => profile.phone || ''
      },
      resume: {
        selectors: [
          'input[type="file"][name*="resume" i]',
          'input[type="file"][name*="cv" i]',
          'input[type="file"][accept*="pdf" i]'
        ]
      },
      location: {
        selectors: [
          'select[name*="location" i]',
          'select[name*="city" i]',
          'input[name*="location" i]'
        ],
        fallback: (profile) => profile.location || 'India'
      },
      yearsOfExperience: {
        selectors: [
          'select[name*="experience" i]',
          'input[name*="experience" i]',
          'select[name*="years" i]'
        ],
        fallback: (profile) => profile.years || '0-2'
      }
    },
    
    // Custom multi-step handler
    multiStepConfig: {
      enabled: true,
      steps: [
        { name: 'personal_info', fields: ['firstName', 'lastName', 'email', 'phone'] },
        { name: 'location_experience', fields: ['location', 'yearsOfExperience'] },
        { name: 'resume_upload', fields: ['resume'] },
        { name: 'review_submit', fields: [] }
      ]
    },
    
    // Special field handlers for Capgemini
    specialHandlers: {
      workAuthorization: {
        selectors: ['select[name*="authorization" i]', 'input[name*="authorized" i]'],
        options: ['India', 'Yes', 'Authorized']
      },
      noticePeriod: {
        selectors: ['select[name*="notice" i]'],
        preferredValue: 'Immediate'
      }
    }
  },

  tcs: {
    name: 'TCS Careers',
    detectors: [
      host => host.includes('tcs.com') && host.includes('careers'),
      host => host.includes('careers.tcs.com')
    ],
    domainPatterns: ['careers.tcs.com', 'tcs.com/careers'],
    priority: 9,
    
    fieldMappings: {
      firstName: {
        selectors: ['input[name="firstName"]', 'input[id*="firstName"]'],
        fallback: (profile) => (profile.name || '').split(' ')[0]
      },
      lastName: {
        selectors: ['input[name="lastName"]', 'input[id*="lastName"]'],
        fallback: (profile) => (profile.name || '').split(' ').slice(-1)[0]
      },
      email: {
        selectors: ['input[type="email"][name*="email"]'],
        fallback: (profile) => profile.email || ''
      },
      phone: {
        selectors: ['input[name*="phone"]', 'input[name*="mobile"]'],
        fallback: (profile) => profile.phone || ''
      },
      resume: {
        selectors: ['input[type="file"][id*="resume"]', 'input[type="file"][id*="cv"]']
      }
    }
  },

  accenture: {
    name: 'Accenture Careers',
    detectors: [
      host => host.includes('accenture.com') && (host.includes('careers') || document.title.includes('Apply')),
      host => host.includes('careers.accenture.com')
    ],
    domainPatterns: ['careers.accenture.com'],
    priority: 9,
    
    fieldMappings: {
      firstName: {
        selectors: ['input[data-qa*="firstName"]', 'input[name*="first"]'],
        fallback: (profile) => (profile.name || '').split(' ')[0]
      },
      lastName: {
        selectors: ['input[data-qa*="lastName"]', 'input[name*="last"]'],
        fallback: (profile) => (profile.name || '').split(' ').slice(-1)[0]
      },
      email: {
        selectors: ['input[type="email"]'],
        fallback: (profile) => profile.email || ''
      },
      phone: {
        selectors: ['input[type="tel"]'],
        fallback: (profile) => profile.phone || ''
      },
      linkedin: {
        selectors: ['input[placeholder*="LinkedIn"]', 'input[name*="linkedin"]'],
        fallback: (profile) => profile.linkedin || ''
      }
    }
  },

  infosys: {
    name: 'Infosys Careers',
    detectors: [
      host => host.includes('infosys.com') && host.includes('careers'),
      host => host.includes('careers.infosys.com')
    ],
    domainPatterns: ['careers.infosys.com'],
    priority: 9,
    
    fieldMappings: {
      fullName: {
        selectors: ['input[placeholder*="name" i]'],
        fallback: (profile) => profile.name || ''
      },
      email: {
        selectors: ['input[type="email"]'],
        fallback: (profile) => profile.email || ''
      },
      phone: {
        selectors: ['input[type="tel"]'],
        fallback: (profile) => profile.phone || ''
      },
      resume: {
        selectors: ['input[type="file"]']
      }
    }
  },

  workday: {
    name: 'Workday ATS',
    detectors: [
      host => host.includes('wd5.myworkdaysite.com'),
      host => host.includes('workday.com') && window.location.href.includes('/applyForJob'),
      () => document.querySelector('[data-automation-id="apply-button"], .workday-button')
    ],
    domainPatterns: ['wd5.myworkdaysite.com', 'myworkdaysite.com'],
    priority: 8,
    isMultiPage: true,
    
    fieldMappings: {
      firstName: {
        selectors: ['input[data-automation-id*="firstName"]'],
        fallback: (profile) => (profile.name || '').split(' ')[0]
      },
      lastName: {
        selectors: ['input[data-automation-id*="lastName"]'],
        fallback: (profile) => (profile.name || '').split(' ').slice(-1)[0]
      },
      email: {
        selectors: ['input[data-automation-id*="email"]'],
        fallback: (profile) => profile.email || ''
      },
      phone: {
        selectors: ['input[data-automation-id*="phone"]'],
        fallback: (profile) => profile.phone || ''
      },
      resume: {
        selectors: ['input[type="file"]']
      }
    },
    
    // Workday has specific next/continue buttons
    navigationSelectors: {
      nextButton: '[data-automation-id="nextButton"], button:contains("Next"), button:contains("Continue")',
      submitButton: '[data-automation-id="submit"], button:contains("Submit")'
    }
  },

  linkedin: {
    name: 'LinkedIn Apply',
    detectors: [
      host => host.includes('linkedin.com'),
      () => document.querySelector('[data-test-id="easy-apply-button"]')
    ],
    domainPatterns: ['linkedin.com'],
    priority: 7,
    isEasyApply: true,
    
    fieldMappings: {
      resume: {
        selectors: ['input[type="file"]'],
        description: 'Resume file (PDF/DOC)'
      },
      coverLetter: {
        selectors: ['textarea[placeholder*="cover letter" i]'],
        description: 'Cover letter text'
      }
    }
  },

  generic: {
    name: 'Generic/Custom Job Portal',
    detectors: [
      () => true  // Fallback for any portal
    ],
    priority: 1,
    
    // Generic field inference
    fieldMappings: {
      name: {
        selectors: [
          'input[name*="name" i]',
          'input[placeholder*="name" i]',
          'textarea[name*="name" i]'
        ]
      },
      email: {
        selectors: [
          'input[type="email"]',
          'input[name*="email" i]'
        ]
      },
      phone: {
        selectors: [
          'input[type="tel"]',
          'input[name*="phone" i]',
          'input[name*="mobile" i]'
        ]
      },
      resume: {
        selectors: ['input[type="file"]']
      }
    }
  }
};

/**
 * Detect which portal the user is currently on
 */
export function detectPortal() {
  const host = window.location.hostname.toLowerCase();
  
  for (const [key, portal] of Object.entries(PORTAL_REGISTRY)) {
    if (key === 'generic') continue; // Check specific portals first
    
    // Check hostname detectors
    if (portal.detectors && portal.detectors[0]) {
      try {
        if (portal.detectors[0](host)) {
          return { key, portal };
        }
      } catch (e) {
        // Continue to next detector
      }
    }
    
    // Check domain patterns
    if (portal.domainPatterns) {
      for (const pattern of portal.domainPatterns) {
        if (host.includes(pattern)) {
          return { key, portal };
        }
      }
    }
    
    // Check additional detectors (DOM checks)
    if (portal.detectors && portal.detectors.length > 1) {
      for (let i = 1; i < portal.detectors.length; i++) {
        try {
          if (portal.detectors[i](host)) {
            return { key, portal };
          }
        } catch (e) {
          // Continue
        }
      }
    }
  }
  
  // Fallback to generic
  return { key: 'generic', portal: PORTAL_REGISTRY.generic };
}

/**
 * Get the best field selector for a given field type on current portal
 */
export function getFieldSelector(fieldName, portalKey = null) {
  const { portal } = detectPortal();
  const mappings = portalKey 
    ? PORTAL_REGISTRY[portalKey]?.fieldMappings 
    : portal.fieldMappings;
  
  const fieldConfig = mappings?.[fieldName];
  if (!fieldConfig?.selectors) return null;
  
  return fieldConfig.selectors[0]; // Return most specific selector
}

/**
 * Get all applicable selectors for a field
 */
export function getAllSelectorsForField(fieldName, portalKey = null) {
  const { portal } = detectPortal();
  const mappings = portalKey 
    ? PORTAL_REGISTRY[portalKey]?.fieldMappings 
    : portal.fieldMappings;
  
  return mappings?.[fieldName]?.selectors || [];
}

export default PORTAL_REGISTRY;
