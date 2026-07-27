const fs = require('fs');
let c = fs.readFileSync('src/AdminDashboard.tsx', 'utf8');

// 1. Delete duplicated section
const dupStart = c.indexOf('// ─── Customers Page ───────────────────────────────────────────────────────────');
const dupEnd = c.indexOf('// ─── Customers Page ───────────────────────────────────────────────────────────', dupStart + 1);
if (dupStart !== -1 && dupEnd !== -1) {
    c = c.substring(0, dupStart) + c.substring(dupEnd);
}

// 2. Fix wizStep === 'packages' broken map and JSX
const brokenPackageStart = c.indexOf('{/* Step: Pac');
const seatGridStr = '{/* Seat grid for this package */}';
const brokenPackageEnd = c.indexOf(seatGridStr, brokenPackageStart);

if (brokenPackageStart !== -1 && brokenPackageEnd !== -1) {
    const fixedPackages = `      {/* Step: Packages */}
      {wizStep === 'packages' && (
        <div className="space-y-6" style={{ animation: 'fade-in-up 0.25s ease' }}>
          {form.packages.map((pkg, pkgIdx) => (
            <div key={pkgIdx} className="rounded-2xl p-5 space-y-4" style={{ background: T.cardSolid, border: \`1px solid \${T.cardBorder}\` }}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>Package {pkgIdx + 1}</div>
                <button type="button" onClick={() => setPkgs(prev => prev.map((p,i) => i===pkgIdx ? {...p, [key.toLowerCase()]: e.target.value} : p))} className="text-xs" style={{ color: T.red }}>Remove</button>
              </div>
              <div className="space-y-3">
                {['Name','Description'].map(key => (
                  <div key={key}>
                    <label className="text-xs font-mono uppercase tracking-wider block mb-1" style={{ color: T.textMuted }}>{key}</label>
                    <input className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: T.inputBg, border: \`1px solid \${T.border}\`, color: T.text }}
                      placeholder={key} value={(pkg as any)[key.toLowerCase()]} onChange={e => setPkgs(prev => prev.map((p,i) => i===pkgIdx ? {...p, [key.toLowerCase()]: e.target.value} : p))}/>
                  </div>
                ))}
              </div>
              <div className="space-y-3 mt-4">
                {['Price','Capacity'].map(key => (
                  <div key={key}>
                    <label className="text-xs font-mono uppercase tracking-wider block mb-1" style={{ color: T.textMuted }}>{key}</label>
                    <input className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: T.inputBg, border: \`1px solid \${T.border}\`, color: T.text }}
                      type="number" value={(pkg as any)[key.toLowerCase()]} onChange={e => setPkgs(prev => prev.map((p,i) => i===pkgIdx ? {...p, [key.toLowerCase()]: parseInt(e.target.value)||0} : p))}/>
                  </div>
                ))}
              </div>
              `;
    c = c.substring(0, brokenPackageStart) + fixedPackages + c.substring(brokenPackageEnd);
}

// 3. Fix PayPal details
const renderPayIconStr = `  const renderPayIcon = (method: string) => {
    const url = getPaymentIcon(method === 'crypto' ? 'cryptocurrency' : method);
    if (url) return <img src={url} alt={method} className="w-8 h-8 object-contain" />;
    return <span className="text-3xl">{payIcon[method] || '💳'}</span>;`;

const missingPaypalStr = `  }

        {/* PayPal */}
        <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: \`1px solid \${T.cardBorder}\` }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'rgba(59,130,246,0.15)' }}>🅿️</div>
            <div>
              <div className="font-semibold text-sm" style={{ color: T.text }}>PayPal</div>
              <div className="text-xs" style={{ color: T.textMuted }}>Your PayPal email for receiving payments</div>
            </div>
          </div>
          <label className="text-xs font-mono uppercase tracking-wider block mb-2" style={{ color: T.textMuted }}>PayPal Email</label>
          <input className="w-full px-4 py-3 rounded-xl text-sm outline-none mb-3" style={{ background: T.inputBg, border: \`1px solid \${T.border}\`, color: T.text }}
            placeholder="you@example.com" value={payDetails.paypal} onChange={e => setPayDetails(d => ({ ...d, paypal: e.target.value }))}/>`;

const searchIdx = c.indexOf(renderPayIconStr);
if (searchIdx !== -1) {
    const paypalButtonStr = `<button onClick={() => show('PayPal details saved!')} className="w-full py-2.5 rounded-xl text-sm font-bold" style={{ background: 'linear-gradient(135deg,#00FF88,#00C866)', color: '#09090B' }}>Save PayPal Details</button>`;
    const paypalButtonIdx = c.indexOf(paypalButtonStr, searchIdx);
    if (paypalButtonIdx !== -1) {
        c = c.substring(0, searchIdx + renderPayIconStr.length) + '\n' + missingPaypalStr + '\n          ' + c.substring(paypalButtonIdx);
    }
}

fs.writeFileSync('src/AdminDashboard.tsx', c);
