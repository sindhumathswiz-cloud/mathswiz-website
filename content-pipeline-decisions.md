# Content pipeline (Phase QB): what's actually blocking it

I dug into the book-ingestion code and the deployment docs rather than just re-flagging "needs a decision." Here's what I found, and it changes the priority of one of these two decisions.

## 1. Storage — this is a hard blocker for Vercel, not a someday concern

`lib/book-storage.ts` writes every uploaded book PDF and every rendered page image straight to local disk:

```ts
function storageRoot() {
  return path.resolve(process.env.QB_PRIVATE_STORAGE_ROOT || path.join(process.cwd(), '.private', 'book-ingestion'));
}
```

`DEPLOY.md` documents Vercel as the only hosting target ("Deployment Guide — Vercel + GoDaddy Domain"), with Postgres on Neon/Supabase and rate-limiting on Upstash Redis — a fully serverless setup. Vercel's function filesystem is read-only outside `/tmp`, and `/tmp` is wiped between invocations and not shared across instances. Concretely: the first book PDF a teacher uploads in production will either fail to write or vanish before the next request touches it. This isn't a scaling concern to revisit later — book ingestion cannot work on Vercel at all until this changes.

**Options**, given you already run Postgres on Supabase (confirmed — it's just the DB host today, no Supabase SDK anywhere in the app):

| Option | Cost | Why it might fit |
|---|---|---|
| **Supabase Storage** | Free up to 1 GB, then ~$0.021/GB-month + egress | Zero new vendor — same project, same dashboard, same billing you already have. S3-compatible API. My default recommendation unless you expect heavy egress. |
| **Cloudflare R2** | $0.015/GB-month, **zero egress fees**, 10 GB free | Cheapest at scale, S3-compatible. Worth it if page images will ever be served to end users directly (they currently aren't — admin/teacher review only). |
| **AWS S3** | ~$0.023/GB-month + egress (~$0.09/GB out) | Only worth it if you're already in AWS for something else. Egress costs add up. |
| **Backblaze B2** | $0.006/GB-month, first 3x storage egress free/month | Cheapest raw storage, works as an R2/S3 alternative. |

My recommendation: **Supabase Storage**, purely because it adds no new vendor relationship or credential to manage, and the volumes here (PDFs + page images for a Class 11/12 math question bank) are small enough that the pricing difference vs. R2 is not the deciding factor. If you'd rather standardize on an S3-compatible provider you can also point other future features at, R2 is the better long-term pick.

Either way, the code change is the same shape: `book-storage.ts`'s five functions get rewritten to read/write against the bucket instead of `node:fs`, behind the same function signatures — nothing else in the ingestion pipeline needs to change.

## 2. Extraction provider — the real cost is trivial; the real gap is tooling

`lib/book-vision-benchmark.ts` already has working, tested integrations for **four** providers: Gemini Vision, GPT-4o Vision, Mathpix OCR, and Mistral OCR. But the admin benchmark route (`admin/books/[id]/ingestions/[runId]/benchmarks/route.ts`) only wires up two of them (Gemini, Mathpix), and — more importantly — it benchmarks **one page, one provider, per click**. There's no batch runner. Running a real 100-page shadow comparison today means ~100–400 manual button presses in the admin UI.

Actual per-page costs, from each provider's current pricing page:

| Provider | Price | 100-page cost |
|---|---|---|
| Mathpix OCR | $0.002/image | $0.20 |
| Mistral OCR | $4/1,000 pages | $0.40 |
| Gemini 2.5 Flash | $0.30/1M input tokens; a typical page tiles to ~3 tiles (~774 tokens) | roughly $0.05–$0.15 |
| GPT-4o Vision | token-metered, no flat per-page rate published | roughly $2–$5 (this is the rough one — OpenAI doesn't publish a flat per-image rate, this is estimated from typical high-detail tiling) |

Even running **all four** providers across 100 pages tops out around **$5–$8 total**. This was the thing I most wanted to correct from my original read of this as "needs approval" — the money is not the blocker. The missing batch-runner is.

## What I need from you

1. **Storage provider**: Supabase Storage (my recommendation), Cloudflare R2, or something else you already use elsewhere?
2. **Shadow-run scope**: which providers should the comparison include — just Gemini + Mathpix (cheapest, already wired into the admin route), or all four?
3. **Go-ahead**: OK to spend the ~$5–$8 in API costs from your own provider accounts to run the comparison?
4. Once 1–3 are settled, I'll build the storage-adapter rewrite and a batch-runner (loop through N pages × chosen providers, store results, produce a side-by-side accuracy/cost/latency summary) so this becomes a real decision backed by data on an actual chapter, not a guess.
