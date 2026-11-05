"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Mail,
  RefreshCw,
  Search,
  Send,
  Users,
} from "lucide-react";

interface Customer {
  email: string;
  name: string;
  orderCount: number;
  lastOrderAt: string | null;
  unsubscribed: boolean;
}
interface Campaign {
  id: string;
  subject: string;
  total: number;
  nextIndex: number;
  sent: number;
  failed: number;
  skipped: number;
  uncertain: number;
  done: boolean;
  createdAt: string;
  retryAfter?: number;
  issues?: { email: string; status: string; error: string }[];
}
const inputClass =
  "w-full min-w-0 rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] disabled:opacity-60";
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--gold-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded bg-[var(--gold)] px-5 py-2 text-sm font-medium text-black transition-colors hover:bg-[var(--gold-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-50";
const dateFormat = new Intl.DateTimeFormat("en-BD", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Dhaka",
});
const date = (value: string | null) =>
  value ? dateFormat.format(new Date(value)) : "—";

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.error || "Could not complete the request. Please try again.",
    );
  return data as T;
}

function DeliverySummary({ campaign }: { campaign: Campaign }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <p className="font-medium">
        {campaign.done
          ? "Sending complete"
          : `Sending ${campaign.nextIndex} of ${campaign.total}`}
      </p>
      <p className="text-sm text-[var(--text-secondary)] tabular-nums">
        {campaign.sent} accepted by email provider · {campaign.failed} failed ·{" "}
        {campaign.skipped} unsubscribed
        {campaign.uncertain > 0 && ` · ${campaign.uncertain} need review`}
      </p>
      {!campaign.done && (
        <>
          <progress
            value={campaign.nextIndex}
            max={campaign.total}
            className="h-2 w-full accent-[var(--gold)]"
            aria-label="Email sending progress"
          />
          <p className="text-sm text-[var(--text-secondary)]">
            Keep this page open while sending. If interrupted, resume from
            message history.
          </p>
        </>
      )}
      {campaign.uncertain > 0 && (
        <p className="text-sm text-[var(--warning)]">
          Some deliveries were interrupted. Check your email provider before
          sending to those customers again.
        </p>
      )}
    </div>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [canSend, setCanSend] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [composing, setComposing] = useState(false);
  const [audience, setAudience] = useState<"all" | "selected">("all");
  const [subject, setSubject] = useState("");
  const [format, setFormat] = useState<"text" | "html">("text");
  const [text, setText] = useState("");
  const [html, setHtml] = useState("");
  const [preview, setPreview] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [active, setActive] = useState<Campaign | null>(null);
  const [history, setHistory] = useState<Campaign[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [details, setDetails] = useState<Campaign | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const busy = useRef(false);
  const requestId = useRef("");
  const mounted = useRef(true);
  const currentPreview = useRef(0);

  const loadHistory = useCallback(async () => {
    try {
      const data = await request<{ messages: Campaign[] }>(
        "/api/customers/messages",
      );
      if (mounted.current) {
        setHistory(data.messages);
        setHistoryError("");
      }
    } catch (error) {
      if (mounted.current) setHistoryError((error as Error).message);
    }
  }, []);
  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await request<{
        customers: Customer[];
        canSend: boolean;
        setupError: string | null;
      }>("/api/customers");
      if (!mounted.current) return;
      setCustomers(data.customers);
      setCanSend(data.canSend);
      setSetupError(data.setupError || "");
      setSelected(
        (previous) =>
          new Set(
            [...previous].filter((email) =>
              data.customers.some(
                (customer) =>
                  customer.email === email && !customer.unsubscribed,
              ),
            ),
          ),
      );
    } catch (error) {
      if (mounted.current) setLoadError((error as Error).message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void loadCustomers();
    void loadHistory();
    return () => {
      mounted.current = false;
    };
  }, [loadCustomers, loadHistory]);
  useEffect(() => {
    if (!sending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [sending]);

  const eligible = customers.filter((customer) => !customer.unsubscribed);
  const filtered = useMemo(
    () =>
      customers.filter((customer) =>
        `${customer.email} ${customer.name}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      ),
    [customers, search],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * 25, currentPage * 25 + 25);
  const visibleEligible = visible.filter((customer) => !customer.unsubscribed);
  const allVisibleSelected =
    visibleEligible.length > 0 &&
    visibleEligible.every((customer) => selected.has(customer.email));
  const recipientCount = audience === "all" ? eligible.length : selected.size;
  const message = format === "text" ? text : html;
  const editable = !sending && !active;
  const payload = { subject, message, format };

  const invalidatePreview = () => {
    currentPreview.current++;
    setPreview("");
    setSendError("");
  };
  const openComposer = (emails?: string[]) => {
    if (busy.current) return;
    const chosen = emails ? new Set(emails) : selected;
    setSelected(chosen);
    setAudience(chosen.size ? "selected" : "all");
    setActive(null);
    setSubject("");
    setText("");
    setHtml("");
    setFormat("text");
    setPreview("");
    setSendError("");
    requestId.current = crypto.randomUUID();
    setComposing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const showPreview = async () => {
    const version = ++currentPreview.current;
    setPreviewing(true);
    setSendError("");
    try {
      const result = await request<{ html: string }>(
        "/api/customers/preview",
        payload,
      );
      if (version === currentPreview.current) setPreview(result.html);
    } catch (error) {
      if (version === currentPreview.current)
        setSendError((error as Error).message);
    } finally {
      setPreviewing(false);
    }
  };
  const dispatch = async (campaign: Campaign) => {
    let current = campaign;
    setActive(current);
    while (!current.done && mounted.current) {
      current = await request<Campaign>(
        `/api/customers/messages/${current.id}`,
        {},
      );
      if (!mounted.current) return;
      setActive(current);
      if (!current.done)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(800, (current.retryAfter || 0) * 1000)),
        );
    }
  };
  const send = async (existing?: Campaign) => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setSendError("");
    setComposing(true);
    setDetails(null);
    try {
      const campaign =
        existing ||
        (await request<Campaign>("/api/customers/messages", {
          ...payload,
          requestId: requestId.current,
          audience,
          emails: [...selected],
        }));
      await dispatch(campaign);
    } catch (error) {
      if (mounted.current) setSendError((error as Error).message);
    } finally {
      busy.current = false;
      if (mounted.current) {
        setSending(false);
        void loadHistory();
      }
    }
  };
  const showDetails = async (campaign: Campaign) => {
    setDetailsLoading(true);
    setHistoryError("");
    try {
      setDetails(
        await request<Campaign>(`/api/customers/messages/${campaign.id}`),
      );
    } catch (error) {
      setHistoryError((error as Error).message);
    } finally {
      setDetailsLoading(false);
    }
  };
  const toggle = (email: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-light">Customer directory</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
            Everyone who has placed an order, with each email listed once. Send
            offers and updates in the Valore Parfums email style.
          </p>
          <div className="gold-line mt-3" />
        </div>
        {!composing && (
          <button
            type="button"
            className={primaryButton}
            onClick={() => openComposer()}
            disabled={loading || !!loadError || eligible.length === 0}
          >
            <Mail size={17} />
            {selected.size
              ? `Message selected (${selected.size})`
              : "Message customers"}
          </button>
        )}
      </div>

      {setupError && (
        <p
          role="status"
          className="rounded border border-[var(--border)] bg-[var(--bg-surface)] p-4 text-sm text-[var(--warning)]"
        >
          {setupError}
        </p>
      )}

      {composing ? (
        <section aria-labelledby="compose-title" className="space-y-5">
          <button
            type="button"
            className={secondaryButton}
            disabled={sending}
            onClick={() => {
              setComposing(false);
              setActive(null);
              setSendError("");
            }}
          >
            <ArrowLeft size={16} />
            Back to customers
          </button>
          {active ? (
            <div className="space-y-5 rounded border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-7">
              <h2 id="compose-title" className="break-words text-xl">
                {active.subject}
              </h2>
              <DeliverySummary campaign={active} />
              {sendError && (
                <p role="alert" className="text-sm text-[var(--error)]">
                  {sendError}
                </p>
              )}
              {!sending && !active.done && (
                <button
                  type="button"
                  className={primaryButton}
                  disabled={!canSend}
                  onClick={() => void send(active)}
                >
                  <Send size={16} />
                  Resume sending
                </button>
              )}
              {!sending && active.done && (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => void showDetails(active)}
                  >
                    View delivery results
                  </button>
                  <button
                    type="button"
                    className={primaryButton}
                    onClick={() => openComposer()}
                  >
                    New message
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid min-w-0 gap-6 xl:grid-cols-2">
              <form
                className="min-w-0 space-y-5 rounded border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <h2 id="compose-title" className="text-xl">
                  New message
                </h2>
                <div className="space-y-2">
                  <label
                    htmlFor="customer-audience"
                    className="block text-sm font-medium"
                  >
                    Recipients
                  </label>
                  <select
                    id="customer-audience"
                    className={inputClass}
                    value={audience}
                    disabled={!editable}
                    onChange={(event) => {
                      setAudience(event.target.value as "all" | "selected");
                      requestId.current = crypto.randomUUID();
                    }}
                  >
                    <option value="all">
                      All customers ({eligible.length})
                    </option>
                    <option value="selected" disabled={!selected.size}>
                      Selected customers ({selected.size})
                    </option>
                  </select>
                  <p className="break-words text-sm text-[var(--text-secondary)]">
                    {audience === "selected" && selected.size === 1
                      ? [...selected][0]
                      : `${recipientCount} unique email addresses`}
                    . Each customer receives a private email. Unsubscribed
                    customers are excluded.
                  </p>
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="message-subject"
                    className="block text-sm font-medium"
                  >
                    Subject
                  </label>
                  <input
                    autoFocus
                    id="message-subject"
                    className={inputClass}
                    value={subject}
                    maxLength={200}
                    required
                    disabled={!editable}
                    placeholder="Your offer or update"
                    onChange={(event) => {
                      setSubject(event.target.value);
                      invalidatePreview();
                      requestId.current = crypto.randomUUID();
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="message-format"
                    className="block text-sm font-medium"
                  >
                    Format
                  </label>
                  <select
                    id="message-format"
                    className={inputClass}
                    value={format}
                    disabled={!editable}
                    onChange={(event) => {
                      setFormat(event.target.value as "text" | "html");
                      invalidatePreview();
                      requestId.current = crypto.randomUUID();
                    }}
                  >
                    <option value="text">Message — automatically styled</option>
                    <option value="html">HTML — custom formatting</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="customer-message"
                    className="block text-sm font-medium"
                  >
                    {format === "html" ? "HTML message" : "Message"}
                  </label>
                  <textarea
                    id="customer-message"
                    className={`${inputClass} min-h-64 resize-y ${format === "html" ? "font-mono" : ""}`}
                    value={message}
                    maxLength={50000}
                    required
                    disabled={!editable}
                    placeholder={
                      format === "html"
                        ? "<p>Hello,</p>\n<p>Write your offer here. Use <strong>bold text</strong>, links, or images.</p>"
                        : "Write your message here. Paragraphs and line breaks will be formatted for you."
                    }
                    onChange={(event) => {
                      if (format === "text") setText(event.target.value);
                      else setHtml(event.target.value);
                      invalidatePreview();
                      requestId.current = crypto.randomUUID();
                    }}
                  />
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                    {format === "html"
                      ? "Paste the HTML for your message body. Use inline styles, HTTPS images, and links. Scripts and unsupported styles are removed."
                      : "Your message gets the same branded header and footer as order confirmation emails."}{" "}
                    An unsubscribe link is included automatically.
                  </p>
                </div>
                {sendError && (
                  <p role="alert" className="text-sm text-[var(--error)]">
                    {sendError}
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={
                      sending ||
                      previewing ||
                      !subject.trim() ||
                      !message.trim()
                    }
                    onClick={() => void showPreview()}
                  >
                    {previewing ? "Preparing preview…" : "Preview email"}
                  </button>
                  <button
                    type="submit"
                    className={primaryButton}
                    disabled={
                      sending ||
                      !canSend ||
                      !recipientCount ||
                      recipientCount > 5000 ||
                      !subject.trim() ||
                      !message.trim()
                    }
                  >
                    <Send size={16} />
                    {sending
                      ? "Starting…"
                      : `Send to ${recipientCount} customer${recipientCount === 1 ? "" : "s"}`}
                  </button>
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  Sending starts when you click Send. Keep this page open until
                  it finishes.
                  {recipientCount > 5000 &&
                    " Select up to 5,000 customers per message."}
                </p>
              </form>
              <div className="min-w-0 space-y-3">
                <h2 className="text-lg">Email preview</h2>
                {preview ? (
                  <iframe
                    title="Customer email preview"
                    sandbox=""
                    referrerPolicy="no-referrer"
                    srcDoc={preview}
                    className="h-[680px] w-full rounded border border-[var(--border)] bg-white"
                  />
                ) : (
                  <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded border border-dashed border-[var(--border)] p-7 text-center text-[var(--text-secondary)]">
                    <Mail size={28} />
                    <p className="max-w-xs text-sm leading-relaxed">
                      Write your message, then click Preview email to see the
                      formatted email before sending.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      ) : (
        <section aria-label="Customers" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Users size={17} />
              <span className="tabular-nums">
                {customers.length} customers · {eligible.length} can receive
                email
              </span>
            </div>
            <button
              type="button"
              className={secondaryButton}
              disabled={loading}
              onClick={() => {
                void loadCustomers();
                void loadHistory();
              }}
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:max-w-md">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-3 text-[var(--text-secondary)]"
              />
              <label htmlFor="customer-search" className="sr-only">
                Search customers by name or email
              </label>
              <input
                id="customer-search"
                className={`${inputClass} pl-10`}
                type="search"
                placeholder="Search name or email"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
              />
            </div>
            {selected.size > 0 && (
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setSelected(new Set())}
              >
                Clear selection ({selected.size})
              </button>
            )}
          </div>
          {loading ? (
            <div
              className="space-y-3"
              role="status"
              aria-label="Loading customer directory"
            >
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-16 rounded" />
              ))}
            </div>
          ) : loadError ? (
            <div
              role="alert"
              className="space-y-3 rounded border border-[var(--border)] p-6"
            >
              <p className="text-sm text-[var(--error)]">{loadError}</p>
              <button
                type="button"
                className={secondaryButton}
                onClick={() => void loadCustomers()}
              >
                Try again
              </button>
            </div>
          ) : !filtered.length ? (
            <div className="rounded border border-[var(--border)] p-10 text-center">
              <h2 className="text-lg">
                {customers.length
                  ? "No matching customers"
                  : "Your customers will appear here"}
              </h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {customers.length
                  ? "Try another name or email address."
                  : "Once an order is placed, its customer email is added automatically. Repeat orders stay under one email."}
              </p>
            </div>
          ) : (
            <>
              <div className="relative overflow-x-auto rounded border border-[var(--border)]">
                <table className="w-full text-left text-sm" style={{ minWidth: 720 }}>
                  <thead className="bg-[var(--bg-surface)] text-[var(--text-secondary)]">
                    <tr>
                      <th className="w-12 p-4">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--gold)]"
                          aria-label="Select customers on this page"
                          checked={allVisibleSelected}
                          disabled={!visibleEligible.length}
                          onChange={() =>
                            setSelected((previous) => {
                              const next = new Set(previous);
                              for (const customer of visibleEligible) {
                                if (allVisibleSelected)
                                  next.delete(customer.email);
                                else next.add(customer.email);
                              }
                              return next;
                            })
                          }
                        />
                      </th>
                      <th className="py-4 pr-4 font-medium" style={{ minWidth: 220 }}>Customer</th>
                      <th className="p-4 font-medium">Orders</th>
                      <th className="p-4 font-medium">Last order</th>
                      <th className="p-4 font-medium">Email status</th>
                      <th className="p-4">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((customer) => (
                      <tr
                        key={customer.email}
                        className="border-t border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--gold-tint)]"
                      >
                        <td className="p-4">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[var(--gold)]"
                            aria-label={`Select ${customer.email}`}
                            checked={selected.has(customer.email)}
                            disabled={customer.unsubscribed}
                            onChange={() => toggle(customer.email)}
                          />
                        </td>
                        <td className="py-4 pr-4" style={{ minWidth: 220 }}>
                          <p className="font-medium">
                            {customer.name || "Customer"}
                          </p>
                          <p className="mt-1 break-all text-[var(--text-secondary)]">
                            {customer.email}
                          </p>
                        </td>
                        <td className="p-4 tabular-nums">
                          {customer.orderCount}
                        </td>
                        <td className="whitespace-nowrap p-4 text-[var(--text-secondary)]">
                          {date(customer.lastOrderAt)}
                        </td>
                        <td className="p-4 text-[var(--text-secondary)]">
                          {customer.unsubscribed ? "Unsubscribed" : "Available"}
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            className={secondaryButton}
                            disabled={customer.unsubscribed}
                            aria-label={`Message ${customer.email}`}
                            onClick={() => openComposer([customer.email])}
                          >
                            <Mail size={15} />
                            <span className="hidden lg:inline">Message</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
                <span className="tabular-nums">
                  {currentPage * 25 + 1}–
                  {Math.min((currentPage + 1) * 25, filtered.length)} of{" "}
                  {filtered.length} customers
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={secondaryButton}
                    aria-label="Previous customer page"
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <button
                    type="button"
                    className={secondaryButton}
                    aria-label="Next customer page"
                    disabled={currentPage + 1 >= pageCount}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      <section
        aria-labelledby="history-title"
        className="space-y-4 border-t border-[var(--border)] pt-6"
      >
        <h2 id="history-title" className="text-xl">
          Message history
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          The latest 20 messages. Resume interrupted sends or review delivery
          results.
        </p>
        {historyError && (
          <p role="alert" className="text-sm text-[var(--error)]">
            {historyError}{" "}
            <button
              className="underline underline-offset-4"
              type="button"
              onClick={() => void loadHistory()}
            >
              Retry
            </button>
          </p>
        )}
        {!history.length && !historyError && (
          <p className="py-3 text-sm text-[var(--text-secondary)]">
            No messages sent yet.
          </p>
        )}
        <div className="divide-y divide-[var(--border)]">
          {history.map((campaign) => (
            <div
              key={campaign.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-sm font-medium">
                  {campaign.subject}
                </h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)] tabular-nums">
                  {date(campaign.createdAt)} · {campaign.sent}/{campaign.total}{" "}
                  accepted
                  {campaign.failed > 0 && ` · ${campaign.failed} failed`}
                  {campaign.skipped > 0 &&
                    ` · ${campaign.skipped} unsubscribed`}
                  {campaign.uncertain > 0 &&
                    ` · ${campaign.uncertain} need review`}
                  {!campaign.done && " · Incomplete"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={detailsLoading}
                  onClick={() => void showDetails(campaign)}
                >
                  Results
                </button>
                {!campaign.done && (
                  <button
                    type="button"
                    className={secondaryButton}
                    disabled={sending || !canSend}
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      void send(campaign);
                    }}
                  >
                    Resume
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {detailsLoading && (
          <p role="status" className="text-sm text-[var(--text-secondary)]">
            Loading delivery results…
          </p>
        )}
        {details && (
          <div className="space-y-4 rounded border border-[var(--border)] p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="break-words font-medium">{details.subject}</h3>
              <button
                type="button"
                className="shrink-0 text-sm underline underline-offset-4"
                onClick={() => setDetails(null)}
              >
                Close results
              </button>
            </div>
            <DeliverySummary campaign={details} />
            {details.issues?.map((issue) => (
              <div
                key={issue.email}
                className="border-t border-[var(--border)] pt-3 text-sm"
              >
                <p className="break-all font-medium">
                  {issue.email} · {issue.status}
                </p>
                <p className="mt-1 break-words text-[var(--text-secondary)]">
                  {issue.error}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
