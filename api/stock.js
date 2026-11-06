// Vercel serverless function: fetches the AePDS Kerala Scheme Wise Stock Register
// for one ARD and returns it as tab-separated plain text lines (one table row per line),
// along with the ARD dealer / licensee name.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const BASE = "https://epos.kerala.gov.in";
const UA = "Mozilla/5.0 (Linux; Android 13; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

function clean(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function tableToLines(html) {
  const lines = [];
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const r of rows) {
    const cells = [];
    const re = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = re.exec(r))) {
      cells.push(clean(m[2]));
    }
    // Only keep rows that have at least one non-empty cell
    if (cells.some((c) => c.length > 0)) {
      lines.push(cells.join("\t"));
    }
  }
  return lines;
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const q = req.query || {};
    const num = (v, d) => (/^\d{1,12}$/.test(String(v || "").trim()) ? String(v).trim() : d);
    const dist = num(q.dist, "");
    const tso = num(q.tso, "");
    const ard = num(q.ard, "");
    const month = num(q.month, "");
    const year = num(q.year, "");

    if (!dist || !tso || !ard || !month || !year) {
      return res.status(400).json({ error: "dist, tso, ard, month, year are required numbers" });
    }

    // 1) Fetch session cookie and attempt to get ARD dealer name from Stock_Register_Interface.jsp
    let cookie = "";
    let dealerName = "";
    try {
      const controller0 = new AbortController();
      const t0 = setTimeout(() => controller0.abort(), 10000);
      const url0 = `${BASE}/Stock_Register_Interface.jsp?dist_code=${dist}&office_code=${tso}`;
      const r0 = await fetch(url0, {
        headers: { "User-Agent": UA },
        signal: controller0.signal,
      });
      clearTimeout(t0);

        if (typeof r0.headers.getSetCookie === "function") {
          const sc = r0.headers.getSetCookie();
          cookie = sc.map((c) => c.split(";")[0]).join("; ");
        } else if (r0.headers.get("set-cookie")) {
          cookie = r0.headers.get("set-cookie").split(";")[0];
        }

        const html0 = await r0.text();
        // Dropdown option pattern: e.g. <option value="2367097">2367097 (ManojkumarC)</option>
        const nameRe = new RegExp(`${ard}\\s*\\(([^)]+)\\)`, "i");
        const nm0 = html0.match(nameRe);
        if (nm0 && nm0[1]) {
          dealerName = nm0[1].trim();
        }
      } catch (e) {
        // Proceed even if initial fetch encounters issue
      }

    // 2) POST request to fetch Scheme Wise Stock Register
    const body = new URLSearchParams({
      dist_code: dist,
      fps_id: ard,
      month: String(month),
      year: String(year),
      office_code: tso,
    }).toString();

    const controller1 = new AbortController();
    const t1 = setTimeout(() => controller1.abort(), 20000);

    const r = await fetch(BASE + "/fps_stock_register.action", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": BASE + "/Stock_Register_Interface.jsp",
        "User-Agent": UA,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
      signal: controller1.signal,
    });
    clearTimeout(t1);

    const html = await r.text();
    if (!r.ok) {
      return res.status(502).json({ error: "Portal error: HTTP " + r.status });
    }

        // If dealerName wasn't in interface page, check stock register html
        if (!dealerName) {
          const match1 = html.match(new RegExp(`${ard}\\s*\\(([^)]+)\\)`, "i"));
          if (match1 && match1[1]) {
            dealerName = match1[1].trim();
          } else {
            const match2 = html.match(/Dealer\s*Name\s*[:\t-]\s*([^\n<]+)/i) ||
              html.match(new RegExp(`${ard}\\s*[-–]\\s*([A-Za-z\\s\\.]{3,35})[\\n<]`, "i"));
            if (match2 && match2[1]) {
              dealerName = clean(match2[1]);
            }
          }
        }

        const lines = tableToLines(html);
        if (lines.length < 2) {
          if (/no\s*record/i.test(html)) {
            return res.status(404).json({ error: "ഈ ARD നമ്പറിന് ഈ മാസത്തിൽ സ്റ്റോക്ക് റെക്കോർഡുകൾ ലഭ്യമല്ല (No records found)" });
          }
          return res.status(502).json({ error: "പോർട്ടൽ പേജിൽ നിന്ന് ടേബിൾ വിവരങ്ങൾ വായിക്കാൻ കഴിഞ്ഞില്ല" });
        }

        res.setHeader("Cache-Control", "no-store");
        return res.status(200).json({
          fetchedAt: new Date().toISOString(),
          text: lines.join("\n"),
          dealerName: dealerName || "",
          ard: ard,
          dist: dist,
          tso: tso,
        });
      } catch (e) {
        const isTimeout = e && (e.name === "AbortError" || /abort|timeout/i.test(e.message));
        return res.status(500).json({
          error: isTimeout ? "പോർട്ടൽ പ്രതികരിക്കാൻ കൂടുതൽ സമയമെടുത്തു (Timeout). വീണ്ടും ശ്രമിക്കുക." : String(e && e.message || e),
        });
      }
  };

  module.exports.tableToLines = tableToLines;
