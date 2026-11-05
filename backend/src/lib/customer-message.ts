import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { Parser } from "htmlparser2";
import { createEmailShell, type EmailNotification } from "./email";
import { normalizeCustomerEmail } from "./customer-directory";

export interface CustomerMessage {
  subject: string;
  message: string;
  format: "text" | "html";
}

export function escapeEmailText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function parseCustomerMessage(value: unknown): CustomerMessage {
  if (!value || typeof value !== "object")
    throw new Error("Enter a subject and message.");
  const body = value as Record<string, unknown>;
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (
    !subject ||
    subject.length > 200 ||
    /[\u0000-\u001f\u007f\u2028\u2029]/.test(subject)
  )
    throw new Error("Enter a subject of 1–200 characters on one line.");
  if (!message || message.length > 50000)
    throw new Error("Enter a message of 1–50,000 characters.");
  if (body.format !== "text" && body.format !== "html")
    throw new Error("Choose message or HTML format.");
  const parsed = { subject, message, format: body.format } as CustomerMessage;
  if (!customerMessageText(messageBody(parsed)).trim())
    throw new Error("Your message needs visible text.");
  return parsed;
}

function customerMessageText(html: string): string {
  const parts: string[] = [];
  const parser = new Parser(
    {
      ontext: (text) => {
        parts.push(text);
      },
      onopentag: (tag) => {
        if (tag === "br") parts.push("\n");
      },
      onclosetag: (tag) => {
        if (/^(p|div|h[1-4]|li|tr|blockquote)$/.test(tag)) parts.push("\n\n");
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);
  return parts.join("").trim();
}

function messageBody(data: CustomerMessage): string {
  if (data.format === "text") {
    return data.message
      .split(/\n\s*\n/)
      .map(
        (p) =>
          `<p style="margin:0 0 20px;">${escapeEmailText(p).replace(/\n/g, "<br>")}</p>`,
      )
      .join("");
  }
  return sanitizeHtml(data.message, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "h1",
      "h2",
      "h3",
      "h4",
      "ul",
      "ol",
      "li",
      "a",
      "img",
      "div",
      "span",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "td",
      "th",
      "hr",
      "blockquote",
    ],
    allowedAttributes: {
      "*": ["style"],
      a: ["href", "title"],
      img: ["src", "alt", "width", "height"],
      td: ["colspan", "rowspan", "align"],
      th: ["colspan", "rowspan", "align"],
      table: ["width", "cellpadding", "cellspacing", "role"],
    },
    allowedSchemes: ["https", "mailto"],
    allowedSchemesByTag: { img: ["https"] },
    allowProtocolRelative: false,
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-f]{3,8}$/i, /^[a-z]+$/i, /^rgba?\([\d.,%\s]+\)$/],
        "background-color": [/^#[0-9a-f]{3,8}$/i, /^[a-z]+$/i],
        "font-size": [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/],
        "font-family": [/^[\w\s,'"-]+$/],
        "font-weight": [/^(?:normal|bold|[1-9]00)$/],
        "font-style": [/^(?:normal|italic)$/],
        "text-align": [/^(?:left|center|right)$/],
        "text-decoration": [/^(?:none|underline|line-through)$/],
        "line-height": [/^[\d.]+(?:px|em|%)?$/],
        "letter-spacing": [/^[\d.]+(?:px|em)$/],
        padding: [/^[\d.\s]+(?:px|em|%)?(?:\s+[\d.]+(?:px|em|%)){0,3}$/],
        margin: [/^[\d.\s]+(?:px|em|%)?(?:\s+[\d.]+(?:px|em|%)){0,3}$/],
        width: [/^[\d.]+(?:px|%)$/],
        "max-width": [/^[\d.]+(?:px|%)$/],
        "border-radius": [/^[\d.]+px$/],
        "border-collapse": [/^(?:collapse|separate)$/],
        display: [/^(?:block|inline|inline-block)$/],
      },
    },
  });
}

export function customerEmailId(email: string): string {
  return createHash("sha256").update(email).digest("hex");
}

function unsubscribeSecret(): string {
  const secret =
    process.env.EMAIL_UNSUBSCRIBE_SECRET ||
    process.env.SESSION_SIGNING_KEY ||
    "";
  if (secret.length < 32)
    throw new Error(
      "Email preferences need EMAIL_UNSUBSCRIBE_SECRET or SESSION_SIGNING_KEY with at least 32 characters.",
    );
  return secret;
}

export function createUnsubscribeToken(email: string): string {
  const payload = Buffer.from(email).toString("base64url");
  const signature = createHmac("sha256", unsubscribeSecret())
    .update(`customer-unsubscribe:${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  if (token.length > 600 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))
    return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = createHmac("sha256", unsubscribeSecret())
    .update(`customer-unsubscribe:${payload}`)
    .digest();
  const actual = Buffer.from(signature, "base64url");
  if (
    actual.toString("base64url") !== signature ||
    Buffer.from(payload, "base64url").toString("base64url") !== payload
  )
    return null;
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  return (
    normalizeCustomerEmail(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) || null
  );
}

export function customerEmailSetupError(): string | null {
  try {
    unsubscribeSecret();
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

export function generateCustomerMessage(
  data: CustomerMessage,
  to: string,
  preview = false,
): EmailNotification {
  const baseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.valoreparfums.app"
  ).replace(/\/+$/, "");
  const unsubscribeUrl = preview
    ? "#unsubscribe-preview"
    : `${baseUrl}/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(to))}`;
  const body = messageBody(data);
  return {
    to,
    subject: data.subject,
    html: createEmailShell(`
      <h2 style="font-family:Georgia,serif; font-size:28px; font-weight:400; line-height:1.3; color:#111; margin:0 0 24px;">${escapeEmailText(data.subject)}</h2>
      <div style="font-family:Arial,sans-serif; font-size:14px; line-height:1.8; color:#444; overflow-wrap:anywhere;">${body}</div>
      <p style="font-family:Arial,sans-serif; font-size:12px; line-height:1.7; color:#666; margin:32px 0 0;">You received this email because you ordered from Valore Parfums.<br><a href="${escapeEmailText(unsubscribeUrl)}" style="color:#666; text-decoration:underline;">Unsubscribe from promotional emails</a></p>`),
    text: `${data.subject}\n\n${customerMessageText(body)}\n\nUnsubscribe from promotional emails: ${unsubscribeUrl}`,
  };
}
