# Résultats des tests — TopoMaroc GIS

Généré le 2026-10-18 20:23 UTC par `tools/tests-report.mjs` à partir d'exécutions réelles. Aucun test n'est déclaré réussi sans avoir été exécuté.

## 1. Tests unitaires (Node v22.23.3, `node --test`)

Références indépendantes : PROJ 9.8.1 (pyproj 3.8.0), GeographicLib-C (pyproj.Geod), Shapely, NOAA WMM 2025 (pygeomag), générées dans GitHub Actions par `tools/reference/make_reference.py`.

**47 réussi(s), 0 échoué(s).**

| Résultat | Test |
|---|---|
| ✅ réussi | Lecture des angles (décimal, virgule, DMS, hémisphères) |
| ✅ réussi | Lecture des nombres (virgule, espaces de milliers) |
| ✅ réussi | DMS et grades |
| ✅ réussi | Gisements plans |
| ✅ réussi | Unités de superficie et format cadastral ha a ca |
| ✅ réussi | WMM 2025 : déclinaison identique à la référence NOAA (pygeomag) |
| ✅ réussi | Les définitions correspondent au registre EPSG via PROJ (noms) |
| ✅ réussi | Transformation WGS 84 → Lambert Nord/Sud, UTM, Merchich identique à PROJ (< 1 mm) |
| ✅ réussi | Projections Lambert (toutes zones) : inverse identique à PROJ dans Merchich (< 0,1 mm) |
| ✅ réussi | Origines des projections Lambert : (X0, Y0) ↔ (φ0, λ0) |
| ✅ réussi | Projection seule : aller-retour Merchich ↔ Lambert < 1e-11° (inverse affinée) |
| ✅ réussi | Inverse UTM → WGS 84 identique à PROJ |
| ✅ réussi | Allers-retours WGS 84 → SRC → WGS 84 pour tous les systèmes |
| ✅ réussi | Domaine EPSG:1166 : valide au nord, extrapolé dans les zones Sahara |
| ✅ réussi | Ordre des axes : saisie lat/lon pour les SRC géographiques, X/Y pour les projetés |
| ✅ réussi | Contrôles de cohérence des saisies |
| ✅ réussi | Zone Lambert recommandée selon la latitude |
| ✅ réussi | Convergence des méridiens : nulle sur le méridien central, de signe correct |
| ✅ réussi | Paramètres Merchich personnalisés (convention Coordinate Frame inversée) |
| ✅ réussi | CSV : séparateur « ; », virgule décimale, correspondance automatique des colonnes |
| ✅ réussi | CSV sans en-tête et lat/lon en DMS |
| ✅ réussi | CSV : lignes invalides signalées |
| ✅ réussi | Détection du type de coordonnées (le SRC exact reste à confirmer) |
| ✅ réussi | Export CSV : valeurs saisies restituées sans altération, sommets de parcelle |
| ✅ réussi | GeoJSON : RFC 7946 (WGS 84) et variante projetée avec membre crs ; aller-retour |
| ✅ réussi | KML et GPX bien formés |
| ✅ réussi | DXF R12 : structure valide, coordonnées projetées, polyligne fermée |
| ✅ réussi | NMEA : GGA avec somme de contrôle, qualité RTK |
| ✅ réussi | Moyenne GPS pondérée et précision rapportée prudemment |
| ✅ réussi | Carré 10 m × 10 m → 100 m² exactement (Lambert Nord) |
| ✅ réussi | Rectangle 20 m × 30 m → 600 m² (Lambert Sud) |
| ✅ réussi | Triangle base 40 m, hauteur 25 m → 500 m² |
| ✅ réussi | Parcelle irrégulière : identique à Shapely (plan) et GeographicLib-C (ellipsoïde) |
| ✅ réussi | Carré 100 m × 100 m en UTM 29N |
| ✅ réussi | Parcelle saisie dans un autre SRC que la carte (WGS 84 → contrôle en Lambert) |
| ✅ réussi | Polygone WGS 84 (levé GPS) : superficie géodésique = pyproj.Geod |
| ✅ réussi | Grande emprise (> 10 km) : méthode géodésique choisie automatiquement et signalée |
| ✅ réussi | Sommets en double détectés |
| ✅ réussi | Polygone auto-intersecté (« nœud papillon ») détecté |
| ✅ réussi | Moins de 3 sommets, superficie nulle, fermeture répétée |
| ✅ réussi | Coordonnées incompatibles avec le SRC → erreur |
| ✅ réussi | Avertissement précision GPS insuffisante pour usage foncier |
| ✅ réussi | Zones Sahara : avertissement transformation extrapolée |
| ✅ réussi | Côtés : longueurs, gisements et azimuts géodésiques |
| ✅ réussi | Total de plusieurs parcelles |
| ✅ réussi | Géométrie plane : formule de Gauss stable avec de grandes coordonnées |
| ✅ réussi | Géodésie : inverse identique à pyproj.Geod |

### Principales valeurs vérifiées

| Cas | Attendu | Méthode de contrôle |
|---|---|---|
| Carré 10 m × 10 m (Lambert Nord) | 100 m² (écart < 1e-9 m²) | formule de Gauss ; ellipsoïde vs GeographicLib-C < 0,1 mm² |
| Rectangle 20 m × 30 m (Lambert Sud) | 600 m² | idem |
| Triangle base 40 m, hauteur 25 m | 500 m² | idem, Shapely |
| Parcelle irrégulière 6 sommets | 33684.2230 m² (Shapely) | écart < 1e-6 m² |
| Polygone WGS 84 0,01° × 0,01° (Rabat) | 1024457.958 m² (pyproj.Geod) | écart < 1 mm² |
| Parcelle saisie en WGS 84, contrôle en Lambert | 100 m² plan | aller-retour PROJ, écart < 1e-4 m² |
| Sommets en double / auto-intersection | erreur détectée | — |
| WGS 84 → Lambert Nord/Sud, UTM 28-30, Merchich (26 points) | valeurs PROJ | écart < 1 mm |
| Lambert (4 zones) → Merchich géographique | valeurs PROJ | écart < 0,1 mm |
| Origines Lambert (X0, Y0) | (−5,4° ; φ0) exactement | < 1e-9° |
| Déclinaison WMM 2025 (4 points) | valeurs NOAA | < 1e-6° |

Constat documenté : PROJ n'applique pas EPSG:1166 dans les zones Sahara Nord/Sud (hors domaine de validité) ; l'application applique la même transformation par extrapolation et l'**affiche comme telle**. Les quatre zones Lambert ont des plages X/Y qui se recouvrent : une confusion de zone n'est pas détectable par les seules valeurs (test dédié).

## 2. Tests navigateur — http://127.0.0.1:8080/

Chromium (Playwright), viewport mobile 390×844 tactile, tablette 820×1180, ordinateur 1440×900 ; GPS simulé. Exécution du 2026-10-18 20:20 UTC.

**20 réussi(s), 0 échoué(s), 2 non exécuté(s).**

| Résultat | Scénario | Détail |
|---|---|---|
| ✅ réussi | Chargement de l’application sans erreur JavaScript | 8 actions sur l’écran d’accueil |
| ✅ réussi | Lien direct et rechargement d’une route profonde (#/parcels) |  |
| ✅ réussi | PWA : manifeste valide et service worker actif | manifeste + service worker « activated » |
| ✅ réussi | Hors connexion : l’application redémarre depuis le cache (service worker) | interface et modules servis hors ligne |
| ✅ réussi | Navigation : saisie Lambert Nord, distance et azimut cohérents | distance 120 m, 45.0° NE · azimut vrai |
| ✅ réussi | Navigation : arrivée dans le rayon (10 m) → alerte visuelle | arrivée détectée à 4 m, point atteint enregistré |
| ✅ réussi | Navigation : précision GPS insuffisante signalée |  |
| ✅ réussi | GPS : autorisation refusée | — |
| ✅ réussi | GPS : position indisponible (erreur du capteur) |  |
| ✅ réussi | GPS : perte du signal (aucune mesure depuis 15 s) → état « signal perdu » | état stale détecté après ~15 s sans nouvelle position |
| ✅ réussi | Levé : enregistrement GPS, persistance après rechargement | 2 points, annuler/rétablir, persistance IndexedDB |
| ✅ réussi | Levé : moyenne « attendre une meilleure précision » |  |
| ✅ réussi | Parcelle : carré 10 m × 10 m saisi en Lambert Nord → 100,00 m² | superficie 100,00 m², périmètre 40,00 m |
| ✅ réussi | Parcelle : polygone auto-intersecté et sommets en double détectés |  |
| ✅ réussi | Parcelle : mode dessin sur la carte puis rapport PDF | 4 sommets dessinés, 2 930,57 m², PDF 24306 octets |
| ✅ réussi | Import CSV (séparateur ;) avec choix du système puis export GeoJSON/DXF/CSV/XLSX | Leve_du_18_10_2026-20261018-2020.geojson, Leve_du_18_10_2026-20261018-2020-26191.dxf, Leve_du_18_10_2026-20261018-2020-26191.csv, Leve_du_18_10_2026-20261018-2020.xlsx |
| ✅ réussi | Sauvegarde complète puis restauration | 1 projet(s), 1 entité(s) restaurés |
| ✅ réussi | Outils : convertisseur (Lambert Nord → tous systèmes) et mesure de distance | origine (500 000 ; 300 000) → φ 33,3° λ −5,4° ; distance mesurée 148,64 m |
| ✅ réussi | Interface tablette et ordinateur (captures) |  |
| ✅ réussi | Mode sombre et thème clair |  |
| ⏸ non exécuté | Smartphone iOS / Android réels | aucun appareil physique disponible dans l’environnement de test : à valider sur le terrain (Safari iOS, Chrome Android) |
| ⏸ non exécuté | Installation PWA sur l’écran d’accueil | nécessite une interaction utilisateur sur un appareil réel ; critères vérifiés automatiquement (manifeste, icônes, service worker, HTTPS) |

## 3. Tests navigateur — https://milyasse.github.io/topomaroc-gis/

Chromium (Playwright), viewport mobile 390×844 tactile, tablette 820×1180, ordinateur 1440×900 ; GPS simulé. Exécution du 2026-10-18 20:23 UTC.

**20 réussi(s), 0 échoué(s), 2 non exécuté(s).**

| Résultat | Scénario | Détail |
|---|---|---|
| ✅ réussi | Chargement de l’application sans erreur JavaScript | 8 actions sur l’écran d’accueil |
| ✅ réussi | Lien direct et rechargement d’une route profonde (#/parcels) |  |
| ✅ réussi | PWA : manifeste valide et service worker actif | manifeste + service worker « activated » |
| ✅ réussi | Hors connexion : l’application redémarre depuis le cache (service worker) | interface et modules servis hors ligne |
| ✅ réussi | Navigation : saisie Lambert Nord, distance et azimut cohérents | distance 120 m, 45.0° NE · azimut vrai |
| ✅ réussi | Navigation : arrivée dans le rayon (10 m) → alerte visuelle | arrivée détectée à 4 m, point atteint enregistré |
| ✅ réussi | Navigation : précision GPS insuffisante signalée |  |
| ✅ réussi | GPS : autorisation refusée | — |
| ✅ réussi | GPS : position indisponible (erreur du capteur) |  |
| ✅ réussi | GPS : perte du signal (aucune mesure depuis 15 s) → état « signal perdu » | état stale détecté après ~15 s sans nouvelle position |
| ✅ réussi | Levé : enregistrement GPS, persistance après rechargement | 2 points, annuler/rétablir, persistance IndexedDB |
| ✅ réussi | Levé : moyenne « attendre une meilleure précision » |  |
| ✅ réussi | Parcelle : carré 10 m × 10 m saisi en Lambert Nord → 100,00 m² | superficie 100,00 m², périmètre 40,00 m |
| ✅ réussi | Parcelle : polygone auto-intersecté et sommets en double détectés |  |
| ✅ réussi | Parcelle : mode dessin sur la carte puis rapport PDF | 4 sommets dessinés, 2 930,57 m², PDF 24306 octets |
| ✅ réussi | Import CSV (séparateur ;) avec choix du système puis export GeoJSON/DXF/CSV/XLSX | Leve_du_18_10_2026-20261018-2023.geojson, Leve_du_18_10_2026-20261018-2023-26191.dxf, Leve_du_18_10_2026-20261018-2023-26191.csv, Leve_du_18_10_2026-20261018-2023.xlsx |
| ✅ réussi | Sauvegarde complète puis restauration | 1 projet(s), 1 entité(s) restaurés |
| ✅ réussi | Outils : convertisseur (Lambert Nord → tous systèmes) et mesure de distance | origine (500 000 ; 300 000) → φ 33,3° λ −5,4° ; distance mesurée 148,64 m |
| ✅ réussi | Interface tablette et ordinateur (captures) |  |
| ✅ réussi | Mode sombre et thème clair |  |
| ⏸ non exécuté | Smartphone iOS / Android réels | aucun appareil physique disponible dans l’environnement de test : à valider sur le terrain (Safari iOS, Chrome Android) |
| ⏸ non exécuté | Installation PWA sur l’écran d’accueil | nécessite une interaction utilisateur sur un appareil réel ; critères vérifiés automatiquement (manifeste, icônes, service worker, HTTPS) |

## Non couvert par l'automatisation

- Appareils physiques iOS (Safari) et Android (Chrome) : précision réelle du GPS, boussole, installation PWA, comportement en plein soleil — à valider sur le terrain.
- Comparaison avec QGIS : remplacée par PROJ (bibliothèque utilisée par QGIS pour les mêmes transformations) et Shapely/GeographicLib pour les superficies.
