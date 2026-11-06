// Vercel serverless function: fetches the AePDS Kerala Scheme Wise Stock Register
// and the licensee name for ANY 7-digit ARD across all 14 districts in Kerala.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const BASE = "https://epos.kerala.gov.in";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36";

const DISTRICTS = {
  "11": "Thiruvananthapuram",
  "12": "Kollam",
  "13": "Pathanamthitta",
  "14": "Alappuzha",
  "15": "Kottayam",
  "16": "Idukki",
  "17": "Ernakulam",
  "18": "Thrissur",
  "19": "Palakkad",
  "20": "Malappuram",
  "21": "Kozhikode",
  "22": "Wayanad",
  "23": "Kannur",
  "24": "Kasaragod"
};

const TSOS = {
  // Kannur (23)
  "2365": "Kannur",
  "2366": "Taliparamba",
  "2367": "Thalassery",
  "2368": "Iritty",
  "2369": "Payyannur",

  // Kasaragod (24)
  "2470": "Kasaragod",
  "2471": "Hosdurg",
  "2472": "Manjeshwaram",
  "2473": "Vellarikundu",

  // Wayanad (22)
  "2262": "Mananthavady",
  "2263": "Sulthan Bathery",
  "2264": "Vythiri",

  // Kozhikode (21)
  "2157": "Kozhikode City",
  "2158": "Kozhikode South",
  "2159": "Kozhikode North",
  "2160": "Quilandy",
  "2161": "Vadakara",
  "2162": "Thamarassery",

  // Malappuram (20)
  "2050": "Eranad",
  "2051": "Nilambur",
  "2052": "Perinthalmanna",
  "2053": "Tirur",
  "2054": "Tirurangadi",
  "2055": "Ponnani",
  "2056": "Kondotty",

  // Palakkad (19)
  "1945": "Palakkad",
  "1946": "Alathur",
  "1947": "Chittur",
  "1948": "Ottapalam",
  "1949": "Mannarkkad",
  "1950": "Pattambi",

  // Thrissur (18)
  "1839": "Thrissur",
  "1840": "Thalappilly",
  "1841": "Chavakkad",
  "1842": "Mukundapuram",
  "1843": "Kodungallur",
  "1844": "Chalakudy",

  // Ernakulam (17)
  "1731": "Kanayannur",
  "1732": "Kochi",
  "1733": "Aluva",
  "1734": "Paravur",
  "1735": "Kunnathunad",
  "1736": "Muvattupuzha",
  "1737": "Kothamangalam",

  // Idukki (16)
  "1626": "Devikulam",
  "1627": "Udumbanchola",
  "1628": "Thodupuzha",
  "1629": "Peerumedu",
  "1630": "Idukki",

  // Kottayam (15)
  "1521": "Kottayam",
  "1522": "Vaikom",
  "1523": "Meenachil",
  "1524": "Kanjirappally",
  "1525": "Changanassery",

  // Alappuzha (14)
  "1416": "Ambalappuzha",
  "1417": "Cherthala",
  "1418": "Kuttanad",
  "1419": "Karthikappally",
  "1420": "Mavelikkara",
  "1421": "Chengannur",

  // Pathanamthitta (13)
  "1311": "Kozhencherry",
  "1312": "Adoor",
  "1313": "Ranni",
  "1314": "Mallappally",
  "1315": "Konni",
  "1316": "Thiruvalla",

  // Kollam (12)
  "1206": "Kollam",
  "1207": "Karunagappally",
  "1208": "Kunnathur",
  "1209": "Kottarakkara",
  "1210": "Pathanapuram",
  "1211": "Punalur",

  // Thiruvananthapuram (11)
  "1101": "Thiruvananthapuram City",
  "1102": "Thiruvananthapuram South",
  "1103": "Thiruvananthapuram North",
  "1104": "Neyyattinkara",
  "1105": "Nedumangad",
  "1106": "Chirayinkeezhu",
  "1107": "Varkala",
  "1108": "Kattakada"
};

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

function formatDealerName(raw) {
  if (!raw) return "";
  let s = clean(raw);
  if (/district|tso|month|year|fps|stock|select/i.test(s)) return "";
  // Split camelCase e.g. ManojkumarC -> Manojkumar C
  s = s.replace(/([a-z])([A-Z])$/, "$1 $2");
  s = s.replace(/([a-z])([A-Z]{2})$/, "$1 $2");
  return s.trim();
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
    if (cells.some((c) => c.length > 0)) {
      lines.push(cells.join("\t"));
    }
  }
  return lines;
}

module.exports = async (req, res) => {
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

    let districtName = DISTRICTS[dist] || "";
    let tsoName = TSOS[dist + tso] || "";

    // 1) Fetch Licensee Name from AjaxExecution.jsp (returns all FPS for this TSO)
    // 2) POST to fps_stock_register.action (returns Scheme Wise Stock Register)
    // Run both in parallel for speed
    const fetchDealerPromise = (async () => {
      try {
        const cF = new AbortController();
        const tF = setTimeout(() => cF.abort(), 6000);
        const rF = await fetch(`${BASE}/AjaxExecution.jsp?select=true&type=fps&param=${tso}`, {
          headers: { "User-Agent": UA },
          signal: cF.signal,
        });
        clearTimeout(tF);
        if (rF.ok) {
          const htmlF = await rF.text();
          // Matches: <option value="2367097">2367097\n\t(ManojkumarC)\n</option>
          const nameRe = new RegExp(`${ard}[^<]*?\\(([^)]+)\\)`, "i");
          const nm = htmlF.match(nameRe);
          if (nm && nm[1]) {
            return formatDealerName(nm[1]);
          }
        }
      } catch (e) { }
      return "";
    })();

    const fetchStockPromise = (async () => {
      const body = new URLSearchParams({
        dist_code: dist,
        fps_id: ard,
        month: String(month),
        year: String(year),
        office_code: tso,
      }).toString();

      const cS = new AbortController();
      const tS = setTimeout(() => cS.abort(), 16000);
      const rS = await fetch(`${BASE}/fps_stock_register.action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "Referer": `${BASE}/Stock_Register_Interface.jsp`,
          "User-Agent": UA,
        },
        body,
        signal: cS.signal,
      });
      clearTimeout(tS);
      if (!rS.ok) {
        throw new Error("Portal error: HTTP " + rS.status);
      }
      return await rS.text();
    })();

    const [dealerFromAjax, stockHtml] = await Promise.all([fetchDealerPromise, fetchStockPromise]);

    let dealerName = dealerFromAjax;

    // Fallback if not found in AjaxExecution dropdown
    if (!dealerName) {
      const match1 = stockHtml.match(new RegExp(`${ard}\\s*\\(([^)]+)\\)`, "i"));
      if (match1 && match1[1]) {
        dealerName = formatDealerName(match1[1]);
      }
    }

    const lines = tableToLines(stockHtml);
    if (lines.length < 2) {
      if (/no\s*record/i.test(stockHtml)) {
        return res.status(404).json({ error: "ഈ ARD നമ്പറിന് ഈ മാസത്തിൽ സ്റ്റോക്ക് റെക്കോർഡുകൾ ലഭ്യമല്ല (No records found)" });
      }
      return res.status(502).json({ error: "പോർട്ടൽ പേജിൽ നിന്ന് ടേബിൾ വിവരങ്ങൾ വായിക്കാൻ കഴിഞ്ഞില്ല" });
    }

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    return res.status(200).json({
      fetchedAt: new Date().toISOString(),
      text: lines.join("\n"),
      dealerName: dealerName || "",
      districtName: districtName || "",
      tsoName: tsoName || "",
      distTsoText: `District: ${districtName || dist} / TSO: ${tsoName || tso}`,
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
