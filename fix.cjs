const fs = require('fs');
let c = fs.readFileSync('src/AdminDashboard.tsx', 'utf-8');
const search = `        {/* Bitcoin */}
        <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: \`1px solid \${T.cardBorder}\` }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'rgba(245,158,11,0.15)' }}>₿</div>
            <div>
              <div className="font-semibold text-sm" style={{ color: T.text }}>Bitcoin</div>
              <div className="text-xs" style={{ color: T.textMuted }}>Your BTC wallet address for payments</div>
            </div>
          </div>
          <label className="text-xs font-mono uppercase tracking-wider block mb-2" style={{ color: T.textMuted }}>Bitcoin Wallet Address</label>
          <input className="w-full px-4 py-3 rounded-xl text-sm font-mono outline-none mb-3" style={{ background: T.inputBg, border: \`1px solid \${T.border}\`, color: T.text }}
            placeholder="bc1q..." value={payDetails.bitcoin} onChange={e => setPayDetails(d => ({ ...d, bitcoin: e.target.value }))}/>
          <button onClick={() => show('Bitcoin address saved!')} className="w-full py-2.5 rounded-xl text-sm font-bold" style={{ background: 'linear-gradient(135deg,#00FF88,#00C866)', color: '#09090B' }}>Save Bitcoin Address</button>
        </div>`;

const replace = `        {/* Cryptocurrency Manager */}
        <div className="rounded-2xl p-5 lg:col-span-2" style={{ background: T.cardSolid, border: \`1px solid \${T.cardBorder}\` }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'rgba(245,158,11,0.15)' }}>
              {renderPayIcon('cryptocurrency')}
            </div>
            <div>
              <div className="font-semibold text-sm" style={{ color: T.text }}>Cryptocurrency Manager</div>
              <div className="text-xs" style={{ color: T.textMuted }}>Manage supported cryptocurrencies and wallet addresses globally</div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {getSupportedCryptocurrencies().map(coin => {
              const cConfig = payDetails.cryptocurrencies?.[coin.id] || { enabled: false, address: '', network: '' }
              return (
                <div key={coin.id} className="rounded-xl p-4" style={{ background: T.bg3, border: \`1px solid \${T.border}\` }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <img src={coin.icon} alt={coin.name} className="w-6 h-6 object-contain" />
                      <span className="text-sm font-semibold text-white">{coin.name} <span style={{ color: T.textMuted }}>{coin.symbol}</span></span>
                    </div>
                    <label className="flex items-center gap-2 text-xs" style={{ color: T.textMuted }}>
                      Enabled
                      <input type="checkbox" checked={cConfig.enabled} onChange={e => {
                        setPayDetails(d => ({ ...d, cryptocurrencies: { ...(d.cryptocurrencies || {}), [coin.id]: { ...cConfig, enabled: e.target.checked } } }))
                      }} />
                    </label>
                  </div>
                  {cConfig.enabled && (
                    <div className="space-y-2">
                      <input className="w-full px-3 py-2 rounded-xl text-xs font-mono outline-none" style={{ background: T.inputBg, border: \`1px solid \${T.border}\`, color: T.text }}
                        placeholder="Wallet Address" value={cConfig.address} onChange={e => setPayDetails(d => ({ ...d, cryptocurrencies: { ...(d.cryptocurrencies || {}), [coin.id]: { ...cConfig, address: e.target.value } } }))} />
                      <input className="w-full px-3 py-2 rounded-xl text-xs outline-none" style={{ background: T.inputBg, border: \`1px solid \${T.border}\`, color: T.text }}
                        placeholder="Network (e.g. ERC20)" value={cConfig.network} onChange={e => setPayDetails(d => ({ ...d, cryptocurrencies: { ...(d.cryptocurrencies || {}), [coin.id]: { ...cConfig, network: e.target.value } } }))} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <button onClick={() => show('Cryptocurrency settings saved!')} className="w-full mt-4 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'linear-gradient(135deg,#00FF88,#00C866)', color: '#09090B' }}>Save Cryptocurrency Settings</button>
        </div>`;

if (c.indexOf(search) === -1) {
    // try to match ignoring \r\n
    const noRSearch = search.replace(/\r\n/g, '\n');
    const noRC = c.replace(/\r\n/g, '\n');
    if (noRC.indexOf(noRSearch) === -1) {
        console.error("NOT FOUND");
    } else {
        c = noRC.replace(noRSearch, replace);
        fs.writeFileSync('src/AdminDashboard.tsx', c);
        console.log("REPLACED");
    }
} else {
    c = c.replace(search, replace);
    fs.writeFileSync('src/AdminDashboard.tsx', c);
    console.log("REPLACED");
}
