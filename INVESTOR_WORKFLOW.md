# The Story of Rafi's ৳30,000

**An end-to-end walkthrough of the Valore Parfums Investor System, told as a story.**

*Every number below is exactly how the system computes it — this is the real flow.*

---

## Act 1 — The Handshake

Rafi, a friend of the business, has ৳30,000 sitting idle. Valore wants to stock 500ml of
**Oud Royale**, which costs ৳60 per ml. A deal is made: Rafi funds the bottle, and gets
**40% of the profit** on every ml sold. No shares, no ownership of Valore — just this stock.

**In the app:** The admin opens `/admin/investments` → Investors tab → **New Investor**,
enters Rafi's name and the email he uses on the site. Because that email already has a
customer account, the system links them — Rafi's normal login now also opens an
**Investor Portal** (`/investor`).

Then **New Investment**: pick Oud Royale, enter 500ml at ৳60/ml, set profit share 40%.
The system itself computes the investment = **৳30,000** — the admin never types that
number, so it can never be faked. Three things are born at once, permanently:

- An **investment** worth ৳30,000
- An **allocation** (the "lot"): 500ml of Oud Royale locked at ৳60/ml cost
- The first entry in an **unchangeable ledger** — the diary where every taka will be
  recorded forever

From this second, one rule is enforced by the system on every single transaction:

> **৳30,000 = money recovered + money still in stock.** Always.
> If any operation would break this, it is rejected and rolled back.

---

## Act 2 — The First Sale

A customer buys a **10ml decant for ৳900**. The order is placed, packed, and marked
**Dispatched** — that's the magic moment. Money is only ever recognised at Dispatched,
never before.

The system does the math, in this exact order:

| | |
|---|---|
| Revenue | ৳900 |
| Perfume cost (10ml × ৳60) | −৳600 |
| Direct costs (bottle, atomizer, label, packaging) | −৳100 |
| **Real profit** | **৳200** |

Then the ৳900 splits three ways:

1. **৳600 goes back to Rafi as capital** — this is his own money returning, *not* profit.
   His "recovered" counter: ৳600. His stock counter: ৳29,400. (600 + 29,400 = 30,000 ✓)
2. **৳80 to Rafi as profit** (40% of ৳200) — this lands in his "available profit" pot.
3. **৳120 to Valore's owners** (60%) — and the owners' books record **only ৳120, never
   the full ৳200**. The ৳200 exists once, split ৳80 + ৳120. No double counting.

Rafi opens his portal that evening and sees it all: one sale, ৳600 back, ৳80 earned.
The lot shows 490ml remaining.

---

## Act 3 — The Hiccup

The next customer's 10ml order gets dispatched… then the delivery fails and the admin
cancels it. No panic: the system writes **reversal entries** — it never erases anything.
The ৳600 recovery is undone, the ৳80 profit is undone, the owners' ৳120 is undone, and
the 10ml goes back into the lot. The diary now shows four lines: sale, sale, undo, undo.
Anyone auditing later sees the truth, not a cleaned-up version.

---

## Act 4 — Months Pass

Oud Royale sells well. After **30 sales of 10ml each** (300ml gone):

- Capital recovered: **৳18,000** — still in stock: **৳12,000**
- Profit earned: 30 × ৳80 = **৳2,400**

### Taking profit out

Rafi wants some cash. In his portal he clicks **Request Withdrawal — ৳2,000, via bKash**.
He *cannot* touch the ৳12,000 in stock — only earned profit is withdrawable, and the
system blocks any request above ৳2,400.

The admin gets the request in the Withdrawals tab, **Approves** it (the ৳2,000 is
deducted at this exact moment, inside a locked transaction that re-checks the balance),
sends the bKash, then marks it **Paid**. Rafi's available profit: **৳400**.

### Adding more money

Happy with the returns, Rafi adds **৳10,000 more**. The original ৳30,000 record is never
edited — the system creates a *second* investment (say, 100ml of Baccarat Noir at
৳100/ml). His statement will forever show: Original ৳30,000 + Additional ৳10,000 =
৳40,000, with dates.

---

## Act 5 — The Exit (two doors)

**Door 1 — Ride it out.** The remaining 200ml keeps selling. When the last ml goes,
৳30,000 has fully come home, all profit is collected, and the investment closes itself.

**Door 2 — Buyback today.** Rafi needs his money now. The admin opens the investment →
**Buyback**. The system shows the offer *before* anything is confirmed:

> Stock still unsold: ৳12,000 + unclaimed profit: ৳400 = **pay Rafi ৳12,400**

No imaginary "future profits" — only what's real. On confirm: Rafi is paid out, the
200ml of stock becomes fully Valore-owned, and the investment is stamped `bought back`.
Every step, again, written to the diary.

---

## Epilogue — The Statement

At any point — mid-story or years later — Rafi (or the admin, for any investor) opens
**Account Statement** (`/investor/statement`) and prints one page that answers everything:

| | |
|---|---|
| Original capital | ৳30,000 |
| Additional capital | ৳10,000 |
| Capital recovered | ৳18,000 |
| Still in stock | ৳22,000 |
| Profit earned | ৳2,400 |
| Profit withdrawn | ৳2,000 |
| Available now | ৳400 |
| Buyback value today | shown live |
| ROI | shown live |

And beneath it: **every transaction that ever happened**, in order, none editable, each
one adding up to the balances above. If every computer screen vanished tomorrow, Rafi's
entire account could be rebuilt from that diary alone.

---

## The whole life of an investment, in one line

> Money in → stock → sales return capital + split profit honestly → profit out on
> request → exit by sell-through or buyback — with an unbreakable paper trail from the
> first taka to the last.

---

### Quick rules the system never breaks

1. **Capital is not profit.** Money coming back from sales is Rafi's own money returning.
2. **Only profit is withdrawable.** Stock money comes back only through sales or buyback.
3. **Profit is never counted twice.** ৳200 profit = ৳80 investor + ৳120 Valore, exactly.
4. **Losses are never turned into profit.** A losing sale still returns capital, but
   nobody "earns" from it.
5. **History is never edited.** Mistakes are corrected with new entries, never by
   changing old ones.
6. **Every balance can be rebuilt from the ledger.** Trust, but verify — automatically.
