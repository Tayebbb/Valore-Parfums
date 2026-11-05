import { db, Collections } from "./prisma";
import { buildCustomerDirectory } from "./customer-directory";

export const CUSTOMER_MESSAGES = "customerMessages";
export const EMAIL_PREFERENCES = "customerEmailPreferences";

export async function getCustomers() {
  const [orders, preferences] = await Promise.all([
    db
      .collection(Collections.orders)
      .select(
        "customerEmail",
        "recipientEmail",
        "customerName",
        "createdAt",
        "entryType",
        "orderSource",
      )
      .get(),
    db.collection(EMAIL_PREFERENCES).get(),
  ]);
  const unsubscribed = new Set(
    preferences.docs
      .filter((doc) => doc.data().unsubscribed === true)
      .map((doc) => String(doc.data().email)),
  );
  return buildCustomerDirectory(
    orders.docs.map((doc) => doc.data()),
    unsubscribed,
  );
}
