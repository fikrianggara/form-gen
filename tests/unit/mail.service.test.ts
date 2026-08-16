import { describe, it, expect, vi } from "vitest";
import {
  buildInvitationMail,
  escapeHtml,
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

  it("HTML-escapes the questionnaire title and link in the body (TKT-021)", () => {
    const msg = buildInvitationMail({
      to: "a@example.com",
      link: "https://forms.example.com/f/s?invite=abc&x=1\"y",
      questionnaireTitle: `Customer <script>alert("x")</script> & Co's Survey`,
    });
    // Title markup renders as literal text — no <script> tag survives.
    expect(msg.html).not.toContain("<script>");
    expect(msg.html).toContain("&lt;script&gt;");
    expect(msg.html).toContain("&amp;");
    expect(msg.html).toContain("&quot;");
    // The link's ampersand/quote are escaped for the href attribute.
    expect(msg.html).toContain("invite=abc&amp;x=1&quot;y");
    // The subject stays human-readable (plain text, not HTML).
    expect(msg.subject).toContain("<script>");
  });

  it("escapeHtml escapes all five HTML metacharacters", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
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
