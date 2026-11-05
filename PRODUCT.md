# Valore Parfums

Valore Parfums sells perfume decants and bottles to customers in Bangladesh. The storefront supports browsing, guest and account orders, delivery or pickup, and order tracking. Administrators manage the catalogue, orders, store settings, and business records through `/admin`.

## Customer directory and messaging

Administrators need a single email entry for each customer who has ordered, regardless of how often they return. `/admin/customers` derives the directory from existing orders, normalizes email case and whitespace, and groups repeat orders. It includes guest orders and legacy recipient emails; request-only records and signups without orders are excluded.

The primary task is to find or select customers, compose an offer or update, preview it, and send it from the admin panel. Administrators can message one person, selected customers, or all eligible customers. Plain messages receive the store’s existing order-email styling; custom HTML bodies are sanitized and placed inside that same branded shell.

Each recipient receives a separate private email. Sending starts on the Send action and continues while the page remains open. Durable delivery results allow interrupted messages to resume without automatically repeating completed or uncertain deliveries. The UI distinguishes provider acceptance, failure, skipped opt-outs, and uncertain deliveries. Customers can unsubscribe from promotions through a signed link without signing in; transactional order emails continue.

## Interface constraints

This is a scoped extension of the existing admin interface. Preserve its theme tokens, typography, navigation, familiar controls, and responsive behavior. The directory prioritizes search, legible rows, selection, and clear recipient counts. The composer prioritizes readable fields, preview, immediate sending, and recoverable results. Keep the storefront and unrelated admin workflows intact.

Operational details, configuration, storage, and isolated verification are documented in [CUSTOMER_MESSAGING.md](CUSTOMER_MESSAGING.md). This context is derived from the implemented source and the requested feature; it adds no new commercial claims.
