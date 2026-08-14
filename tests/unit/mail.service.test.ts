import { describe, it, expect, vi } from "vitest";
import {
  buildInvitationMail,
  sendMail,
  type MailMessage,
  type MailTransport,
} from "@/services/mail.service";

describe("mail service", () => {
  it("builds an invitation email with the unique link", () => {
    const msg = buildInvitationMail({
      to: "a@example.com",
      link: "https://forms.example.com/f/survey?invite=abc123",
      questionnaireTitle: "Customer Survey",
    });
    expect(msg.to).toBe("a@example.com");
    expect(msg.subject).toContain("Customer Survey");
    expect(msg.html).toContain("abc123");
    expect(msg.html).toContain("f/survey?invite=abc123");
  });

  it("sends through the injected transport", async () => {
    const transport = vi.fn(async (_msg: MailMessage) => {});
    const result = await sendMail(
      { to: "a@example.com", subject: "S", html: "<p>hi</p>" },
      transport
    );
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0][0].to).toBe("a@example.com");
    expect(result.delivered).toBe(true);
  });

  it("does not throw when the transport fails — reports delivered:false", async () => {
    const transport: MailTransport = async () => {
      throw new Error("smtp down");
    };
    const result = await sendMail(
      { to: "a@example.com", subject: "S", html: "<p>hi</p>" },
      transport
    );
    expect(result.delivered).toBe(false);
  });
});
