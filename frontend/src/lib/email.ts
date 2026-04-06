import nodemailer from "nodemailer";

export interface EmailNotification {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailProvider {
  send(email: EmailNotification): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

class GmailSmtpEmailProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;
  private fromEmail: string;

  constructor(user: string, pass: string, fromEmail: string) {
    this.fromEmail = fromEmail;
    this.transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user,
        pass,
      },
    });
  }

  async send(email: EmailNotification): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const info = await this.transporter.sendMail({
        from: this.fromEmail,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }
}

let emailProvider: EmailProvider | null = null;

export function initializeEmailProvider(provider: EmailProvider): void {
  emailProvider = provider;
}

export async function sendEmail(email: EmailNotification): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!emailProvider) {
    console.warn("Email provider not initialized. Email not sent:", email.subject);
    return { success: false, error: "Email provider not initialized" };
  }

  return emailProvider.send(email);
}

function makeHtmlDarkModeSafe(html: string): string {
  const withLockedTextColor = html.replace(
    /(^|[;\s])color\s*:\s*([^;\"]+);/gi,
    (_match, prefix: string, colorValue: string) => {
      const normalizedColor = colorValue.trim();
      return `${prefix}color:${normalizedColor} !important; -webkit-text-fill-color:${normalizedColor} !important;`;
    },
  );

  return withLockedTextColor.replace(
    /(^|[;\s])background\s*:\s*(?!linear-gradient)([^;\"]+);/gi,
    (_match, prefix: string, backgroundValue: string) => {
      const normalizedBackground = backgroundValue.trim();
      return `${prefix}background:${normalizedBackground} !important; background-color:${normalizedBackground} !important; background-image:linear-gradient(${normalizedBackground}, ${normalizedBackground}) !important;`;
    },
  );
}

function createEmailShell(content: string): string {
  const rawHtml = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <title>Valore Parfums</title>
      </head>
      <body style="margin:0; padding:24px 12px; background:#ede8df;">
        <div style="max-width:680px; margin:0 auto; border:1px solid #e2dccf;">
          <div style="background:#0e0e0e; padding: 36px 48px 24px; text-align:center;">
            <p style="font-family:'Cormorant Garamond',serif; font-size:22px; letter-spacing:8px; color:#c9a96e; text-transform:uppercase; font-weight:300;">VALORE PARFUMS</p>
            <div style="height:1px; background: linear-gradient(to right, transparent, #c9a96e, transparent); margin: 14px 0 0;"></div>
          </div>
          <div style="background:#fafaf8; padding: 48px 48px 52px;">${content}</div>
          <div style="background:#0e0e0e; padding:20px 48px; text-align:center;">
            <p style="font-family:'Montserrat',sans-serif; font-size:10px; color:#a8a8a8; margin-bottom:8px;">Website: <a href="https://www.valoreparfums.app" target="_blank" rel="noopener noreferrer" style="color:#c9a96e; text-decoration:underline;">www.valoreparfums.app</a></p>
            <p style="font-family:'Montserrat',sans-serif; font-size:9px; color:#787878; letter-spacing:2px; text-transform:uppercase;">The Art of Fragrance</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return makeHtmlDarkModeSafe(rawHtml);
}

function renderOrderedItemsBlock(
  items?: Array<{ perfumeName: string; quantity: number; ml: number; unitPrice: number }>,
  totalOverride?: number,
): string {
  const rows = items && items.length > 0
    ? items
      .map((item) => `
        <tr style="border-bottom:1px solid #f0ece4;">
          <td style="font-family:'Montserrat',sans-serif; font-size:12px; color:#333; padding:14px 0 14px;">
            ${item.perfumeName}<br>
            <span style="font-size:10px; color:#999;">${item.ml}ml Decant</span>
          </td>
          <td style="font-family:'Montserrat',sans-serif; font-size:12px; color:#333; text-align:center; padding:14px 0;">${item.quantity}</td>
          <td style="font-family:'Cormorant Garamond',serif; font-size:15px; color:#111; text-align:right; padding:14px 0;">৳ ${item.unitPrice * item.quantity}</td>
        </tr>
      `)
      .join("")
    : `
      <tr style="border-bottom:1px solid #f0ece4;">
        <td style="font-family:'Montserrat',sans-serif; font-size:12px; color:#333; padding:14px 0 14px;">{{ORDER_ITEMS}}</td>
        <td style="font-family:'Montserrat',sans-serif; font-size:12px; color:#333; text-align:center; padding:14px 0;">-</td>
        <td style="font-family:'Cormorant Garamond',serif; font-size:15px; color:#111; text-align:right; padding:14px 0;">-</td>
      </tr>
    `;

  const total = typeof totalOverride === "number"
    ? totalOverride
    : items && items.length > 0
      ? items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    : "{{ORDER_TOTAL}}";

  return `
    <table style="width:100%; border-collapse:collapse; margin-bottom:28px;">
      <thead>
        <tr style="border-bottom:1px solid #e8e4dc;">
          <th style="font-family:'Montserrat',sans-serif; font-size:9px; letter-spacing:3px; color:#999; text-transform:uppercase; text-align:left; padding:0 0 10px;">Item</th>
          <th style="font-family:'Montserrat',sans-serif; font-size:9px; letter-spacing:3px; color:#999; text-transform:uppercase; text-align:center; padding:0 0 10px;">Qty</th>
          <th style="font-family:'Montserrat',sans-serif; font-size:9px; letter-spacing:3px; color:#999; text-transform:uppercase; text-align:right; padding:0 0 10px;">Price</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="font-family:'Montserrat',sans-serif; font-size:10px; letter-spacing:2px; color:#999; text-transform:uppercase; padding:14px 0 0;">Total</td>
          <td style="font-family:'Cormorant Garamond',serif; font-size:20px; color:#c9a96e; text-align:right; padding:14px 0 0; font-weight:500;">৳ ${total}</td>
        </tr>
      </tfoot>
    </table>
  `;
}

function renderCancelledItemsBlock(
  items?: Array<{ perfumeName: string; quantity: number; ml: number; totalPrice: number }>,
  refundAmount?: number,
  refundApplicable: boolean = true,
): string {
  const rows = items && items.length > 0
    ? items
      .map((item) => `
        <tr style="border-bottom:1px solid #f0ece4;">
          <td style="font-family:'Montserrat',sans-serif; font-size:12px; color:#6f6b66; padding:14px 0; text-decoration:line-through;">
            ${item.perfumeName}<br>
            <span style="font-size:10px; color:#8f887f;">${item.ml}ml Decant</span>
          </td>
          <td style="font-family:'Montserrat',sans-serif; font-size:12px; color:#6f6b66; text-align:center; padding:14px 0; text-decoration:line-through;">${item.quantity}</td>
          <td style="font-family:'Cormorant Garamond',serif; font-size:15px; color:#6f6b66; text-align:right; padding:14px 0; text-decoration:line-through;">৳ ${item.totalPrice}</td>
        </tr>
      `)
      .join("")
    : `
      <tr style="border-bottom:1px solid #f0ece4;">
        <td style="font-family:'Montserrat',sans-serif; font-size:12px; color:#6f6b66; padding:14px 0; text-decoration:line-through;">{{ORDER_ITEMS}}</td>
        <td style="font-family:'Montserrat',sans-serif; font-size:12px; color:#6f6b66; text-align:center; padding:14px 0; text-decoration:line-through;">-</td>
        <td style="font-family:'Cormorant Garamond',serif; font-size:15px; color:#6f6b66; text-align:right; padding:14px 0; text-decoration:line-through;">-</td>
      </tr>
    `;

  const amount = typeof refundAmount === "number" ? refundAmount : 0;
  const refundValueText = refundApplicable ? `৳ ${amount}` : "Not Applicable";

  return `
    <table style="width:100%; border-collapse:collapse; margin-bottom:28px;">
      <thead>
        <tr style="border-bottom:1px solid #e8e4dc;">
          <th style="font-family:'Montserrat',sans-serif; font-size:9px; letter-spacing:3px; color:#999; text-transform:uppercase; text-align:left; padding:0 0 10px;">Item</th>
          <th style="font-family:'Montserrat',sans-serif; font-size:9px; letter-spacing:3px; color:#999; text-transform:uppercase; text-align:center; padding:0 0 10px;">Qty</th>
          <th style="font-family:'Montserrat',sans-serif; font-size:9px; letter-spacing:3px; color:#999; text-transform:uppercase; text-align:right; padding:0 0 10px;">Price</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="font-family:'Montserrat',sans-serif; font-size:10px; letter-spacing:2px; color:#999; text-transform:uppercase; padding:14px 0 0;">Refund Amount</td>
          <td style="font-family:'Cormorant Garamond',serif; font-size:20px; color:#9e6e6e; text-align:right; padding:14px 0 0; font-weight:500;">${refundValueText}</td>
        </tr>
      </tfoot>
    </table>
  `;
}

export function generateOrderConfirmationEmail(orderData: {
  orderId: string;
  customerName: string;
  customerEmail: string;
  items: Array<{ perfumeName: string; quantity: number; ml: number; unitPrice: number }>;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
}): EmailNotification {
  const orderedItemsBlock = renderOrderedItemsBlock(orderData.items, orderData.total);

  const html = createEmailShell(`
      <p style="font-family:'Cormorant Garamond',serif; font-size:11px; letter-spacing:4px; color:#c9a96e; text-transform:uppercase; margin-bottom:28px;">Order Confirmation</p>
      <h2 style="font-family:'Cormorant Garamond',serif; font-size:32px; font-weight:400; color:#111; margin-bottom:24px; line-height:1.3;">Your Order<br><em>Has Been Received</em></h2>
      <p style="font-family:'Montserrat',sans-serif; font-size:13px; color:#444; line-height:1.9; margin-bottom:20px;">Dear <strong>${orderData.customerName}</strong>,</p>
      <p style="font-family:'Montserrat',sans-serif; font-size:13px; color:#555; line-height:1.9; margin-bottom:28px;">We are honoured to receive your order. Every fragrance at Valore Parfums is treated as an art form and yours is now in the hands of our atelier team, who will ensure it reaches you in perfect condition.</p>
      <div style="border-left: 2px solid #c9a96e; padding: 16px 20px; background:#fff; margin-bottom:28px; color:#8B7500;">
        <p style="font-family:'Montserrat',sans-serif; font-size:10px; letter-spacing:3px; color:#8B7500; text-transform:uppercase; margin-bottom:10px;">Order Reference</p>
        <p style="font-family:'Cormorant Garamond',serif; font-size:22px; color:#8B7500; font-weight:500;">#${orderData.orderId}</p>
      </div>
      ${orderedItemsBlock}
      <p style="font-family:'Montserrat',sans-serif; font-size:12px; color:#888; line-height:1.9;">You will receive a notification at each stage of your order's journey. Should you have any questions, our client services team is at your disposal.</p>
      <div style="height:1px; background:#e8e4dc; margin: 36px 0 28px;"></div>
      <p style="font-family:'Cormorant Garamond',serif; font-size:16px; color:#111; font-style:italic;">With gratitude,</p>
      <p style="font-family:'Montserrat',sans-serif; font-size:10px; letter-spacing:3px; color:#c9a96e; text-transform:uppercase; margin-top:6px;">Valore Parfums</p>
  `);

  return {
    to: orderData.customerEmail,
    subject: `Order Received - #${orderData.orderId}`,
    html,
    text: `Dear ${orderData.customerName},\nYour order #${orderData.orderId} has been received.`,
  };
}

export function generateOrderConfirmedEmail(orderData: {
  orderId: string;
  customerName: string;
  customerEmail: string;
  items: Array<{ perfumeName: string; quantity: number; ml: number; unitPrice: number }>;
  total: number;
}): EmailNotification {
  const orderedItemsBlock = renderOrderedItemsBlock(orderData.items, orderData.total);

  const html = createEmailShell(`
      <p style="font-family:'Cormorant Garamond',serif; font-size:11px; letter-spacing:4px; color:#c9a96e; text-transform:uppercase; margin-bottom:28px;">Order Confirmed</p>
      <h2 style="font-family:'Cormorant Garamond',serif; font-size:32px; font-weight:400; color:#111; margin-bottom:24px; line-height:1.3;">Your Order<br><em>Is Confirmed</em></h2>
      <p style="font-family:'Montserrat',sans-serif; font-size:13px; color:#444; line-height:1.9; margin-bottom:20px;">Dear <strong>${orderData.customerName}</strong>,</p>
      <p style="font-family:'Montserrat',sans-serif; font-size:13px; color:#555; line-height:1.9; margin-bottom:28px;">Wonderful news, Order <strong>#${orderData.orderId}</strong> has been confirmed and is now entering our preparation stage. Below is a summary of what you have selected.</p>
      ${orderedItemsBlock}
      <div style="background:#f5efe6; border:1px solid #e6d6c1; padding: 24px 28px; margin-bottom:32px;">
        <p style="font-family:'Montserrat',sans-serif; font-size:9px; letter-spacing:3px; color:#8b6a3e; text-transform:uppercase; margin-bottom:8px;">Status</p>
        <p style="font-family:'Cormorant Garamond',serif; font-size:20px; color:#2a1c14; margin:0;">Your order is being prepared for dispatch</p>
      </div>
      <p style="font-family:'Montserrat',sans-serif; font-size:12px; color:#888; line-height:1.9;">We are deeply grateful for your confidence in Valore Parfums. Craftsmanship and discretion are at the heart of everything we do and that begins the moment your order is placed.</p>
      <div style="height:1px; background:#e8e4dc; margin: 36px 0 28px;"></div>
      <p style="font-family:'Cormorant Garamond',serif; font-size:16px; color:#111; font-style:italic;">With warm regards,</p>
      <p style="font-family:'Montserrat',sans-serif; font-size:10px; letter-spacing:3px; color:#c9a96e; text-transform:uppercase; margin-top:6px;">Valore Parfums</p>
  `);

  return {
    to: orderData.customerEmail,
    subject: `Order Confirmed - #${orderData.orderId}`,
    html,
    text: `Dear ${orderData.customerName},\nYour order #${orderData.orderId} is confirmed.`,
  };
}

export function generateOrderDispatchedEmail(orderData: {
  orderId: string;
  customerName: string;
  customerEmail: string;
  items?: Array<{ perfumeName: string; quantity: number; ml: number; unitPrice: number }>;
  trackingNumber?: string;
  estimatedDelivery?: string;
}): EmailNotification {
  const orderedItemsBlock = renderOrderedItemsBlock(orderData.items);
  const trackingBlock = orderData.trackingNumber
    ? `
      <div style="background:#fff; border:1px solid #e8e4dc; padding: 18px 24px; margin-bottom:28px;">
        <p style="font-family:'Montserrat',sans-serif; font-size:9px; letter-spacing:3px; color:#999; text-transform:uppercase; margin-bottom:10px;">Tracking Number</p>
        <p style="font-family:'Cormorant Garamond',serif; font-size:20px; color:#111;">${orderData.trackingNumber}</p>
      </div>
    `
    : "";

  const html = createEmailShell(`
      <p style="font-family:'Cormorant Garamond',serif; font-size:11px; letter-spacing:4px; color:#c9a96e; text-transform:uppercase; margin-bottom:28px;">Dispatch Notice</p>
      <h2 style="font-family:'Cormorant Garamond',serif; font-size:32px; font-weight:400; color:#111; margin-bottom:24px; line-height:1.3;">Your Fragrance<br><em>Is on Its Way</em></h2>
      <p style="font-family:'Montserrat',sans-serif; font-size:13px; color:#444; line-height:1.9; margin-bottom:20px;">Dear <strong>${orderData.customerName}</strong>,</p>
      <p style="font-family:'Montserrat',sans-serif; font-size:13px; color:#555; line-height:1.9; margin-bottom:28px;">Your order <strong>#${orderData.orderId}</strong> has been carefully packaged and dispatched. It is now on its journey to you, and we hope the anticipation is part of the pleasure.</p>
      <div style="border: 1px solid #c9a96e; padding: 20px 24px; margin-bottom:28px;">
        <p style="font-family:'Montserrat',sans-serif; font-size:9px; letter-spacing:3px; color:#c9a96e; text-transform:uppercase; margin-bottom:10px;">Estimated Delivery</p>
        <p style="font-family:'Cormorant Garamond',serif; font-size:24px; color:#111;">${orderData.estimatedDelivery || "2 - 4 Business Days"}</p>
      </div>
      ${orderedItemsBlock}
      ${trackingBlock}
      <p style="font-family:'Montserrat',sans-serif; font-size:12px; color:#888; line-height:1.9;">Your parcel has been handled with the discretion and elegance it deserves. We invite you to prepare for an arrival worth waiting for.</p>
      <div style="height:1px; background:#e8e4dc; margin: 36px 0 28px;"></div>
      <p style="font-family:'Cormorant Garamond',serif; font-size:16px; color:#111; font-style:italic;">Until your doorstep,</p>
      <p style="font-family:'Montserrat',sans-serif; font-size:10px; letter-spacing:3px; color:#c9a96e; text-transform:uppercase; margin-top:6px;">Valore Parfums</p>
  `);

  return {
    to: orderData.customerEmail,
    subject: `Order Dispatched - #${orderData.orderId}`,
    html,
    text: `Dear ${orderData.customerName},\nYour order #${orderData.orderId} has been dispatched.`,
  };
}

export function generateOrderDeliveredEmail(orderData: {
  orderId: string;
  customerName: string;
  customerEmail: string;
  items?: Array<{ perfumeName: string; quantity: number; ml: number; unitPrice: number }>;
}): EmailNotification {
  const orderedItemsBlock = renderOrderedItemsBlock(orderData.items);
  const html = createEmailShell(`
      <p style="font-family:'Cormorant Garamond',serif; font-size:11px; letter-spacing:4px; color:#c9a96e; text-transform:uppercase; margin-bottom:28px;">Delivery Confirmed</p>
      <h2 style="font-family:'Cormorant Garamond',serif; font-size:32px; font-weight:400; color:#111; margin-bottom:24px; line-height:1.3;">Your Order<br><em>Has Arrived</em></h2>
      <p style="font-family:'Montserrat',sans-serif; font-size:13px; color:#444; line-height:1.9; margin-bottom:20px;">Dear <strong>${orderData.customerName}</strong>,</p>
      <p style="font-family:'Montserrat',sans-serif; font-size:13px; color:#555; line-height:1.9; margin-bottom:28px;">Order <strong>#${orderData.orderId}</strong> has been delivered. This moment, the unveiling of a new fragrance, is one we take great pride in. We hope your first impression is everything you imagined.</p>
      ${orderedItemsBlock}
      <div style="background:#f7efe6; border:1px solid #e6d6c1; padding: 28px; text-align:center; margin-bottom:32px;">
        <p style="font-family:'Cormorant Garamond',serif; font-size:18px; color:#5d4630; font-style:italic; line-height:1.7; margin:0;">"A great fragrance is not worn.<br>It is revealed."</p>
      </div>
      <p style="font-family:'Montserrat',sans-serif; font-size:12px; color:#888; line-height:1.9; margin-bottom:20px;">We would be honoured to welcome you back whenever the occasion calls for a new signature scent. At Valore Parfums, every visit is the beginning of a new olfactory story.</p>
      <p style="font-family:'Montserrat',sans-serif; font-size:12px; color:#888; line-height:1.9;">Should you wish to share your experience, we are always listening.</p>
      <div style="height:1px; background:#e8e4dc; margin: 36px 0 28px;"></div>
      <p style="font-family:'Cormorant Garamond',serif; font-size:16px; color:#111; font-style:italic;">With the deepest appreciation,</p>
      <p style="font-family:'Montserrat',sans-serif; font-size:10px; letter-spacing:3px; color:#c9a96e; text-transform:uppercase; margin-top:6px;">Valore Parfums</p>
  `);

  return {
    to: orderData.customerEmail,
    subject: `Order Delivered - #${orderData.orderId}`,
    html,
    text: `Dear ${orderData.customerName},\nYour order #${orderData.orderId} has been delivered.`,
  };
}

export function generateOrderCancelledEmail(orderData: {
  orderId: string;
  customerName: string;
  customerEmail: string;
  cancelReason: string;
  refundAmount: number;
  isPaid: boolean;
  items?: Array<{ perfumeName: string; quantity: number; ml: number; totalPrice: number }>;
}): EmailNotification {
  const refundApplicable = Boolean(orderData.isPaid) && Number(orderData.refundAmount || 0) > 0;
  const effectiveRefundAmount = refundApplicable ? Number(orderData.refundAmount || 0) : 0;
  const refundStatusMessage = refundApplicable
    ? `Payment has already been received. A refund of ৳ ${effectiveRefundAmount.toLocaleString("en-BD")} will be processed within 3 - 5 business days.`
    : "No payment has been received for this order yet, so no refund is applicable.";
  const cancelledItemsBlock = renderCancelledItemsBlock(orderData.items, effectiveRefundAmount, refundApplicable);

  const html = createEmailShell(`
      <p style="font-family:'Cormorant Garamond',serif; font-size:11px; letter-spacing:4px; color:#9e6e6e; text-transform:uppercase; margin-bottom:28px;">Cancellation Notice</p>
      <h2 style="font-family:'Cormorant Garamond',serif; font-size:32px; font-weight:400; color:#111; margin-bottom:24px; line-height:1.3;">Your Order<br><em>Has Been Cancelled</em></h2>

      <p style="font-family:'Montserrat',sans-serif; font-size:13px; color:#444; line-height:1.9; margin-bottom:20px;">Dear <strong>${orderData.customerName}</strong>,</p>
      <p style="font-family:'Montserrat',sans-serif; font-size:13px; color:#555; line-height:1.9; margin-bottom:28px;">We regret to inform you that Order <strong>#${orderData.orderId}</strong> has been cancelled. We understand this may be disappointing, and we sincerely apologise for any inconvenience this may have caused.</p>

      <div style="border-left: 2px solid #9e6e6e; padding: 16px 20px; background:#fff; margin-bottom:28px; color:#8B7500;">
        <p style="font-family:'Montserrat',sans-serif; font-size:10px; letter-spacing:3px; color:#8B7500; text-transform:uppercase; margin-bottom:10px;">Order Reference</p>
        <p style="font-family:'Cormorant Garamond',serif; font-size:22px; color:#8B7500; font-weight:500;">#${orderData.orderId}</p>
      </div>

      ${cancelledItemsBlock}

      <div style="background:#f8f0e5; border:1px solid #ead6b7; padding: 22px 24px; margin-bottom:18px;">
        <p style="font-family:'Montserrat',sans-serif; font-size:9px; letter-spacing:3px; color:#8b6a3e; text-transform:uppercase; margin-bottom:8px;">Refund Status</p>
        <p style="font-family:'Cormorant Garamond',serif; font-size:20px; color:#2a1c14; line-height:1.45; margin:0;">${refundStatusMessage}</p>
      </div>

      <div style="background:#fff; border:1px solid #efe8de; padding: 14px 16px; margin-bottom:28px;">
        <p style="font-family:'Montserrat',sans-serif; font-size:10px; letter-spacing:2px; color:#9e6e6e; text-transform:uppercase; margin-bottom:8px;">Cancellation Reason</p>
        <p style="font-family:'Montserrat',sans-serif; font-size:12px; color:#555; line-height:1.8;">${orderData.cancelReason}</p>
      </div>

      <p style="font-family:'Montserrat',sans-serif; font-size:12px; color:#888; line-height:1.9; margin-bottom:16px;">If payment was completed, any applicable refund will be returned to your original payment method. Should you wish to place a new order or have any questions regarding this cancellation, our client services team remains at your disposal.</p>
      <p style="font-family:'Montserrat',sans-serif; font-size:12px; color:#888; line-height:1.9;">We hope to have the honour of serving you again at Valore Parfums.</p>

      <div style="height:1px; background:#e8e4dc; margin: 36px 0 28px;"></div>
      <p style="font-family:'Cormorant Garamond',serif; font-size:16px; color:#111; font-style:italic;">With our sincerest apologies,</p>
      <p style="font-family:'Montserrat',sans-serif; font-size:10px; letter-spacing:3px; color:#c9a96e; text-transform:uppercase; margin-top:6px;">Valore Parfums</p>
  `);

  return {
    to: orderData.customerEmail,
    subject: `Order Cancelled - #${orderData.orderId}`,
    html,
    text: `Dear ${orderData.customerName},\nYour order #${orderData.orderId} has been cancelled. ${refundApplicable ? `Payment was received and refund amount is ${effectiveRefundAmount}.` : "Payment was not received, so no refund is applicable."}`,
  };
}

export function generateOrderReceivedEmail(orderData: {
  orderId: string;
  customerName: string;
  customerEmail: string;
  items: Array<{ perfumeName: string; quantity: number; ml: number; unitPrice: number }>;
}): EmailNotification {
  return generateOrderConfirmationEmail({
    orderId: orderData.orderId,
    customerName: orderData.customerName,
    customerEmail: orderData.customerEmail,
    items: orderData.items,
    subtotal: 0,
    discount: 0,
    deliveryFee: 0,
    total: 0,
    paymentMethod: "",
  });
}

export function generateOrderShippedEmail(orderData: {
  customerName: string;
  customerEmail: string;
  orderId: string;
  items?: Array<{ perfumeName: string; quantity: number; ml: number; unitPrice: number }>;
  trackingNumber?: string;
  estimatedDelivery?: string;
}): EmailNotification {
  return generateOrderDispatchedEmail({
    customerName: orderData.customerName,
    customerEmail: orderData.customerEmail,
    orderId: orderData.orderId,
    items: orderData.items,
    trackingNumber: orderData.trackingNumber,
    estimatedDelivery: orderData.estimatedDelivery,
  });
}

export function generatePaymentVerifiedEmail(orderData: {
  customerName: string;
  customerEmail: string;
  orderId: string;
  paymentMethod: string;
  amount: string;
}): EmailNotification {
  const amountValue = Number(orderData.amount) || 0;

  return generateOrderConfirmedEmail({
    orderId: orderData.orderId,
    customerName: orderData.customerName,
    customerEmail: orderData.customerEmail,
    items: [
      {
        perfumeName: `Payment Method: ${orderData.paymentMethod}`,
        quantity: 1,
        ml: 0,
        unitPrice: amountValue,
      },
    ],
    total: amountValue,
  });
}

if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
  const provider = new GmailSmtpEmailProvider(
    process.env.GMAIL_USER,
    process.env.GMAIL_PASS,
    process.env.GMAIL_FROM_EMAIL || process.env.GMAIL_USER,
  );
  initializeEmailProvider(provider);
} else {
  console.warn("GMAIL_USER/GMAIL_PASS not found. Email provider not initialized.");
}
