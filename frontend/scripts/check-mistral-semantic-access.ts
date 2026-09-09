import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });
config({ quiet: true });

async function main() {
  if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY is not configured');
  const response = await fetch('https://api.mistral.ai/v1/models', {
    headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Mistral ${response.status}: ${body?.message || response.statusText}`);
  const ids = Array.isArray(body?.data) ? body.data.map((item: any) => String(item.id)) : [];
  const requested = process.env.QB_MISTRAL_SEMANTIC_MODEL || 'mistral-large-latest';
  console.log(JSON.stringify({ authenticated: true, requestedModel: requested, modelAvailable: ids.includes(requested), accessibleModelCount: ids.length }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
