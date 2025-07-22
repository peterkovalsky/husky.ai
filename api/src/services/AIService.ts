export interface AIResponse {
  content: string;
  model: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}


export abstract class AIService {
  abstract generateResponse(prompt: string, promptId?: string): Promise<AIResponse>;
  abstract generateStreamingResponse?(
    prompt: string, 
    promptId?: string
  ): Promise<AIResponse>;
}