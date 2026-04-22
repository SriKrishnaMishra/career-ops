/**
 * Hybrid Local AI Integration
 * - Ollama (primary) for offline resume generation
 * - Chrome Prompt API / Gemini Nano (fallback) for zero-setup
 * - Transformers.js for field classification
 * No API keys needed, everything runs locally
 */

export class HybridAIEngine {
  constructor() {
    this.ollamaAvailable = false;
    this.geminiAvailable = false;
    this.classifierReady = false;
    this.models = {
      ollama: 'mistral',
      gemini: null
    };
    this.initializeAI();
  }

  /**
   * Initialize AI systems (async)
   */
  async initializeAI() {
    // Check Ollama availability
    this.ollamaAvailable = await this.checkOllama();
    
    // Check Chrome Prompt API availability
    this.geminiAvailable = await this.checkGeminiNano();
    
    // Initialize field classifier (Transformers.js)
    // Will be lazy-loaded on first use
    
    console.log('[Hybrid AI] Initialization complete', {
      ollama: this.ollamaAvailable,
      gemini: this.geminiAvailable,
      classifier: 'lazy-loaded'
    });
  }

  /**
   * Check if Ollama is running locally
   */
  async checkOllama() {
    try {
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        timeout: 2000
      });
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if Chrome Prompt API (Gemini Nano) is available
   */
  async checkGeminiNano() {
    try {
      // Check if the API exists and system meets requirements
      const available = 'LanguageModel' in globalThis && 
                       'LanguageModel' in globalThis &&
                       typeof globalThis.LanguageModel.create === 'function';
      
      if (available) {
        // Verify system actually meets requirements
        try {
          const session = await globalThis.LanguageModel.create({
            systemPrompt: 'You are a helpful assistant.'
          });
          await session.destroy();
          return true;
        } catch (e) {
          return false; // System doesn't meet requirements
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /**
   * Generate tailored resume for a job using local AI
   * Falls back gracefully: Ollama → Gemini Nano → Basic template
   */
  async generateTailoredResume(jobDescription, userProfile) {
    const prompt = this.buildResumePrompt(jobDescription, userProfile);
    
    // Try Ollama first (best quality, offline)
    if (this.ollamaAvailable) {
      try {
        console.log('[AI] Using Ollama for resume generation...');
        return await this.generateWithOllama(prompt, userProfile);
      } catch (e) {
        console.warn('[AI] Ollama failed, trying Gemini:', e.message);
        this.ollamaAvailable = false; // Mark as unavailable
      }
    }
    
    // Try Chrome Prompt API (zero setup, moderate quality)
    if (this.geminiAvailable) {
      try {
        console.log('[AI] Using Chrome Prompt API for resume generation...');
        return await this.generateWithGeminiNano(prompt, userProfile);
      } catch (e) {
        console.warn('[AI] Gemini failed, using template:', e.message);
        this.geminiAvailable = false;
      }
    }
    
    // Fallback to smart template (always works)
    console.log('[AI] Using smart template (no AI available)');
    return this.generateFromTemplate(jobDescription, userProfile);
  }

  /**
   * Generate with Ollama (local, no API keys, best quality)
   */
  async generateWithOllama(prompt, userProfile) {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.models.ollama,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.3, // Low = consistent, relevant
          top_p: 0.9,
          top_k: 40,
          num_predict: 2000 // Limit length
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama error: HTTP ${response.status}`);
    }

    const data = await response.json();
    const resume = this.parseAIOutput(data.response, userProfile);
    return resume;
  }

  /**
   * Generate with Chrome Prompt API / Gemini Nano (zero setup, moderate quality)
   */
  async generateWithGeminiNano(prompt, userProfile) {
    const session = await globalThis.LanguageModel.create({
      systemPrompt: 'You are an expert resume writer. Generate professional resumes in Markdown format. Be concise and impactful. Output ONLY valid Markdown.'
    });

    let fullResponse = '';
    
    // Stream the response for better UX
    const stream = await session.promptStreaming(prompt);
    for await (const chunk of stream) {
      fullResponse += chunk;
      // Could update UI in real-time here
    }

    await session.destroy();
    
    const resume = this.parseAIOutput(fullResponse, userProfile);
    return resume;
  }

  /**
   * Generate from smart template (fallback, always works)
   */
  generateFromTemplate(jobDescription, userProfile) {
    // Extract key keywords from job description
    const keywords = this.extractKeywords(jobDescription);
    
    // Build resume emphasizing these keywords
    const resume = `# ${userProfile.name}

${userProfile.email} | ${userProfile.phone} | ${userProfile.location}  
${userProfile.linkedin ? `[LinkedIn](${userProfile.linkedin})` : ''} | ${userProfile.github ? `[GitHub](${userProfile.github})` : ''}

## Professional Summary

Results-driven engineer with expertise in ${keywords.slice(0, 3).join(', ')}. Proven track record of building scalable systems and delivering impactful solutions.

## Experience

### Current Role / Most Recent Position
- Implemented ${keywords[0]} solutions leading to measurable improvements
- Architected systems using ${keywords[1]} with focus on reliability and performance
- Collaborated with stakeholders to deliver ${keywords[2]} excellence

### Previous Role
- Led initiatives in ${keywords[0]} implementation
- Optimized workflows resulting in efficiency gains
- Mentored team members on best practices

## Skills

**Core Competencies:** ${keywords.join(', ')}

**Languages:** JavaScript, Python, Go, SQL

**Tools & Platforms:** ${keywords.slice(3, 6).join(', ') || 'Git, Docker, Kubernetes, Cloud platforms'}

## Education

${userProfile.education || 'Bachelor of Technology / Computer Science related field'}

## Certifications & Achievements

- Specialized knowledge in ${keywords[0]}
- Track record of successful project delivery
- Commitment to continuous learning and professional development`;

    return resume;
  }

  /**
   * Parse AI output and ensure valid Markdown
   */
  parseAIOutput(aiGenerated, userProfile) {
    let resume = aiGenerated.trim();
    
    // Ensure it starts with name if not already
    if (!resume.startsWith('#') && userProfile.name) {
      resume = `# ${userProfile.name}\n\n${resume}`;
    }
    
    // Clean up any markdown issues
    resume = resume
      .replace(/```markdown\n?/g, '')
      .replace(/```\n?/g, '')
      .replace(/\n\n\n+/g, '\n\n'); // Remove extra blank lines
    
    return resume;
  }

  /**
   * Extract keywords from job description for matching
   */
  extractKeywords(jobDescription) {
    const text = jobDescription.toLowerCase();
    
    // Common tech keywords
    const keywords = [
      'machine learning', 'deep learning', 'neural network', 'nlp',
      'llm', 'generative ai', 'retrieval augmented generation', 'rag',
      'python', 'javascript', 'typescript', 'go', 'rust',
      'fastapi', 'nodejs', 'react', 'nextjs',
      'docker', 'kubernetes', 'aws', 'gcp', 'azure',
      'postgresql', 'mongodb', 'redis', 'elasticsearch',
      'rest api', 'graphql', 'websocket', 'grpc',
      'microservices', 'distributed systems', 'scalability',
      'agile', 'ci/cd', 'devops', 'monitoring',
      'transformers', 'pytorch', 'tensorflow', 'huggingface',
      'vector database', 'pinecone', 'weaviate', 'milvus'
    ];
    
    const found = keywords.filter(kw => text.includes(kw));
    
    // Return top 10 keywords found, or generic if less than 3
    if (found.length < 3) {
      return ['problem solving', 'system design', 'software engineering', 'leadership', 'innovation', 'reliability', 'performance optimization', 'team collaboration'];
    }
    
    return found.slice(0, 10);
  }

  /**
   * Classify form fields using Transformers.js
   * Identifies what each form field is asking for
   */
  async classifyFormFields(formElements) {
    // Lazy-load Transformers.js only when needed
    if (!this.classifier) {
      console.log('[AI] Loading field classifier (first time only)...');
      await this.loadFieldClassifier();
    }

    const classified = {};
    
    for (const field of formElements) {
      const label = this.getFieldLabel(field);
      if (!label) continue;
      
      const classification = await this.classifier.classify(label);
      classified[field.name || field.id] = {
        label,
        type: classification[0].label,
        confidence: (classification[0].score * 100).toFixed(1)
      };
    }
    
    return classified;
  }

  /**
   * Load Transformers.js classifier (lazy loaded)
   */
  async loadFieldClassifier() {
    try {
      // Dynamically import Transformers.js
      const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers');
      
      // Create zero-shot classifier for form field types
      this.classifier = await pipeline('zero-shot-classification');
      
      console.log('[AI] Field classifier loaded successfully');
    } catch (e) {
      console.warn('[AI] Transformers.js not available, using regex fallback:', e.message);
      this.classifier = null;
    }
  }

  /**
   * Build system prompt for resume generation
   */
  buildResumePrompt(jobDescription, userProfile) {
    return `You are an expert resume writer optimizing a resume for a specific job.

Job Description:
${jobDescription}

User Profile:
${JSON.stringify(userProfile, null, 2)}

Task: Generate a professional resume in Markdown format that:
1. Emphasizes skills and experiences relevant to this job
2. Uses keywords from the job description naturally
3. Is concise and impactful (not longer than 3 pages when printed)
4. Highlights quantifiable achievements
5. Maintains professional tone throughout

Format: Valid Markdown with proper headings (# for main, ## for sections)

Generate the resume now:`;
  }

  /**
   * Get field label text
   */
  getFieldLabel(field) {
    const parts = [
      field.getAttribute('aria-label'),
      field.getAttribute('placeholder'),
      field.getAttribute('name'),
      field.getAttribute('data-testid'),
      field.labels?.[0]?.textContent,
      field.closest('label')?.textContent
    ].filter(Boolean);
    
    return parts.join(' ').trim();
  }

  /**
   * Check system for AI availability
   */
  getCapabilities() {
    return {
      ollama: this.ollamaAvailable,
      geminiNano: this.geminiAvailable,
      classifier: this.classifierReady,
      recommended: this.ollamaAvailable ? 'ollama' : this.geminiAvailable ? 'gemini' : 'template'
    };
  }

  /**
   * Show setup guide if no AI available
   */
  showSetupGuide() {
    if (this.ollamaAvailable || this.geminiAvailable) {
      return null; // AI is available
    }

    return {
      title: '🚀 Optional: Free AI for Better Resumes',
      options: [
        {
          name: 'Ollama (Recommended)',
          description: 'Local LLM - Best quality, 100% offline, no API keys',
          link: 'https://ollama.com',
          setup: 'ollama pull mistral && OLLAMA_ORIGINS=chrome-extension://* ollama serve'
        },
        {
          name: 'Chrome Prompt API',
          description: 'Built-in Gemini Nano - Zero setup, moderate quality',
          link: 'chrome://flags/#prompt-api-for-gemini-nano',
          note: 'Requires Chrome 131+ and 22GB disk space'
        }
      ],
      note: 'System works without AI too - uses smart templates'
    };
  }
}

// Initialize globally
globalThis.__HYBRID_AI__ = new HybridAIEngine();

export default HybridAIEngine;
