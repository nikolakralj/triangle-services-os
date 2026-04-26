import google from 'googlethis';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

// Load .env.local if present (rudimentary parser for testing)
const envPath = path.resolve('.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  });
}

const IMPORT_API_SECRET = process.env.IMPORT_API_SECRET || "supersecret123";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:3000/api/import/external-leads";

const SEARCH_QUERIES = [
  "MEP contractor data center Europe",
  "electrical installation company Austria",
];

async function fetchWebsiteText(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(10000) // 10s timeout
    });
    if (!response.ok) return null;
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Remove scripts, styles, etc.
    $('script, style, noscript, nav, footer, header').remove();
    
    // Extract remaining text
    let text = $('body').text();
    text = text.replace(/\s+/g, ' ').trim(); // squash whitespace
    
    // Limit to first 15000 characters to save tokens/bandwidth
    return text.substring(0, 15000);
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error.message);
    return null;
  }
}

async function runScraper() {
  console.log("🚀 Starting Lead Gathering Agent...");
  
  const leads = [];

  for (const query of SEARCH_QUERIES) {
    console.log(`\n🔍 Searching Google for: "${query}"`);
    try {
      const options = {
        page: 0, 
        safe: false, 
        additional_params: { hl: 'en' }
      };
      const response = await google.search(query, options);
      
      console.log(`Found ${response.results.length} results.`);
      
      // Take top 5 results per query
      const topResults = response.results.slice(0, 5);
      
      for (const result of topResults) {
        console.log(`🌐 Visiting: ${result.url}`);
        const websiteText = await fetchWebsiteText(result.url);
        
        if (websiteText && websiteText.length > 200) {
          leads.push({
            source_url: result.url,
            source_query: query,
            title: result.title,
            snippet: result.description,
            website_text: websiteText
          });
          console.log(`✅ Extracted ${websiteText.length} characters.`);
        } else {
          console.log(`❌ Skipped (too short or inaccessible).`);
        }
        
        // Polite delay
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (err) {
      console.error(`Search failed for "${query}":`, err.message);
    }
  }

  if (leads.length === 0) {
    console.log("No leads gathered. Exiting.");
    return;
  }

  console.log(`\n📤 Sending ${leads.length} leads to CRM (${WEBHOOK_URL})...`);
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-import-api-secret": IMPORT_API_SECRET
      },
      body: JSON.stringify({
        source_name: "Google Scraper Agent",
        items: leads
      })
    });
    
    const result = await res.json();
    if (res.ok) {
      console.log("🎉 Successfully pushed leads to CRM:", result.message);
    } else {
      console.error("❌ Failed to push leads:", result);
    }
  } catch (err) {
    console.error("Webhook submission failed:", err.message);
  }
}

runScraper();
