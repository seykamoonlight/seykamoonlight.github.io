# seykamoonlight.github.io

Site photo personnel : une colonne de photos placées à la main, comme des
tirages posés sur une table. En ligne sur
**https://seykamoonlight.github.io/photo/**.

Le site publié est entièrement statique (HTML, CSS, JavaScript, images).
L'édition se fait en local, dans un petit éditeur ouvert dans le navigateur.

## Au quotidien

1. **Clique sur Galerie dans le Dock** (ou double-clique `Galerie.app`).
   L'éditeur s'ouvre dans le navigateur, sans fenêtre de Terminal. Pour
   l'avoir dans le Dock : glisse `Galerie.app` dans la partie gauche du Dock,
   **sans la déplacer** du dossier du site (elle en a besoin pour trouver
   le reste).
2. **Glisse des photos** dans l'éditeur, place-les, règle leur taille, leur
   angle et leur ordre d'empilement (↑ Avant / ↓ Arrière).
3. **Enregistrer** (ou Cmd + S) écrit `photo/layout.json`.
4. **Aperçu** construit le site exactement comme pour la publication et
   l'ouvre dans un nouvel onglet, sans rien envoyer. C'est le site au
   fichier près : seules les photos du layout y sont, et comme sur GitHub,
   un nom de fichier dont la casse ne correspond pas y est introuvable.
5. **↗ Publier** enregistre, met le site en ligne, puis **vérifie** que
   GitHub sert bien la nouvelle version (cela peut prendre jusqu'à deux
   minutes). Le journal dit clairement si quelque chose ne va pas.

Il n'y a rien à arrêter : le serveur local s'arrête tout seul environ une
minute après la fermeture du dernier onglet de l'éditeur (jamais pendant
une publication). L'aperçu s'arrête avec lui. Si le serveur disparaît alors
que l'éditeur est ouvert, un bandeau rouge le signale : relancer Galerie
suffit, les modifications en cours sont conservées dans l'onglet. Le
journal du serveur est dans `~/Library/Logs/Galerie.log` (app Console).

Quelques comportements à connaître :

- L'éditeur affiche l'empilement **tel qu'il sera en ligne** : une photo
  sélectionnée ne passe pas au-dessus des autres, pour qu'on voie
  exactement quelle partie en est cachée.
- Un clic ne déplace jamais une photo : il faut glisser d'au moins 4 px.
- Fermer l'éditeur avec des modifications non enregistrées demande
  confirmation.
- **Retirer** une photo est enregistré immédiatement. L'original n'est pas
  détruit : il est rangé dans `photo/corbeille/`, à vider à la main.
- Les formats acceptés sont JPEG, PNG, WebP (et BMP, TIFF, GIF). Une photo
  HEIC d'iPhone est refusée : exporte-la d'abord en JPEG.

## Les photos

| Dossier | Contenu | Dans git ? |
|---|---|---|
| `photo/photos/` | les **originaux**, en pleine résolution | non |
| `photo/photos/thumbs/` | 900 px, pour la grille | non — refabriqué |
| `photo/photos/web/` | 2000 px, pour l'affichage en grand | non — refabriqué |
| `photo/corbeille/` | originaux retirés de la galerie | non |

**Les originaux ne sont jamais publiés**, ni sur le site ni dans le dépôt
(qui est public). Ils n'existent que sur ce Mac : **ils doivent être
sauvegardés** à part, par exemple avec Time Machine.

Les deux tailles publiées sont fabriquées par `photo/build_web.py`, qui
efface au passage les métadonnées EXIF — dont la position GPS. Elles se
refabriquent à tout moment ; l'éditeur et la publication le font tout seuls.

Seules les photos **présentes dans le layout** sont publiées. Une photo
déposée dans `photo/photos/` sans être placée ne part pas en ligne.

## Organisation du code

```
Galerie.app            lance le serveur local (éditeur :8000, aperçu :8001) ;
                       c'est un simple script : Contents/MacOS/Galerie
publish.sh             met le site en ligne (voir plus bas)
index.html             page d'accueil du site
photo/
  index.html           la galerie publique
  viewer.js, .css      affichage de la galerie et du lightbox
  layout.json          LE fichier précieux : la place de chaque photo
  qr.svg               QR code vers le site, affiché dans le panneau
  editor.html, .js, .css   l'éditeur (local uniquement, jamais publié)
  server.py            serveur local de l'éditeur
  build_web.py         fabrique les deux tailles publiées
```

Le format de `layout.json` est décrit en tête de `photo/editor.js`. En bref,
toutes les longueurs y sont exprimées **en largeurs de colonne** : le
placement est le même quelle que soit la taille de l'écran. La colonne fait
420 px sur ordinateur et la largeur de l'écran sur téléphone.

Trois valeurs doivent rester identiques entre fichiers, et sont signalées
en commentaire là où elles apparaissent : la largeur de colonne (420 px), la
largeur du panneau de gauche (330 px) et la taille par défaut (0,65).

## Publication

`publish.sh` (appelé par le bouton Publier) :

1. fabrique les tailles manquantes, puis vérifie que **chaque photo du
   layout** a bien ses deux tailles — sinon il s'arrête sans rien envoyer ;
2. reconstruit de zéro le contenu de la branche `gh-pages`, dans le
   dossier `.gh-pages/` ;
3. l'envoie sur GitHub ;
4. compare, octet pour octet, ce que GitHub sert avec ce qui vient d'être
   envoyé, jusqu'à ce que le site soit à jour.

La branche `gh-pages` ne contient **qu'un seul commit**, la version
actuelle du site : chaque publication remplace la précédente au lieu de
s'empiler. Le dépôt ne grossit donc pas au fil des mises à jour.

Pour construire le site et voir ce qui changerait, sans rien envoyer (c'est
ce que fait le bouton Aperçu ; le résultat est servi sur
http://localhost:8001/photo/ tant que l'éditeur est ouvert) :

```bash
./publish.sh --dry-run
```

Pour vérifier à tout moment que le site en ligne est à jour :

```bash
./publish.sh --check
```

**GitHub doit servir la branche `gh-pages`**, pas `main` (qui ne contient
aucune photo : la galerie s'afficherait avec des images cassées). Le
réglage se trouve dans le dépôt, *Settings → Pages* : « Deploy from a
branch », branche `gh-pages`, dossier `/ (root)`. Si ce n'est pas le cas,
la vérification de `publish.sh` le signale avec le lien direct.

Le code source vit sur la branche `main`. La publication ne la touche pas :
pense à commiter de temps en temps, en particulier `photo/layout.json`, qui
contient tout ton travail de placement.

## Prérequis

- Python 3 et **Pillow** : `pip3 install Pillow`
- git, configuré pour pousser sur GitHub

## Reprendre sur un autre Mac

```bash
git clone https://github.com/seykamoonlight/seykamoonlight.github.io.git
```

puis recopie tes originaux depuis ta sauvegarde dans `photo/photos/`. Les
vignettes se refabriquent au premier lancement de `Galerie.app`.

Un dépôt cloné avec git s'ouvre directement. S'il a été téléchargé en .zip
depuis le site de GitHub, macOS bloque `Galerie.app` au premier lancement :
Réglages Système → Confidentialité et sécurité → « Ouvrir quand même ».

## Ancien historique

Le dépôt a été repris de zéro en novembre 2026 pour ne plus contenir les
photos. L'ancien historique (826 Mo, originaux compris) est sauvegardé dans
`historique-git-ancien.bundle`, ignoré par git. Pour le consulter :

```bash
git clone historique-git-ancien.bundle /tmp/ancien-historique
```

Une fois rassuré, ce fichier peut être supprimé.
