const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, 'src/app/page.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

// 1. Add "reports" to view useState
content = content.replace(
  /useState<"student" \| "security" \| "outside" \| "log">/,
  'useState<"student" | "security" | "outside" | "log" | "reports">'
);

// 2. Add reports state and types
content = content.replace(
  /const \[requests, setRequests\] = useState<GateRequest\[\]>\(\[\]\);/,
  'const [requests, setRequests] = useState<GateRequest[]>([]);\n  const [reports, setReports] = useState<any[]>([]);\n  const [reportCat, setReportCat] = useState("cleanliness");\n  const [reportDesc, setReportDesc] = useState("");'
);

// 3. Add fetchReports to load()
if (content.includes('const [reqsRes] = await Promise.all([')) {
    // they use Promise.all for fetching, maybe?
} else {
    // let's just find where they setRequests and put setReports there too.
}

content = content.replace(
  /const res = await fetch\("\/api\/requests"\);/,
  'const res = await fetch("/api/requests");\n      const repRes = await fetch("/api/reports");\n      if (repRes.ok) {\n        const repData = await repRes.json();\n        setReports(repData.reports || []);\n      }'
);

// 4. Add the Reports button in the nav
content = content.replace(
  /onClick=\{\(\) => setView\("log"\)\}\s*className=\{`px-4 py-2 text-sm font-medium transition-colors \$\{view === "log"/g,
  `onClick={() => setView("log")} className={\`px-4 py-2 text-sm font-medium transition-colors \${view === "log"\n` // just replacing the matched text, wait, better to use a specific match.
);

// Let's do a safer nav replace:
content = content.replace(
  /(<button[^>]*onClick=\{\(\) => setView\("log"\)\}[^>]*>[\s\S]*?<\/button>)/,
  `$1\n            <button\n              onClick={() => setView("reports")}\n              className={\`px-4 py-2 text-sm font-medium transition-colors \${view === "reports" ? "border-b-2 border-[#7B1113] text-[#7B1113]" : "text-[#5b6b7c] hover:text-[#0c1222]"}\`}\n            >\n              Reports\n            </button>`
);

// 5. Add the Reports view rendering
const reportsViewCode = `
      {view === "reports" && (
        <div className="space-y-6 animate-fade-in pb-20">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
            <h2 className="text-lg font-bold text-[#0c1222]">Cleanliness & Maintenance</h2>
            
            {(!user?.isAdmin || user?.adminScope === "all") && (
              <form onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                try {
                  const res = await fetch("/api/reports", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ category: reportCat, description: reportDesc, room, hostel: hostelPick || "KCA1" })
                  });
                  if (res.ok) {
                    setToast("Report submitted successfully");
                    setReportDesc("");
                    // refresh
                    const repRes = await fetch("/api/reports");
                    if(repRes.ok) setReports((await repRes.json()).reports);
                  } else {
                    const err = await res.json();
                    setToast(err.error || "Failed to submit report");
                  }
                } catch(e) {
                  setToast("Error submitting report");
                }
                setLoading(false);
              }} className="space-y-4 border-b pb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#5b6b7c] mb-1">Category</label>
                    <select value={reportCat} onChange={e => setReportCat(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
                      <option value="cleanliness">Cleanliness</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#5b6b7c] mb-1">Room (e.g. 101)</label>
                    <input type="text" required value={room} onChange={e => setRoom(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#5b6b7c] mb-1">Description</label>
                  <textarea required value={reportDesc} onChange={e => setReportDesc(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl h-24" placeholder="Describe the issue..."></textarea>
                </div>
                <button disabled={loading} type="submit" className="w-full py-3 bg-[#7B1113] text-white font-semibold rounded-xl hover:bg-[#6A0E10] transition-colors disabled:opacity-50">
                  {loading ? "Submitting..." : "Submit Report"}
                </button>
              </form>
            )}

            <div className="space-y-4 pt-4">
              <h3 className="font-semibold text-gray-700">Existing Reports</h3>
              {reports.length === 0 ? (
                <p className="text-sm text-gray-500">No reports found.</p>
              ) : (
                reports.map(r => (
                  <div key={r.id} className="p-4 border border-gray-100 rounded-xl bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{r.category.toUpperCase()}</span>
                        <span className={\`text-xs px-2 py-1 rounded-full \${r.status === 'open' ? 'bg-red-100 text-red-700' : r.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}\`}>
                          {r.status}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{r.description}</p>
                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span>Room {r.room} ({r.hostel}) - {r.reportedByName}</span>
                      {user?.isAdmin && (
                        <div className="flex gap-2">
                          <button onClick={async () => {
                             const res = await fetch("/api/reports", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ action: "update_status", id: r.id, status: "in_progress" }) });
                             if(res.ok) { const repRes = await fetch("/api/reports"); if(repRes.ok) setReports((await repRes.json()).reports); }
                          }} className="text-blue-600 underline">In Progress</button>
                          <button onClick={async () => {
                             const res = await fetch("/api/reports", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ action: "update_status", id: r.id, status: "resolved" }) });
                             if(res.ok) { const repRes = await fetch("/api/reports"); if(repRes.ok) setReports((await repRes.json()).reports); }
                          }} className="text-green-600 underline">Resolve</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
`;

content = content.replace(
  /\{view === "log" && \([\s\S]*?<\/div>\s*\)\s*\}/,
  match => match + '\n' + reportsViewCode
);

fs.writeFileSync(pagePath, content);
console.log("Patched page.tsx");

