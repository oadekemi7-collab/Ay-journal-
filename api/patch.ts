// Vercel Serverless Runtime Compatibility Patch for Read-only Filesystem
try {
  if (process.env.VERCEL) {
    process.cwd = () => "/tmp";
    console.log(`[VERCEL COMPATIBILITY] Patched process.cwd to return "/tmp" for writeable filesystem access.`);
  }
} catch (err: any) {
  console.error(`[VERCEL COMPATIBILITY ERROR] Failed to apply process.cwd patch:`, err.message || err);
}

