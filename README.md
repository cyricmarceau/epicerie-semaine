# Épicerie de la semaine

Site statique : une recette par épicerie (Maxi, IGA, Metro) bâtie sur les spéciaux de la circulaire, avec prix par portion et la liste des spéciaux par rayon.

## Structure
- `public/index.html`, `public/styles.css`, `public/app.js` : l'app
- `public/data/semaine.json` : spéciaux et recettes de la semaine (seul fichier à changer chaque jeudi)
- `render.yaml` : configuration Render (Static Site)

## Tester en local
```
cd public && python3 -m http.server 8000
```
Ouvrir http://localhost:8000

## Déployer sur Render
1. Pousser ce dossier dans un dépôt GitHub.
2. Render → New → Blueprint → choisir le dépôt (lit `render.yaml`).
   Ou : New → Static Site → Publish directory `public`, build command vide.
3. Chaque push sur `main` redéploie automatiquement.

## Mise à jour hebdomadaire
Remplacer le contenu de `public/data/semaine.json` (champ `semaine`, `speciaux`, `recette`), commit, push.
