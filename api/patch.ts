// Vercel Serverless Runtime Compatibility Patch for Read-only Filesystem
if (process.env.VERCEL) {
  process.cwd = () => "/tmp";
  console.log(`[VERCEL COMPATIBILITY] Patched process.cwd to return "/tmp" for writeable filesystem access.`);
}
