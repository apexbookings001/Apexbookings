const fs = require('fs');
let lines = fs.readFileSync('src/AdminDashboard.tsx', 'utf8').split('\n');

// 1. Fix line 1038
lines[1038] = '                      type="number" value={(pkg as any)[key.toLowerCase()]} onChange={e => setPkgs(prev => prev.map((p,i) => i===pkgIdx ? {...p, [key.toLowerCase()]: parseInt(e.target.value)||0} : p))}/>';

// 2. Delete lines 1094 to 1241 (length = 1241 - 1094 + 1 = 148 lines)
lines.splice(1094, 148);

fs.writeFileSync('src/AdminDashboard.tsx.fixed', lines.join('\n'));
