"""Génère des valeurs de référence INDÉPENDANTES avec PROJ (via pyproj),
GeographicLib-C (pyproj.Geod) et Shapely, pour valider les calculs JavaScript
de TopoMaroc GIS (proj4js + geographiclib-geodesic).

Exécuté dans GitHub Actions. Sortie : tests/reference/proj_reference.json
"""
import glob
import json
import os
import shutil
import sys

import pyproj
from pyproj import CRS, Geod, Transformer
from shapely.geometry import Polygon

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "tests", "reference", "proj_reference.json")

CRS_POINTS = {
    26191: [(-6.8498, 34.0209), (-5.8340, 35.7595), (-4.9998, 34.0331),
            (-1.9086, 34.6814), (-7.5898, 33.5731), (-8.0, 32.0)],
    26192: [(-7.9811, 31.6295), (-9.5981, 30.4278), (-6.9063, 30.9189),
            (-4.0, 31.0), (-10.0, 28.5)],
    26194: [(-13.2, 27.15), (-11.0, 26.5), (-14.5, 25.5)],
    26195: [(-15.95, 23.7), (-16.5, 21.5), (-13.0, 22.0)],
    32628: [(-13.2, 27.15), (-15.95, 23.7)],
    32629: [(-6.8498, 34.0209), (-7.9811, 31.6295), (-9.5, 30.4)],
    32630: [(-1.9086, 34.6814), (-4.9998, 34.0331)],
    4261: [(-6.8498, 34.0209), (-7.9811, 31.6295)],
}

ref = {
    "generator": "tools/reference/make_reference.py",
    "pyproj": pyproj.__version__,
    "proj": pyproj.proj_version_str,
    "crs": {},
    "forward": [],
    "inverse": [],
    "polygons": [],
    "declination": [],
}

for code, pts in CRS_POINTS.items():
    crs = CRS.from_epsg(code)
    ref["crs"][str(code)] = {
        "name": crs.name,
        "proj4": crs.to_proj4(),
        "area_of_use": list(crs.area_of_use.bounds) if crs.area_of_use else None,
        "axis": [a.abbrev for a in crs.axis_info],
    }
    t = Transformer.from_crs("EPSG:4326", f"EPSG:{code}", always_xy=True)
    ref["crs"][str(code)]["transformation"] = t.description
    for lon, lat in pts:
        x, y = t.transform(lon, lat)
        ref["forward"].append({"epsg": code, "lon": lon, "lat": lat, "x": x, "y": y})

# Inverses : coordonnées projetées connues -> WGS 84
INV = [
    (26191, 500000.0, 300000.0), (26191, 380000.0, 380000.0), (26191, 600000.0, 450000.0),
    (26192, 500000.0, 300000.0), (26192, 250000.0, 120000.0),
    (26194, 1200000.0, 400000.0), (26195, 1500000.0, 400000.0),
    (32629, 500000.0, 3700000.0), (32630, 300000.0, 3800000.0), (32628, 400000.0, 3000000.0),
]
for code, x, y in INV:
    t = Transformer.from_crs(f"EPSG:{code}", "EPSG:4326", always_xy=True)
    lon, lat = t.transform(x, y)
    tm = Transformer.from_crs(f"EPSG:{code}", "EPSG:4261", always_xy=True)
    mlon, mlat = tm.transform(x, y)
    ref["inverse"].append({"epsg": code, "x": x, "y": y, "lon": lon, "lat": lat,
                           "merchich_lon": mlon, "merchich_lat": mlat})

geod = Geod(ellps="WGS84")


def poly_case(name, epsg, coords):
    plane = Polygon(coords)
    t = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
    ll = [t.transform(x, y) for x, y in coords]
    lons = [p[0] for p in ll]
    lats = [p[1] for p in ll]
    garea, gperim = geod.polygon_area_perimeter(lons, lats)
    ref["polygons"].append({
        "name": name, "epsg": epsg, "coords": coords,
        "plane_area": plane.area, "plane_perimeter": plane.length,
        "valid": plane.is_valid,
        "wgs84": ll, "geodesic_area": abs(garea), "geodesic_perimeter": gperim,
    })


poly_case("carre_10x10_lambert_nord", 26191,
          [(400000, 380000), (400010, 380000), (400010, 380010), (400000, 380010)])
poly_case("rectangle_20x30_lambert_sud", 26192,
          [(250000, 120000), (250020, 120000), (250020, 120030), (250000, 120030)])
poly_case("triangle_base40_h25_lambert_nord", 26191,
          [(420000, 360000), (420040, 360000), (420015, 360025)])
poly_case("carre_100x100_utm29", 32629,
          [(650000, 3765000), (650100, 3765000), (650100, 3765100), (650000, 3765100)])
poly_case("parcelle_irreguliere_lambert_nord", 26191,
          [(386512.35, 371204.88), (386640.12, 371198.40), (386702.91, 371301.77),
           (386655.03, 371402.15), (386530.66, 371388.09), (386480.20, 371290.51)])
poly_case("grand_polygone_20km_lambert_nord", 26191,
          [(400000, 350000), (420000, 350000), (420000, 370000), (400000, 370000)])

# Polygone défini directement en WGS 84 (cas d'un levé GPS)
lons = [-6.85, -6.84, -6.84, -6.85]
lats = [34.02, 34.02, 34.03, 34.03]
garea, gperim = geod.polygon_area_perimeter(lons, lats)
ref["polygons"].append({"name": "wgs84_0.01deg_rabat", "epsg": 4326,
                        "coords": list(zip(lons, lats)),
                        "geodesic_area": abs(garea), "geodesic_perimeter": gperim})

# Inverse géodésique (distance / azimut) de référence
g_inv = []
for (lon1, lat1, lon2, lat2) in [(-6.8498, 34.0209, -7.5898, 33.5731),
                                 (-7.9811, 31.6295, -9.5981, 30.4278),
                                 (-6.85, 34.02, -6.8499, 34.0201)]:
    az12, az21, dist = geod.inv(lon1, lat1, lon2, lat2)
    g_inv.append({"lon1": lon1, "lat1": lat1, "lon2": lon2, "lat2": lat2,
                  "azi1": az12, "dist": dist})
ref["geodesic_inverse"] = g_inv

# Modèle magnétique WMM : copie des coefficients et déclinaisons de référence
try:
    import pygeomag  # noqa: F401
    pkg = os.path.dirname(pygeomag.__file__)
    cofs = sorted(glob.glob(os.path.join(pkg, "**", "*.COF"), recursive=True))
    print("COF disponibles:", cofs)
    wmm2025 = [c for c in cofs if "2025" in os.path.basename(c) and "HR" not in os.path.basename(c).upper()]
    if wmm2025:
        os.makedirs(os.path.join(ROOT, "vendor", "wmm"), exist_ok=True)
        shutil.copy(wmm2025[0], os.path.join(ROOT, "vendor", "wmm", "WMM2025.COF"))
        from pygeomag import GeoMag
        gm = GeoMag(coefficients_file=os.path.relpath(wmm2025[0], pkg), high_resolution=False)
        for (lat, lon, t) in [(34.0209, -6.8498, 2026.8), (31.6295, -7.9811, 2026.8),
                              (23.7, -15.95, 2027.5), (35.7595, -5.834, 2025.0)]:
            r = gm.calculate(glat=lat, glon=lon, alt=0, time=t)
            ref["declination"].append({"lat": lat, "lon": lon, "year": t, "decl": r.d,
                                       "model": os.path.basename(wmm2025[0])})
except Exception as e:  # pragma: no cover
    print("pygeomag indisponible:", repr(e), file=sys.stderr)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(ref, f, indent=1, ensure_ascii=False)
print("Référence écrite :", OUT)
print(json.dumps(ref["crs"], indent=1, ensure_ascii=False))
