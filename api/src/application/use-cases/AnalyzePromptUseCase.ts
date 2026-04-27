import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from 'uuid';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IAILogRepository } from '../../domain/repositories/IAILogRepository';
import { IMediaRepository } from '../../domain/repositories/IMediaRepository';
import { IStorageService } from '../../domain/services/IStorageService';
import { CostCalculator } from '../../shared/utils/CostCalculator';
import {
  AnalyzePromptRequestDto,
  AnalyzePromptResponseDto,
  ClarificationQuestion
} from '../dto/AnalyzePromptDto';
import { User } from '../../domain/entities/User';

const ANALYSIS_SYSTEM_PROMPT = `You are helping a non-technical domain expert clarify their vision for a frontend website or prototype.

WHO THE USER IS:
- A subject-matter / domain expert (e.g., a restaurant owner, lawyer, fitness coach, teacher, consultant)
- They are NOT a website specialist, designer, or developer
- They know their business, audience, and content — but not how websites should be structured
- They will pick a visual design from a separate gallery, so DESIGN is already handled elsewhere

IMPORTANT: We are building FRONTEND-ONLY websites and prototypes (React apps), NOT full-stack applications. No backend, no database, no authentication systems - just UI/UX.

YOUR TASKS:
1. Generate a SHORT project name (2-4 words) that describes WHAT they're building
2. Analyze the user's prompt to understand what they're building
3. Identify what's ALREADY specified (don't ask about those things)
4. Generate 1-3 SHORT clarification questions that ONLY a domain expert can answer

PROJECT NAME RULES:
- 2-4 words maximum, no more than 30 characters
- Describe WHAT the app is (not features)
- Use Title Case
- Examples: "Task Tracker", "Recipe Book", "Weather Dashboard", "Portfolio Site", "Expense Manager"
- Avoid generic names like "My App", "New Project", "Website"

QUESTION SELECTION RULES:
- NEVER ask about visual design, look, feel, color, theme, layout style, hero style, card vs list, density, image size, animations, light/dark mode, or any other design/aesthetic decision — the user picks a design separately
- NEVER ask about how the website should be STRUCTURED or ORGANIZED — that's our job, not theirs
- ONLY ask things the domain expert is uniquely qualified to answer: their audience, their goal, their content, their offering, their business
- NEVER ask about things already mentioned in the prompt
- If the user attached a text document (marked "USER ATTACHED TEXT FILE"), treat its full contents as part of the prompt — don't ask about anything specified in the document, and don't ask the user to share/describe a doc they already attached
- If the user attached images/media (marked "USER ATTACHED MEDIA"), don't ask them to share visual references
- If the prompt (including any attached document) is detailed (50+ words), ask fewer questions (1-2)
- If the prompt is vague (under 20 words), ask more questions (2-3)
- Use plain, non-technical language — no jargon (no "CTA", "hero section", "above the fold", "conversion", "responsive", etc.)

GOOD QUESTION TYPES (domain/business questions only):
- Primary audience: "Who is this mainly for?" → e.g. "New customers / Existing clients / Industry peers"
- Main goal: "What's the #1 thing visitors should do?" → e.g. "Book a consultation / Buy a product / Learn about us / Sign up for updates"
- Key offering: "What's most important to highlight?" → e.g. "Services / Portfolio / Pricing / Team"
- Content available: "What do you have ready to show?" → e.g. "Photos & descriptions / Just text / Customer reviews / Nothing yet"
- Stage of business: "Where are you at?" → e.g. "Just starting out / Established / Rebranding"
- Trust signals: "What builds credibility for your audience?" → e.g. "Client testimonials / Case studies / Credentials & awards"

BAD QUESTIONS — NEVER ASK THESE:
- "What color mood?" / "Light or dark theme?"
- "Single page or multi-page?" / "How should content be organized?"
- "Grid, list, or carousel?" / "How prominent should images be?"
- "What should visitors see first?" / "Hero style?"
- "Compact or spacious?" / "How much info on screen?"
- Anything about layout, navigation structure, animations, or visual hierarchy

FORMAT RULES:
- Questions under 12 words, written in plain everyday language
- Option labels: 2-4 words, concrete and business-oriented
- Option descriptions: under 8 words
- 2-3 options per question

ADDITIONAL TASKS:

TASK A - Landing page detection:
Set isLandingPageRequest to true if:
- The prompt contains the word "website", "site", "landing page", "homepage", or "page"
- The user wants a landing page, marketing page, portfolio, or business website
- ANY request that mentions "website" regardless of the type (e.g., "calculator website" = true)
Set isLandingPageRequest to false ONLY for:
- Pure interactive apps/tools that do NOT mention "website" or "site" (e.g., "build me a todo app")
- Games or interactive experiences without "website" in the prompt

TASK B - Template selection:
Choose the best template for this request:
- "astro-website": Use for blogs, articles, portfolios, landing pages, link-in-bio, marketing sites, documentation, content sites, company websites, product pages, agency sites — any site primarily about content/presentation with no complex client-side interactivity.
- "react18-ts": Use for interactive apps, dashboards, calculators, games, tools, e-commerce with cart/checkout, chat apps, booking systems, admin panels — anything requiring complex client-side state management and interactivity.

DEFAULT TO "astro-website" if ambiguous. Most requests are for content/presentation sites.
Only use "react18-ts" when the prompt clearly describes an interactive APPLICATION (not just a website).

RESPONSE FORMAT (JSON only):
{
  "projectName": "Short Descriptive Name",
  "isLandingPageRequest": true,
  "suggestedTemplate": "astro-website",
  "questions": [
    {
      "id": "q1",
      "question": "Your specific question here?",
      "options": [
        { "id": "opt1", "label": "Short Label", "description": "Brief explanation" },
        { "id": "opt2", "label": "Short Label", "description": "Brief explanation" }
      ]
    }
  ]
}

Output ONLY valid JSON. No markdown, no explanations.`;

export class AnalyzePromptUseCase {
  private client: Anthropic;
  private readonly HAIKU_MODEL = 'claude-haiku-4-5-20251001';

  constructor(
    private projectRepository: IProjectRepository,
    private buildRepository: IBuildRepository,
    private aiLogRepository: IAILogRepository,
    private mediaRepository: IMediaRepository,
    private storageService: IStorageService,
    apiKey?: string
  ) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      timeout: 60 * 1000, // 1 minute timeout for analysis
    });
  }

  async execute(dto: AnalyzePromptRequestDto, user: User): Promise<AnalyzePromptResponseDto> {
    const analysisId = uuidv4();
    const startTime = Date.now();

    // Check if this is the new project flow (no projectId) or existing project
    const isNewProjectFlow = !dto.projectId;

    if (!isNewProjectFlow) {
      // Existing project flow - validate access
      const hasAccess = await this.projectRepository.checkUserAccess(user.id, dto.projectId!);
      if (!hasAccess) {
        throw new Error('Access denied to project');
      }

      // Check if this is first prompt (no successful builds)
      const builds = await this.buildRepository.findByProjectId(dto.projectId!);
      const hasSuccessfulBuild = builds.some(b => b.status === 'COMPLETED');

      // If there's already a successful build, skip clarification
      if (hasSuccessfulBuild) {
        return {
          needsClarification: false,
          analysisId
        };
      }
    }

    // Enhance prompt with attached document content so the AI can see what the user referenced
    const enhancedPrompt = await this.buildPromptWithAttachments(dto.prompt, dto.mediaIds);

    // Call AI to generate clarification questions and project name
    try {
      const result = await this.generateAnalysis(enhancedPrompt, dto.prompt, user.id, dto.projectId, analysisId, startTime);

      if (!result.questions || result.questions.length === 0) {
        // AI didn't generate valid questions, skip clarification but return name
        return {
          needsClarification: false,
          analysisId,
          suggestedProjectName: result.projectName,
          showInspirationGallery: result.isLandingPageRequest,
          suggestedTemplate: result.suggestedTemplate
        };
      }

      return {
        needsClarification: true,
        questions: result.questions,
        analysisId,
        suggestedProjectName: result.projectName,
        showInspirationGallery: result.isLandingPageRequest,
        suggestedTemplate: result.suggestedTemplate
      };
    } catch (error) {
      console.error('[AnalyzePromptUseCase] Error generating analysis:', error);
      // On error, proceed without clarification but generate a fallback name
      return {
        needsClarification: false,
        analysisId,
        suggestedProjectName: this.generateFallbackName(dto.prompt),
        showInspirationGallery: false
      };
    }
  }

  private generateFallbackName(prompt: string): string {
    // Extract first few meaningful words from prompt as fallback
    const words = prompt.trim().split(/\s+/).slice(0, 3);
    if (words.length === 0) return 'New Project';

    // Title case the words
    const titleCased = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    return titleCased.substring(0, 30); // Max 30 chars
  }

  private async buildPromptWithAttachments(
    prompt: string,
    mediaIds?: string[]
  ): Promise<string> {
    if (!mediaIds || mediaIds.length === 0) {
      return prompt;
    }

    try {
      const medias = await this.mediaRepository.findByIds(mediaIds);
      if (medias.length === 0) {
        return prompt;
      }

      const textMedias = medias.filter(m => m.mimeType === 'text/plain');
      const nonTextCount = medias.length - textMedias.length;

      let enhanced = prompt;

      if (textMedias.length > 0) {
        const textContents = await Promise.all(
          textMedias.map(async (media) => {
            const buffer = await this.storageService.downloadFile(media.s3Key, media.s3Bucket);
            const fileName = media.s3Key.split('/').pop() || 'pasted-text.txt';
            return { fileName, content: buffer.toString('utf-8') };
          })
        );

        for (const textFile of textContents) {
          enhanced += `\n\nUSER ATTACHED TEXT FILE (${textFile.fileName}):\n---\n${textFile.content}\n---`;
        }
        console.log(`[AnalyzePromptUseCase] Injected ${textContents.length} text file(s) into analyze prompt`);
      }

      if (nonTextCount > 0) {
        enhanced += `\n\nUSER ATTACHED MEDIA: ${nonTextCount} image/video file(s) provided as visual reference.`;
      }

      return enhanced;
    } catch (error) {
      console.error('[AnalyzePromptUseCase] Failed to load attachments, proceeding with prompt only:', error);
      return prompt;
    }
  }

  private async generateAnalysis(
    userPrompt: string,
    originalPrompt: string,
    userId: string,
    projectId: string | undefined,
    analysisId: string,
    startTime: number
  ): Promise<{ questions: ClarificationQuestion[]; projectName: string; isLandingPageRequest: boolean; suggestedTemplate: string }> {
    console.log('[AnalyzePromptUseCase] Generating analysis (name + questions) using Haiku...');

    const response = await this.client.messages.create({
      model: this.HAIKU_MODEL,
      max_tokens: 1024,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `User's request: "${userPrompt}"

Analyze this prompt and:
1. Generate a short, descriptive project name (2-4 words, max 30 chars)
2. Determine if this is a landing page/website request (isLandingPageRequest: true/false)
3. Generate context-specific clarification questions

Remember:
- Only ask about things NOT already specified
- Make questions relevant to THIS specific type of site/app
- Fewer questions for detailed prompts, more for vague ones
- Set isLandingPageRequest to true for websites, landing pages, portfolios, marketing pages
- Choose suggestedTemplate: "astro-website" for content/presentation sites, "react18-ts" for interactive apps`
        }
      ]
    });

    const durationMs = Date.now() - startTime;
    const rawContent = response.content[0].type === 'text' ? response.content[0].text : '';

    // Log the AI call
    try {
      const cost = CostCalculator.calculateCost(
        this.HAIKU_MODEL,
        response.usage.input_tokens,
        response.usage.output_tokens
      );

      await this.aiLogRepository.create({
        provider: 'anthropic',
        model: this.HAIKU_MODEL,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        costUsd: cost,
        durationMs,
        userId,
        projectId: projectId || undefined,
        prompt: userPrompt,
        systemPrompt: ANALYSIS_SYSTEM_PROMPT,
        aiResponse: rawContent
      });
      console.log(`[AnalyzePromptUseCase] Logged analysis to ai_logs (cost: $${cost.toFixed(6)})`);
    } catch (logError) {
      console.error('[AnalyzePromptUseCase] Failed to log AI call:', logError);
    }

    // Parse the JSON response (strip markdown code blocks and extra text)
    try {
      let jsonContent = rawContent.trim();

      // Remove markdown code blocks if present
      if (jsonContent.includes('```')) {
        // Extract content between code blocks
        const codeBlockMatch = jsonContent.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) {
          jsonContent = codeBlockMatch[1].trim();
        }
      }

      // If still not starting with {, try to find JSON object in the text
      if (!jsonContent.startsWith('{')) {
        const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonContent = jsonMatch[0];
        }
      }

      const parsed = JSON.parse(jsonContent);

      // Extract project name
      const projectName = parsed.projectName || this.generateFallbackName(originalPrompt);

      // Extract questions
      const questions = parsed.questions as ClarificationQuestion[];

      // Extract isLandingPageRequest
      const isLandingPageRequest = parsed.isLandingPageRequest === true;

      // Extract suggestedTemplate (default to astro-website)
      const suggestedTemplate = parsed.suggestedTemplate === 'react18-ts' ? 'react18-ts' : 'astro-website';

      // Validate questions structure
      if (!Array.isArray(questions)) {
        console.warn('[AnalyzePromptUseCase] Invalid response: questions is not an array');
        return { questions: [], projectName, isLandingPageRequest, suggestedTemplate };
      }

      // Limit to max 3 questions, each with max 3 options
      const validatedQuestions = questions.slice(0, 3).map((q, qIndex) => ({
        id: q.id || `q${qIndex + 1}`,
        question: q.question,
        options: (q.options || []).slice(0, 3).map((opt, optIndex) => ({
          id: opt.id || `opt${optIndex + 1}`,
          label: opt.label,
          description: opt.description
        }))
      }));

      console.log(`[AnalyzePromptUseCase] Generated name: "${projectName}", ${validatedQuestions.length} questions, isLandingPage: ${isLandingPageRequest}, template: ${suggestedTemplate}`);
      return { questions: validatedQuestions, projectName, isLandingPageRequest, suggestedTemplate };
    } catch (parseError) {
      console.error('[AnalyzePromptUseCase] Failed to parse AI response:', parseError);
      console.error('[AnalyzePromptUseCase] Raw response:', rawContent);
      return { questions: [], projectName: this.generateFallbackName(originalPrompt), isLandingPageRequest: false, suggestedTemplate: 'astro-website' };
    }
  }
}
