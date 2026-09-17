import { Injectable, Logger } from "@nestjs/common";
import nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async send(input: { to: string; subject: string; text: string; html?: string }) {
    const server = process.env.EMAIL_SERVER;
    const from = process.env.EMAIL_FROM;
    if (!server || !from) {
      if (process.env.NODE_ENV === "production") this.logger.warn("Email delivery is not configured; notification was not sent.");
      return { sent: false, configured: false };
    }
    try {
      const transport = nodemailer.createTransport(server);
      await transport.sendMail({ from, to: input.to, subject: input.subject, text: input.text, html: input.html });
      return { sent: true, configured: true };
    } catch (error) {
      this.logger.error(`Email delivery failed: ${error instanceof Error ? error.message : "unknown error"}`);
      return { sent: false, configured: true };
    }
  }
}
