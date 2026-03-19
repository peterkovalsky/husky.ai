export interface IEmailService {
  sendWelcomeEmail(to: string, displayName?: string): Promise<void>;
}
