// Vercel Serverless Runtime Compatibility Patch for Read-only Filesystem
try {
  if (process.env.VERCEL) {
    console.log(`[VERCEL COMPATIBILITY] Running on Vercel. MemoryHistoryStorage is enabled, process.cwd patch is not required.`);
  }
} catch (err: any) {
  console.error(`[VERCEL COMPATIBILITY ERROR] Failed:`, err.message || err);
}

