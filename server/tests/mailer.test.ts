import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: 465, SMTP_USER: "synflow.ia@gmail.com", SMTP_PASS: "app-password" }));
const sendMail = vi.fn(async () => ({ messageId: "m-1" }));
const createTransport = vi.fn(() => ({ sendMail }));
const insforgeSend = vi.fn(async () => ({ data: {}, error: null as { message: string } | null }));

vi.mock("../src/config/env.js", () => ({ env: settings }));
vi.mock("nodemailer", () => ({ default: { createTransport } }));
vi.mock("../src/lib/insforge.js", () => ({ insforgeAdmin: { emails: { send: insforgeSend } } }));

const { sendEmail } = await import("../src/lib/mailer.js");

beforeEach(() => {
  sendMail.mockClear();
  insforgeSend.mockClear();
});

describe("sendEmail", () => {
  it("sends through Gmail SMTP under the business name, from the platform address", async () => {
    await sendEmail({ to: "cliente@test.com", subject: "Hola", html: "<p>x</p>", fromName: 'Antojitos "Fast" Food', replyTo: "hola@antojitos.co" });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.gmail.com", port: 465, secure: true }));
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: "Antojitos Fast Food", address: "synflow.ia@gmail.com" },
        to: "cliente@test.com",
        replyTo: "hola@antojitos.co"
      })
    );
    expect(insforgeSend).not.toHaveBeenCalled();
  });

  it("falls back to InsForge when SMTP is not configured, and throws its error", async () => {
    settings.SMTP_PASS = "";
    insforgeSend.mockResolvedValueOnce({ data: {}, error: { message: "Custom email service is not available for free plan." } });
    await expect(sendEmail({ to: "cliente@test.com", subject: "Hola", html: "<p>x</p>" })).rejects.toThrow(/free plan/);
    expect(sendMail).not.toHaveBeenCalled();
    settings.SMTP_PASS = "app-password";
  });
});
