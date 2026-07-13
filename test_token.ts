const token = process.env.METAAPI_API_TOKEN || "";
console.log("=== TOKEN DETAILED CHECK ===");
console.log("Length:", token.length);
console.log("Contains newline (\\n):", token.includes("\n"));
console.log("Contains carriage return (\\r):", token.includes("\r"));
console.log("Contains spaces:", token.includes(" "));
console.log("Starts with non-alphanumeric:", /^[^a-zA-Z0-9]/.test(token));
console.log("Ends with non-alphanumeric:", /[^a-zA-Z0-9]$/.test(token));
if (token.length > 0) {
  console.log("First 10 chars:", JSON.stringify(token.slice(0, 10)));
  console.log("Last 10 chars:", JSON.stringify(token.slice(-10)));
}
