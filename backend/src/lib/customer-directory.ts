export interface Customer {
  email: string;
  name: string;
  orderCount: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  unsubscribed: boolean;
}

export function normalizeCustomerEmail(value: unknown): string {
  if (typeof value !== "string" || value.length > 512) return "";
  const email = value.trim().toLowerCase();
  if (email.length > 254) return "";
  const [local, domain, extra] = email.split("@");
  // Bare dot-atom addresses have the same meaning in the directory and SMTP.
  // Reject display names, comments, quoted local parts, controls and groups.
  if (
    extra !== undefined ||
    !local ||
    local.length > 64 ||
    !/^[a-z0-9!#$%&'*+\-/=?^_`{|}~]+(?:\.[a-z0-9!#$%&'*+\-/=?^_`{|}~]+)*$/i.test(
      local,
    )
  )
    return "";
  if (!domain || domain.length > 253) return "";
  const labels = domain.split(".");
  if (
    labels.length < 2 ||
    labels.some(
      (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
    )
  )
    return "";
  return email;
}

function orderDate(value: unknown): string | null {
  if (!value) return null;
  try {
    const date =
      value instanceof Date
        ? value
        : typeof value === "object" &&
            "toDate" in value &&
            typeof value.toDate === "function"
          ? value.toDate()
          : typeof value === "string" || typeof value === "number"
            ? new Date(value)
            : null;
    return date instanceof Date && Number.isFinite(date.getTime())
      ? date.toISOString()
      : null;
  } catch {
    return null;
  }
}

/** Use real orders, including guest/legacy orders; requests and signups aren't customers. */
export function buildCustomerDirectory(
  orders: Record<string, unknown>[],
  unsubscribed = new Set<string>(),
): Customer[] {
  const customers = new Map<string, Customer>();
  for (const order of orders) {
    if (
      order.entryType === "request" ||
      order.orderSource === "customer_request" ||
      order.orderSource === "stock_request"
    )
      continue;
    const email =
      normalizeCustomerEmail(order.customerEmail) ||
      normalizeCustomerEmail(order.recipientEmail);
    if (!email) continue;
    const date = orderDate(order.createdAt);
    const name =
      typeof order.customerName === "string" ? order.customerName.trim() : "";
    const customer = customers.get(email);
    if (!customer) {
      customers.set(email, {
        email,
        name,
        orderCount: 1,
        firstOrderAt: date,
        lastOrderAt: date,
        unsubscribed: unsubscribed.has(email),
      });
      continue;
    }
    customer.orderCount++;
    if (date && (!customer.firstOrderAt || date < customer.firstOrderAt))
      customer.firstOrderAt = date;
    if (date && (!customer.lastOrderAt || date > customer.lastOrderAt)) {
      customer.lastOrderAt = date;
      if (name) customer.name = name;
    }
    if (!customer.name && name) customer.name = name;
  }
  return [...customers.values()].sort(
    (a, b) =>
      (b.lastOrderAt || "").localeCompare(a.lastOrderAt || "") ||
      a.email.localeCompare(b.email),
  );
}
