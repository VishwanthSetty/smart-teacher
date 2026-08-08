import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { MailService, PasswordReset, SchoolAdminWelcome, UserCredentials, UserInvite } from './mail.service';

interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * SMTP adapter (F-04). Wraps nodemailer so the vendor never leaks past this file —
 * callers only ever see the MailService port.
 */
@Injectable()
export class SmtpMailService extends MailService {
  private readonly logger = new Logger(SmtpMailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    super();
    const port = this.configService.getOrThrow<number>('SMTP_PORT');
    this.transporter = createTransport({
      host: this.configService.getOrThrow<string>('SMTP_HOST'),
      port,
      // Port 465 is implicit TLS; everything else (587, 25) negotiates STARTTLS.
      secure: port === 465,
      auth: {
        user: this.configService.getOrThrow<string>('SMTP_USER'),
        pass: this.configService.getOrThrow<string>('SMTP_PASS'),
      },
    });
    const fromName = this.configService.getOrThrow<string>('MAIL_FROM_NAME');
    const fromAddress = this.configService.getOrThrow<string>('MAIL_FROM_ADDRESS');
    this.from = `"${fromName}" <${fromAddress}>`;
  }

  async sendUserInvite(invite: UserInvite): Promise<void> {
    const webAppUrl = this.configService.getOrThrow<string>('WEB_APP_URL');
    const link = `${webAppUrl}/set-password?token=${invite.inviteToken}`;

    await this.send({
      to: invite.email,
      subject: `You're invited to ${invite.schoolName} on Smart Teacher`,
      html: `
        <p>Hi ${invite.name},</p>
        <p>You've been invited to join <strong>${invite.schoolName}</strong> on Smart Teacher as a ${invite.role}.</p>
        <p><a href="${link}">Set your password</a> to activate your account.</p>
        <p>This link expires in 7 days.</p>
      `,
      text: `Hi ${invite.name},\n\nYou've been invited to join ${invite.schoolName} on Smart Teacher as a ${invite.role}.\n\nSet your password: ${link}\n\nThis link expires in 7 days.`,
    });
  }

  async sendPasswordReset(reset: PasswordReset): Promise<void> {
    const webAppUrl = this.configService.getOrThrow<string>('WEB_APP_URL');
    const link = `${webAppUrl}/reset-password?token=${reset.resetToken}`;

    await this.send({
      to: reset.email,
      subject: 'Reset your Smart Teacher password',
      html: `
        <p>Hi ${reset.name},</p>
        <p><a href="${link}">Reset your password</a>.</p>
        <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
      `,
      text: `Hi ${reset.name},\n\nReset your password: ${link}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
    });
  }

  async sendSchoolAdminWelcome(welcome: SchoolAdminWelcome): Promise<void> {
    const webAppUrl = this.configService.getOrThrow<string>('WEB_APP_URL');
    const link = `${webAppUrl}/login?school=${welcome.schoolSlug}`;

    await this.send({
      to: welcome.email,
      subject: `Your Smart Teacher account for ${welcome.schoolName} is ready`,
      html: `
        <p>Hi ${welcome.name},</p>
        <p>Your Smart Teacher account for <strong>${welcome.schoolName}</strong> is ready.</p>
        <p><a href="${link}">Sign in</a> with the password your administrator gave you.</p>
      `,
      text: `Hi ${welcome.name},\n\nYour Smart Teacher account for ${welcome.schoolName} is ready.\n\nSign in: ${link}\n\nUse the password your administrator gave you.`,
    });
  }

  async sendCredentials(credentials: UserCredentials): Promise<void> {
    const webAppUrl = this.configService.getOrThrow<string>('WEB_APP_URL');
    const link = `${webAppUrl}/login?school=${credentials.schoolSlug}`;

    await this.send({
      to: credentials.email,
      subject: `Your Smart Teacher credentials for ${credentials.schoolName}`,
      html: `
        <p>Hi ${credentials.name},</p>
        <p>Your Smart Teacher account for <strong>${credentials.schoolName}</strong> is ready.</p>
        <p>Email: <strong>${credentials.email}</strong><br>Password: <strong>${credentials.password}</strong></p>
        <p><a href="${link}">Sign in</a> and change your password after your first login.</p>
      `,
      text: `Hi ${credentials.name},\n\nYour Smart Teacher account for ${credentials.schoolName} is ready.\n\nEmail: ${credentials.email}\nPassword: ${credentials.password}\n\nSign in: ${link}\n\nPlease change your password after your first login.`,
    });
  }

  private async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
    this.logger.log(`Sent "${message.subject}" to ${message.to}`);
  }
}
