#!/usr/bin/env bash
# Récupère les bibliothèques tierces depuis npm et les regroupe en modules ESM
# autonomes dans vendor/. Exécuté par GitHub Actions (.github/workflows/vendor.yml).
# L'application n'a ainsi besoin d'aucune étape de compilation : GitHub Pages
# sert directement les fichiers du dépôt.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/vendor"
WORK="$(mktemp -d)"
cd "$WORK"
npm init -y >/dev/null

npm install --no-audit --no-fund \
  leaflet@1.9.4 \
  proj4@2 \
  geographiclib-geodesic@2 \
  papaparse@5 \
  @tmcw/togeojson@5 \
  jspdf@3 \
  jspdf-autotable@5 \
  write-excel-file@2 \
  gsap@3 \
  esbuild@0.25

rm -rf "$OUT"
mkdir -p "$OUT/leaflet/images" "$OUT/licenses"

# Leaflet : build ESM officiel + CSS + images
cp node_modules/leaflet/dist/leaflet-src.esm.js "$OUT/leaflet/leaflet.mjs"
cp node_modules/leaflet/dist/leaflet.css "$OUT/leaflet/leaflet.css"
cp node_modules/leaflet/dist/images/* "$OUT/leaflet/images/"

mkdir -p entries
cat > entries/proj4.js <<'EOF'
import proj4 from 'proj4';
export default proj4;
EOF
cat > entries/geodesic.js <<'EOF'
import g from 'geographiclib-geodesic';
export const Geodesic = g.Geodesic;
export const PolygonArea = g.PolygonArea;
export default g;
EOF
cat > entries/papaparse.js <<'EOF'
import Papa from 'papaparse';
export default Papa;
EOF
cat > entries/togeojson.js <<'EOF'
export { kml, gpx } from '@tmcw/togeojson';
EOF
cat > entries/jspdf.js <<'EOF'
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
export { jsPDF, autoTable };
EOF
cat > entries/xlsx.js <<'EOF'
import writeXlsxFile from 'write-excel-file';
export default writeXlsxFile;
EOF

cat > entries/gsap.js <<'EOF'
import { gsap } from 'gsap';
import { Draggable } from 'gsap/Draggable';
gsap.registerPlugin(Draggable);
export { gsap, Draggable };
EOF

ESB="npx esbuild --bundle --format=esm --platform=browser --target=es2020 --minify --legal-comments=eof"
$ESB entries/proj4.js --outfile="$OUT/proj4.mjs"
$ESB entries/geodesic.js --outfile="$OUT/geodesic.mjs"
$ESB entries/papaparse.js --outfile="$OUT/papaparse.mjs"
$ESB entries/togeojson.js --outfile="$OUT/togeojson.mjs"
$ESB entries/jspdf.js --outfile="$OUT/jspdf.mjs" \
  --external:html2canvas --external:dompurify --external:canvg --external:core-js
$ESB entries/xlsx.js --outfile="$OUT/xlsx.mjs"
$ESB entries/gsap.js --outfile="$OUT/gsap.mjs"

# Licences et versions
node - "$OUT" <<'EOF'
const fs = require('fs'); const path = require('path');
const out = process.argv[2];
const pkgs = ['leaflet','proj4','geographiclib-geodesic','papaparse','@tmcw/togeojson','jspdf','jspdf-autotable','write-excel-file','gsap'];
const versions = {};
for (const p of pkgs) {
  const dir = path.join('node_modules', p);
  const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  versions[p] = { version: pj.version, license: pj.license || null };
  for (const f of fs.readdirSync(dir)) {
    if (/^(licen[cs]e|copying)/i.test(f)) {
      fs.copyFileSync(path.join(dir, f), path.join(out, 'licenses', p.replace('/', '__') + '.' + f));
    }
  }
}
fs.writeFileSync(path.join(out, 'VERSIONS.json'), JSON.stringify(versions, null, 2) + '\n');
console.log(versions);
EOF

ls -la "$OUT"
