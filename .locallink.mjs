import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env=Object.fromEntries(fs.readFileSync(".env.local","utf8").split(/\r?\n/).filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>[l.slice(0,l.indexOf("=")).trim(),l.slice(l.indexOf("=")+1).trim()]));
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const target = process.argv[2];
const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink", email: "nikola.kralj86@gmail.com",
  options: { redirectTo: target },
});
if (error) { console.error("generateLink FAILED:", error.message); process.exit(1); }
const b = await chromium.launch();
const page = await (await b.newContext()).newPage();
const errs=[]; page.on("pageerror",e=>errs.push(e.message));
await page.goto(data.properties.action_link, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(4000);
const t = await page.locator("body").innerText();
const url = page.url();
console.log("landed on:", url.split("#")[0]);
console.log("token left in URL:", url.includes("access_token") ? "YES (bad)" : "no");
console.log("SIGNED IN:", (!url.includes("/login") && /Decision Inbox|Signal Inbox|nikola\.kralj86/.test(t)) ? "YES" : "NO");
console.log("first lines:", t.split("\n").filter(Boolean).slice(0,5).join(" | "));
if (errs.length) console.log("page errors:", errs.slice(0,2).join(" | "));
await b.close();
