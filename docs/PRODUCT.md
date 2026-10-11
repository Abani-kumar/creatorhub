# Part Six: Product Challenge

Three improvements, in recommended order. All three go beyond what the brief explicitly asked for. **I implemented the first one.**

> **Scope note.** No financial or performance claim below is a measured result. The demo uses synthetic purchases and derived view counts, so conversion-style figures are illustrative, not evidence.

---

## At a glance

| # | Recommendation | Priority | Status |
|:--:|---|:---:|:---:|
| **1** | Publish automatically after verification | **High** | **Built** |
| **2** | Net earnings and payout clarity | **High** | Documented |
| **3** | Creator performance insights | Medium | Documented |

---

## 1. Publish automatically after verification

| | |
|---|---|
| **Priority** | **High** — removes friction the verification rule creates |
| **Status** | **Built** and covered by tests (`tests/publish-intent.test.ts`, `e2e/` journeys) |

### What I would change

When an unverified creator clicks **Publish**, show a dialog that explains why they can’t publish yet and offers a choice:

1. **Save as draft**
2. **Verify now, publish when approved**
3. **Verify later, publish when approved**

If they choose to publish after approval, that choice is saved on the video as a **visible intent**. They can cancel it at any time, and saving the item as a draft also cancels it.

### Why

The brief only says to “design an appropriate user experience” for a blocked publish. A plain error leaves the creator with extra work: they must remember to return to every video after approval, and some never will.

The opposite mistake is worse. If approval published **every** draft, unfinished work would go in front of buyers.

### How it improves the experience

- The creator **never hits a dead end**. Their intent is saved and they can move on.
- Approval publishes **only the videos the creator chose**, never all their drafts.
- If verification finishes before the video has processed, the item **waits for the video**, then goes live by itself.
- If something can’t be fixed by waiting (processing failed, details missing), the **intent is dropped** and the creator sees why.
- Every publishing path still goes through the **same server-side rule** (`canPublish`).

### Engineering guardrails (why it’s safe)

- Intent is **per item and explicit** — not a global “publish everything when verified” flag.
- Same gate as manual publish: verified creator, complete content, video **ready**.
- **Idempotent** scheduler transitions — repeating the job does nothing harmful.
- UI surfaces intent on list and detail, with **Cancel**; draft save clears intent.

### Try it in the demo

1. Sign in as **Sam** (unverified).
2. Create content with a **ready** video and choose **Publish** → **Verify later, publish when approved**.
3. Complete verification and **approve** from demo controls — only that item goes live.

### What’s still missing

Measurement: how many creators use the option, how many cancel, and time from approval to live. The demo can’t answer that.

---

## 2. Net earnings and payout clarity

| | |
|---|---|
| **Priority** | **High** — prerequisite before real money moves |
| **Status** | Documented (not built) |

### What I would change

Replace the single “revenue” number with a statement that separates:

| Line | Meaning |
|---|---|
| **Gross sales** | Sum of completed purchase prices |
| **Refunds** | Money returned to buyers |
| **Fees** | Platform and payment-processing costs |
| **Net earnings** | What the creator actually keeps |

Add **payout status**: what is available, what is held, and the **next payout date**. Every figure should **link to the individual purchases** behind it.

### Why

Today, revenue means the **gross price of completed purchases**. Fees, taxes and payouts aren’t modelled, so the dashboard can’t show what a creator actually keeps.

A number that looks like income but is really gross sales creates disappointment and support requests when the payout is smaller.

### How it improves the experience

- One **clearly labelled definition** of each number on every screen.
- Creators can **trace any total** back to individual purchases.
- Creators can **plan prices and spending** from what they actually keep.
- Fewer disputes, and **more trust** in the platform.

### What it needs first

A decision on:

- Platform fee and payment-processing costs
- How **refunds** affect earnings already paid out
- Tax and **currency** handling

It also needs a **ledger** (append-only entries) rather than editable totals, so figures can always be reconciled. This is a **data-model change before it is a screen change**.

### What exists in this build

Revenue is gross completed sales; refunded/failed/pending purchases are excluded from totals. The price field copy states that revenue counts the **full sale price** — the UI does not imply net payout.

---

## 3. Creator performance insights

| | |
|---|---|
| **Priority** | **Medium** — valuable after earnings are trustworthy |
| **Status** | Documented (raw metrics exist; no interpretation UI) |

### What I would change

Turn the numbers creators already see into **actionable prompts**: conversion per item, comparison against their own catalog, and price-testing opportunities — only when the data supports a fair suggestion.

### What exists today

The content list and details show **views, purchases, revenue, and conversion** per item; purchases include **country**. That is the raw material; there is no “what should I do next?” layer yet.

### Candidate insights (show only when data is sufficient)

| Signal | Suggested prompt |
|---|---|
| Healthy views, **low conversion** vs creator median | Review thumbnail, description, or price |
| **High conversion**, low views | Worth promoting more |
| Revenue **by country** skewed vs views | Market over- or under-served |
| Conversion far above other items | Possible **price test** (with real experiment design, not a guess) |

### Honest limits

- Conversion depends on **how views are counted**.
- Cross-video price comparison is not a controlled experiment.
- Seeded conversion rates are random — an insights screen on demo data would show **layout only**, not truth.
- Phrase as “worth a look”, never promised gains; **hide** when sample size is too small.

### How it improves the experience

Moves the dashboard from **“what happened”** to **“what could I do next”** — where creators are otherwise on their own.

---

## Why this order

```text
1. Publish-after-verify intent  →  softens friction from the verification rule itself
2. Net earnings & payouts       →  trust and ledger before real money
3. Performance insights         →  needs reliable views + earnings; highest risk if rushed
```

Recommendation **1** ships with the feature it improves. Recommendation **2** blocks safe payouts and is hard to retrofit once historical purchases lack fee data. Recommendation **3** is the most open-ended and easiest to get wrong on thin data — build it last.
