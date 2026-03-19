import { Resend } from 'resend';
import { IEmailService } from '../../domain/services/IEmailService';

export class ResendEmailService implements IEmailService {
  private resend: Resend;
  private readonly fromAddress = 'Husky AI <hello@mail.huskystudio.ai>';

  constructor(apiKey: string) {
    this.resend = new Resend(apiKey);
  }

  async sendWelcomeEmail(to: string, displayName?: string): Promise<void> {
    const firstName = displayName?.split(' ')[0] || 'there';

    const { data, error } = await this.resend.emails.send({
      from: this.fromAddress,
      to,
      subject: 'Welcome to Husky AI 👋',
      html: this.buildWelcomeEmailHtml(firstName),
    });

    if (error) {
      throw new Error(`Resend API error: ${error.name} - ${error.message}`);
    }

    console.log(`[ResendEmailService] Welcome email sent to ${to}, id: ${data?.id}`);
  }

  private buildWelcomeEmailHtml(firstName: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Husky AI</title>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width: 560px; text-align: left;">

          <tr>
            <td style="font-size: 16px; color: #1a1a1a; line-height: 1.7;">
              <p style="margin: 0 0 24px;">Hey ${firstName},</p>

              <p style="margin: 0 0 24px;">Welcome to Husky AI 👋</p>

              <p style="margin: 0 0 24px;">We built this because <strong>the hardest part of building a website was never the idea... it was getting from idea to something real.</strong></p>

              <p style="margin: 0 0 24px;">Setting up the project. Picking the right libraries. Writing boilerplate. Styling everything. Deploying. The list goes on. And drag-and-drop website builders? They just trade one kind of complexity for another.</p>

              <p style="margin: 0 0 24px;">With Husky AI, you skip all of that. Just describe what you want and we'll generate a full website you can iterate on and publish. In minutes, not weeks.</p>

              <p style="margin: 0 0 24px;">We really hope you'll love it.</p>

              <p style="margin: 0 0 0; color: #6b7280;">— The Husky AI Team</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top: 40px; border-top: 1px solid #e5e7eb; margin-top: 40px;">
              <p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 1.5;">
                You're receiving this because you signed up for <a href="https://app.huskystudio.ai" style="color: #9ca3af;">Husky AI</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
  }
}
