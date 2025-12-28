import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from 'uuid';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IAILogRepository } from '../../domain/repositories/IAILogRepository';
import { CostCalculator } from '../../shared/utils/CostCalculator';
import {
  AnalyzePromptRequestDto,
  AnalyzePromptResponseDto,
  ClarificationQuestion
} from '../dto/AnalyzePromptDto';
import { User } from '../../domain/entities/User';

const ANALYSIS_SYSTEM_PROMPT = `You are a UX expert helping users clarify their vision for a frontend website or prototype.

IMPORTANT: We are building FRONTEND-ONLY websites and prototypes (React apps), NOT full-stack applications. No backend, no database, no authentication systems - just UI/UX.

YOUR TASKS:
1. Generate a SHORT project name (2-4 words) that describes WHAT they're building
2. Analyze the user's prompt to understand what they're building
3. Identify what's ALREADY specified (don't ask about those things)
4. Generate 1-3 SHORT clarification questions that are SPECIFIC to their app idea

PROJECT NAME RULES:
- 2-4 words maximum, no more than 30 characters
- Describe WHAT the app is (not features)
- Use Title Case
- Examples: "Task Tracker", "Recipe Book", "Weather Dashboard", "Portfolio Site", "Expense Manager"
- Avoid generic names like "My App", "New Project", "Website"

QUESTION SELECTION RULES:
- NEVER ask about things already mentioned in the prompt
- If they said "dark theme" → don't ask about color mood
- If they said "minimalist" → don't ask about style aesthetic
- If the prompt is detailed (50+ words), ask fewer questions (1-2)
- If the prompt is vague (under 20 words), ask more questions (2-3)

QUESTION TYPES TO CONSIDER (pick what's relevant):

For CONTENT-HEAVY sites (blogs, portfolios, landing pages):
- Content layout: "How should content be organized?" → Single page scroll / Multi-page sections / Card grid
- Hero style: "What should visitors see first?" → Big headline / Image/video hero / Animation

For PRODUCTIVITY tools (todo, notes, trackers, dashboards):
- Information density: "How much info on screen?" → Compact & dense / Balanced / Spacious & minimal
- Interaction style: "How should items behave?" → Inline editing / Modal popups / Expandable panels

For VISUAL apps (galleries, recipes, products):
- Image prominence: "How important are images?" → Large & dominant / Medium thumbnails / Text-focused with small images
- Browse style: "How should users explore?" → Grid of cards / Scrolling list / Carousel/slideshow

For E-COMMERCE style (product pages, catalogs):
- Product display: "How should items be shown?" → Detailed cards / Quick-view grid / List with filters

UNIVERSAL questions (use sparingly, only if not clear from prompt):
- Color mood (only if not specified)
- Light/dark mode preference (only if not specified)
- Mobile-first or desktop-first (if responsive approach matters)

FORMAT RULES:
- Questions under 12 words
- Option labels: 2-4 words
- Option descriptions: under 8 words
- 2-3 options per question

ADDITIONAL TASK:
Determine if this request is for a website or landing page.
Set isLandingPageRequest to true if:
- The prompt contains the word "website", "site", "landing page", "homepage", or "page"
- The user wants a landing page, marketing page, portfolio, or business website
- ANY request that mentions "website" regardless of the type (e.g., "calculator website" = true)

Set isLandingPageRequest to false ONLY for:
- Pure interactive apps/tools that do NOT mention "website" or "site" (e.g., "build me a todo app")
- Games or interactive experiences without "website" in the prompt

RESPONSE FORMAT (JSON only):
{
  "projectName": "Short Descriptive Name",
  "isLandingPageRequest": true,
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

    // Call AI to generate clarification questions and project name
    try {
      const result = await this.generateAnalysis(dto.prompt, user.id, dto.projectId, analysisId, startTime);

      if (!result.questions || result.questions.length === 0) {
        // AI didn't generate valid questions, skip clarification but return name
        return {
          needsClarification: false,
          analysisId,
          suggestedProjectName: result.projectName,
          showInspirationGallery: result.isLandingPageRequest
        };
      }

      return {
        needsClarification: true,
        questions: result.questions,
        analysisId,
        suggestedProjectName: result.projectName,
        showInspirationGallery: result.isLandingPageRequest
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

  private async generateAnalysis(
    userPrompt: string,
    userId: string,
    projectId: string | undefined,
    analysisId: string,
    startTime: number
  ): Promise<{ questions: ClarificationQuestion[]; projectName: string; isLandingPageRequest: boolean }> {
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
- Set isLandingPageRequest to true for websites, landing pages, portfolios, marketing pages`
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
      const projectName = parsed.projectName || this.generateFallbackName(userPrompt);

      // Extract questions
      const questions = parsed.questions as ClarificationQuestion[];

      // Extract isLandingPageRequest
      const isLandingPageRequest = parsed.isLandingPageRequest === true;

      // Validate questions structure
      if (!Array.isArray(questions)) {
        console.warn('[AnalyzePromptUseCase] Invalid response: questions is not an array');
        return { questions: [], projectName, isLandingPageRequest };
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

      console.log(`[AnalyzePromptUseCase] Generated name: "${projectName}", ${validatedQuestions.length} questions, isLandingPage: ${isLandingPageRequest}`);
      return { questions: validatedQuestions, projectName, isLandingPageRequest };
    } catch (parseError) {
      console.error('[AnalyzePromptUseCase] Failed to parse AI response:', parseError);
      console.error('[AnalyzePromptUseCase] Raw response:', rawContent);
      return { questions: [], projectName: this.generateFallbackName(userPrompt), isLandingPageRequest: false };
    }
  }
}
