const port = String(process.env.PORT || '3000').trim();
const secret = String(process.env.WHATSAPP_JOB_SECRET || '').trim();
const intervalMs = 60_000;
const initialDelayMs = 15_000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWhatsappJobs() {
  if (secret.length < 24) return;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/whatsapp/jobs`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
    });
    if (!response.ok) {
      console.error('[whatsapp-worker] job failed', { status: response.status });
    }
  } catch (error) {
    console.error('[whatsapp-worker] request failed', { type: error instanceof Error ? error.name : 'Unknown' });
  }
}

if (secret.length < 24) {
  console.warn('[whatsapp-worker] WHATSAPP_JOB_SECRET ausente; lembretes periódicos desativados.');
} else {
  await wait(initialDelayMs);
  await runWhatsappJobs();
  setInterval(runWhatsappJobs, intervalMs);
}
