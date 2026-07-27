const fs = require('fs');
let c = fs.readFileSync('scratch.txt', 'utf8');

// 1. Delete duplicated section
const dupStart = c.indexOf('// ─── Customers Page ───────────────────────────────────────────────────────────');
const dupEnd = c.indexOf('// ─── Customers Page ───────────────────────────────────────────────────────────', dupStart + 1);
if (dupStart !== -1 && dupEnd !== -1) {
    c = c.substring(0, dupStart) + c.substring(dupEnd);
}

// 2. Fix wizStep === 'packages' broken map and JSX
const brokenPackageStart = c.indexOf('{/* Step: Pac');
const paymentsStr = '{wizStep === \'payments\' && <div className="rounded-2xl p-6 space-y-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}><div><div className="text-xs font-mono uppercase tracking-wider" style={{color:T.textMuted}}>Payment Methods</div>';
const firstPayments = c.indexOf(paymentsStr, brokenPackageStart);
const secondPayments = c.indexOf(paymentsStr, firstPayments + 1);

const brokenPackageEnd = secondPayments;

if (brokenPackageStart !== -1 && brokenPackageEnd !== -1) {
    const fixedPackages = `      {/* Step: Packages */}
      {wizStep === 'packages' && (
        <div className="space-y-6" style={{ animation: 'fade-in-up 0.25s ease' }}>
          {form.packages.map((pkg, pkgIdx) => (
            <div key={pkgIdx} className="rounded-2xl p-5 space-y-4" style={{ background: T.cardSolid, border: \`1px solid \${T.cardBorder}\` }}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>Package {pkgIdx + 1}</div>
                <button type="button" onClick={() => setForm(prev => ({...prev, packages: prev.packages.filter((_, i) => i !== pkgIdx)}))} className="text-xs" style={{ color: T.red }}>Remove</button>
              </div>
              <div className="space-y-3">
                {['Name','Description'].map(key => (
                  <div key={key}>
                    <label className="text-xs font-mono uppercase tracking-wider block mb-1" style={{ color: T.textMuted }}>{key}</label>
                    <input className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: T.inputBg, border: \`1px solid \${T.border}\`, color: T.text }}
                      placeholder={key} value={(pkg as any)[key.toLowerCase()]} onChange={e => setForm(prev => ({...prev, packages: prev.packages.map((p,i) => i===pkgIdx ? {...p, [key.toLowerCase()]: e.target.value} : p)}))}/>
                  </div>
                ))}
              </div>
              <div className="space-y-3 mt-4">
                {['Price','Capacity'].map(key => (
                  <div key={key}>
                    <label className="text-xs font-mono uppercase tracking-wider block mb-1" style={{ color: T.textMuted }}>{key}</label>
                    <input className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: T.inputBg, border: \`1px solid \${T.border}\`, color: T.text }}
                      type="number" value={(pkg as any)[key.toLowerCase()]} onChange={e => setForm(prev => ({...prev, packages: prev.packages.map((p,i) => i===pkgIdx ? {...p, [key.toLowerCase()]: parseInt(e.target.value)||0} : p)}))}/>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: T.textMuted }}>Mark Taken Seats — Seats {pkg.posFrom}–{pkg.posTo}</div>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {Array.from({ length: pkg.posTo - pkg.posFrom + 1 }, (_, i) => pkg.posFrom + i).map(n => {
                    const isTaken = pkg.taken.includes(n);
                    return (
                      <button type="button" key={n} onClick={() => toggleSeatTaken(pkgIdx, n)}
                        className="w-10 h-9 rounded-lg text-[10px] font-mono transition-all"
                        style={{ background: isTaken ? 'rgba(239,68,68,0.2)' : T.bg3, border: \`1px solid \${isTaken ? '#EF4444' : T.border}\`, color: isTaken ? '#EF4444' : T.textMuted }}>
                        {String(n).padStart(3,'0')}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
          <div className="flex gap-3">
            <button type="button" onClick={() => setWizStep('info')} className="px-6 py-3 rounded-2xl text-sm" style={{ background: T.inputBg, color: T.textSub }}>← Back</button>
            <button type="button" onClick={() => setWizStep('payments')} className="px-8 py-3 rounded-2xl font-bold text-sm" style={{ background: 'linear-gradient(135deg,#00FF88,#00C866)', color: '#09090B' }}>
              Continue to Payments →
            </button>
          </div>
        </div>
      )}
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
