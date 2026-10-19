# Résultats des tests — TopoMaroc GIS

Généré le 2026-10-19 02:03 UTC par `tools/tests-report.mjs` à partir d'exécutions réelles. Aucun test n'est déclaré réussi sans avoir été exécuté.

## 1. Tests unitaires (Node v22.23.3, `node --test`)

Références indépendantes : PROJ 9.8.1 (pyproj 3.8.0), GeographicLib-C (pyproj.Geod), Shapely, NOAA WMM 2025 (pygeomag), générées dans GitHub Actions par `tools/reference/make_reference.py`.

**71 réussi(s), 0 échoué(s).**

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
| ✅ réussi | Lecture des parts : %, décimales, fractions |
| ✅ réussi | Demi-plan : découpe exacte d’un rectangle |
| ✅ réussi | Rectangle 5000 m² partagé 50/30/20 : superficies exactes, somme conservée |
| ✅ réussi | Parcelle irrégulière : parts héritage (1/8, 7/16, 7/16) à moins de 1 mm² près, pour plusieurs orientations |
| ✅ réussi | Polygone non convexe (en L) : superficies exactes, non-contiguïté signalée |
| ✅ réussi | Façade sur le côté de référence |
| ✅ réussi | Propositions : perpendiculaire au côté donnant accès à chacun, classement |
| ✅ réussi | Une seule personne : la parcelle entière |
| ✅ réussi | Assemblage : points dans le désordre → contour simple et superficie correcte |
| ✅ réussi | Insertion d’un sommet au meilleur endroit du contour |
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
| ✅ réussi | Décodage Terrarium |
| ✅ réussi | Projection pixel aller-retour |
| ✅ réussi | Plan incliné de 10 % montant vers l’est : pente 10 %, exposition ouest |
| ✅ réussi | Plan incliné de 25 % descendant vers le sud-est : exposition sud-est |
| ✅ réussi | Terrain plat, petite parcelle (plus petite qu’une cellule) |
| ✅ réussi | Pente entre deux points |
| ✅ réussi | Interpolation bilinéaire exacte sur un plan |
| ✅ réussi | Bandes Lambert déduites des domaines d’usage EPSG |
| ✅ réussi | Zone Lambert et fuseau UTM de villes marocaines |
| ✅ réussi | Hors du Maroc : pas de bascule |
| ✅ réussi | Hystérésis le long de la limite Nord / Sud (31,5° N) |
| ✅ réussi | Hystérésis UTM (limite 29/30 à 6° W) |
| ✅ réussi | Famille d’un système |
| ✅ réussi | Parcelle WGS 84 à Agadir : superficie plane calculée en Lambert Sud |

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

Chromium (Playwright), viewport mobile 390×844 tactile, tablette 820×1180, ordinateur 1440×900 ; GPS simulé. Exécution du 2026-10-19 02:00 UTC.

**35 réussi(s), 0 échoué(s), 2 non exécuté(s).**

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
| ✅ réussi | Parcelle : mode dessin sur la carte puis rapport PDF | 4 sommets dessinés, 2 930,61 m², PDF 24309 octets |
| ✅ réussi | Import CSV (séparateur ;) avec choix du système puis export GeoJSON/DXF/CSV/XLSX | Leve_du_19_10_2026-20261019-0159.geojson, Leve_du_19_10_2026-20261019-0159-26191.dxf, Leve_du_19_10_2026-20261019-0159-26191.csv, Leve_du_19_10_2026-20261019-0159.xlsx |
| ✅ réussi | Sauvegarde complète puis restauration | 1 projet(s), 1 entité(s) restaurés |
| ✅ réussi | Outils : convertisseur (Lambert Nord → tous systèmes) et mesure de distance | origine (500 000 ; 300 000) → φ 33,3° λ −5,4° ; distance mesurée 148,64 m |
| ✅ réussi | Interface tablette et ordinateur (captures) |  |
| ✅ réussi | Mode sombre et thème clair |  |
| ✅ réussi | « + Point » : placement au réticule sans GPS (2 points) | 2 points placés, position exacte du réticule |
| ✅ réussi | Sélection de 4 points sur la carte → parcelle (contour automatique) | S = 100,00 m² · P = 40,00 m · 4 sommets |
| ✅ réussi | Dessin : accrochage aux points et fermeture en touchant le 1er sommet | 1er sommet accroché exactement au point 77, parcelle fermée au toucher du 1er sommet |
| ✅ réussi | Partage : 3 personnes (1/8, 7/16, 7/16), propositions, lots colorés, rapport PDF | 4 propositions ; lots Fatima 4210.53 m², Ahmed 14736.85 m², Khadija 14736.85 m² ; PDF 32031 octets |
| ✅ réussi | Fiche projet : statistiques et superficie par personne |  |
| ✅ réussi | Satellite : au-delà de l’imagerie disponible, image agrandie au lieu d’une zone vide | 8 tuiles affichées au zoom 21, Imagerie max. ici : zoom 18 — image agrandie |
| ✅ réussi | Déplacer un point en édition (glisser sur la carte) + sommet de parcelle lié | point déplacé à X=400003.00 ; sommet lié suivi ; nouvelle superficie 85.00 m² |
| ✅ réussi | Couches par projet : superposition d’un 2e projet, activation/désactivation | projet Nord superposé au projet Sud ouvert, puis masqué |
| ✅ réussi | Pente d’une parcelle (MNT) : plan incliné de 10 % → 10 %, exposition ouest | RELIEF ET PENTE Recalculer la pente 10,0 % pente moyenne (5,7°) · forte 10,0 % pente maximale 11,4 m dénivelé (494 à 506 m) ouest exposition (270°) · pente géné |
| ✅ réussi | Outil « Pente entre deux points » : profil et pente | PENTE A → B 10,0 % 5,71° · forte DÉNIVELÉ +15,2 m sur 151,95 m A : 492,4 m (MNT) · B : 507,6 m (MNT) · pente max. du profil 10,0 % 508 m 492 |
| ✅ réussi | Projection automatique : Rabat (Lambert Nord) → Agadir (Lambert Sud), points enregistrés dans leur zone | point 1 en EPSG:26191 (Rabat), point 2 en EPSG:26192 (Agadir), réglages basculés |
| ✅ réussi | Projection automatique sans GPS : « + Point » à Laâyoune → Lambert Sahara Nord ; choix manuel désactive l’automatique | point carte en EPSG:26194 ; vue pays ignorée ; choix manuel respecté |
| ✅ réussi | Réglages : recalcul des points anciens dans leur zone | E 96534.94 N 387379.32 (Lambert Sud), ancienne valeur conservée |
| ✅ réussi | Parcelles : afficher / masquer chacune, « uniquement celle-ci », lots masqués avec leur parcelle | seule P1 → 1 tracé ; P2 + lot réaffichés ; couches 2/4 → 4/4 ; masquage conservé après rechargement |
| ✅ réussi | Page « Version de l’application » (accueil, réglages, aide) | TopoMaroc GIS v1.4.0 · version et nouveautés · 5 versions · « Version publiée introuvable (exécution locale). » |
| ⏸ non exécuté | Smartphone iOS / Android réels | aucun appareil physique disponible dans l’environnement de test : à valider sur le terrain (Safari iOS, Chrome Android) |
| ⏸ non exécuté | Installation PWA sur l’écran d’accueil | nécessite une interaction utilisateur sur un appareil réel ; critères vérifiés automatiquement (manifeste, icônes, service worker, HTTPS) |

## 3. Tests navigateur — https://milyasse.github.io/topomaroc-gis/

Chromium (Playwright), viewport mobile 390×844 tactile, tablette 820×1180, ordinateur 1440×900 ; GPS simulé. Exécution du 2026-10-19 02:03 UTC.

**35 réussi(s), 0 échoué(s), 2 non exécuté(s).**

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
| ✅ réussi | Parcelle : mode dessin sur la carte puis rapport PDF | 4 sommets dessinés, 2 930,61 m², PDF 24309 octets |
| ✅ réussi | Import CSV (séparateur ;) avec choix du système puis export GeoJSON/DXF/CSV/XLSX | Leve_du_19_10_2026-20261019-0202.geojson, Leve_du_19_10_2026-20261019-0202-26191.dxf, Leve_du_19_10_2026-20261019-0202-26191.csv, Leve_du_19_10_2026-20261019-0202.xlsx |
| ✅ réussi | Sauvegarde complète puis restauration | 1 projet(s), 1 entité(s) restaurés |
| ✅ réussi | Outils : convertisseur (Lambert Nord → tous systèmes) et mesure de distance | origine (500 000 ; 300 000) → φ 33,3° λ −5,4° ; distance mesurée 148,64 m |
| ✅ réussi | Interface tablette et ordinateur (captures) |  |
| ✅ réussi | Mode sombre et thème clair |  |
| ✅ réussi | « + Point » : placement au réticule sans GPS (2 points) | 2 points placés, position exacte du réticule |
| ✅ réussi | Sélection de 4 points sur la carte → parcelle (contour automatique) | S = 100,00 m² · P = 40,00 m · 4 sommets |
| ✅ réussi | Dessin : accrochage aux points et fermeture en touchant le 1er sommet | 1er sommet accroché exactement au point 77, parcelle fermée au toucher du 1er sommet |
| ✅ réussi | Partage : 3 personnes (1/8, 7/16, 7/16), propositions, lots colorés, rapport PDF | 4 propositions ; lots Fatima 4210.53 m², Ahmed 14736.85 m², Khadija 14736.85 m² ; PDF 32031 octets |
| ✅ réussi | Fiche projet : statistiques et superficie par personne |  |
| ✅ réussi | Satellite : au-delà de l’imagerie disponible, image agrandie au lieu d’une zone vide | 8 tuiles affichées au zoom 21, Imagerie max. ici : zoom 18 — image agrandie |
| ✅ réussi | Déplacer un point en édition (glisser sur la carte) + sommet de parcelle lié | point déplacé à X=400003.00 ; sommet lié suivi ; nouvelle superficie 85.00 m² |
| ✅ réussi | Couches par projet : superposition d’un 2e projet, activation/désactivation | projet Nord superposé au projet Sud ouvert, puis masqué |
| ✅ réussi | Pente d’une parcelle (MNT) : plan incliné de 10 % → 10 %, exposition ouest | RELIEF ET PENTE Recalculer la pente 10,0 % pente moyenne (5,7°) · forte 10,0 % pente maximale 11,4 m dénivelé (494 à 506 m) ouest exposition (270°) · pente géné |
| ✅ réussi | Outil « Pente entre deux points » : profil et pente | PENTE A → B 10,0 % 5,71° · forte DÉNIVELÉ +15,2 m sur 151,95 m A : 492,4 m (MNT) · B : 507,6 m (MNT) · pente max. du profil 10,0 % 508 m 492 |
| ✅ réussi | Projection automatique : Rabat (Lambert Nord) → Agadir (Lambert Sud), points enregistrés dans leur zone | point 1 en EPSG:26191 (Rabat), point 2 en EPSG:26192 (Agadir), réglages basculés |
| ✅ réussi | Projection automatique sans GPS : « + Point » à Laâyoune → Lambert Sahara Nord ; choix manuel désactive l’automatique | point carte en EPSG:26194 ; vue pays ignorée ; choix manuel respecté |
| ✅ réussi | Réglages : recalcul des points anciens dans leur zone | E 96534.94 N 387379.32 (Lambert Sud), ancienne valeur conservée |
| ✅ réussi | Parcelles : afficher / masquer chacune, « uniquement celle-ci », lots masqués avec leur parcelle | seule P1 → 1 tracé ; P2 + lot réaffichés ; couches 2/4 → 4/4 ; masquage conservé après rechargement |
| ✅ réussi | Page « Version de l’application » (accueil, réglages, aide) | TopoMaroc GIS v1.4.0 · 5 versions · « Vous utilisez la dernière version (v1.4.0, publication 12c96fc). » |
| ⏸ non exécuté | Smartphone iOS / Android réels | aucun appareil physique disponible dans l’environnement de test : à valider sur le terrain (Safari iOS, Chrome Android) |
| ⏸ non exécuté | Installation PWA sur l’écran d’accueil | nécessite une interaction utilisateur sur un appareil réel ; critères vérifiés automatiquement (manifeste, icônes, service worker, HTTPS) |

## Non couvert par l'automatisation

- Appareils physiques iOS (Safari) et Android (Chrome) : précision réelle du GPS, boussole, installation PWA, comportement en plein soleil — à valider sur le terrain.
- Comparaison avec QGIS : remplacée par PROJ (bibliothèque utilisée par QGIS pour les mêmes transformations) et Shapely/GeographicLib pour les superficies.
