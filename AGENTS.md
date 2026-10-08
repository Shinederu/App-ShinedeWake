# Guide Agents - ShinedeWake

Ce depot contient le frontend React/Vite du panel Wake, installable en PWA.
Wake est l'interface unique pour le reveil, l'observation de l'agent systeme et
l'arret controle des machines. Le projet doit rester deployable dans
`P:\PROD\ShinedeWake` uniquement sous forme d'artefacts `dist\`.

Documentation mise a jour le 2026-10-08.

## Lecture de demarrage

1. Lire `P:\AGENTS.md`.
2. Lire `P:\ECOSYSTEM.md`.
3. Lire `P:\README.md`.
4. Lire `P:\DEV\GitHub\README.md`.
5. Lire `P:\DEV\GitHub\AGENTS.md`.
6. Lire ce fichier.
7. Lire `README.md`.
8. Lire `P:\DEV\GitHub\App-ShinedeWake-API\README.md` si le changement touche
   endpoints, permissions, DB, logs, Mercure ou contrat d'agent systeme.

## Perimetre

- Projet courant: `App-ShinedeWake`.
- Frontend PROD: `P:\PROD\ShinedeWake`.
- Backend associe: `App-ShinedeWake-API`, seulement a modifier si la demande
  inclut explicitement l'API Wake.
- Ne pas modifier Corelink, Auth ou les modules partages depuis ce depot sans
  demande explicite.
- Arcadia est archive et ne fait plus partie du contrat Wake.

## Garde-fous produit

ShinedeWake est maintenu a la demande. Garder le produit limite au reveil, a
l'etat et aux metriques courantes, a l'arret controle, et a la gestion requise
des machines/acces. Ne pas en faire une plateforme RMM: aucun historique ou
analytique de metriques, alerting, terminal, scripts, controle de processus ou
services, redemarrage, veille, hibernation ou commande libre sans decision
explicite fondee sur un besoin concret.

## Source de verite

- Frontend DEV: `P:\DEV\GitHub\App-ShinedeWake`
- Frontend PROD: `P:\PROD\ShinedeWake`
- API navigateur unique: `https://api.shinederu.ch/wake/`
- API Auth: `https://api.shinederu.ch/auth/`
- Code projet: `wake`
- Branche normale: `main`

Le navigateur ne doit pas appeler directement l'API Corelink. L'API Wake
agrege l'etat technique, les dernieres metriques et les arrets actifs.

Ne pas modifier directement `P:\PROD\ShinedeWake` pour un changement durable.
Modifier en DEV, builder, commit/push, puis deployer `dist\` si necessaire.

## Structure utile

- `src\App.tsx`: logique et UI complete uniques, navigateur et PWA.
- `src\main.tsx`: entree React, enregistrement du worker racine en production
  et nettoyage cible de l'ancienne installation mobile.
- `src\lib\api.ts`: client Wake unique pour les appareils et actions machine.
- `src\lib\authClient.ts`: client auth commun.
- `src\types\api.ts`: contrat Wake, y compris `device.agent`.
- `src\components\`: composants React.
- `src\index.css`: styles.
- `public\`: assets publics.
- `public\manifest.json` et `public\icons\`: manifeste et icones de la PWA.
- `public\sw.js`: modele du worker racine; sa liste de fichiers et son nom de
  cache sont injectes au build.
- `public\mobile\`: compatibilite seulement: redirection, ancien manifeste,
  tombstone du worker mobile et icones historiques.
- `vite.config.ts` et `build\pwa.ts`: build unique et generation du worker final
  dans `closeBundle` (hash de version et liste explicite des fichiers statiques).
- `dist\`: build Vite, a ne pas modifier a la main.

## Auth et permissions

- Auth via `Module-Auth-Core` et `Module-Auth-React`.
- Cookie session: `sid`.
- Le frontend reflete `status.can_wake`, `status.can_shutdown`,
  `status.can_manage_devices`, `status.can_manage_users` et le resume
  `status.can_manage`, mais ne decide jamais l'autorisation finale.
- Permissions Wake stables:
  - `wake.devices.<id>.wake` (voir et allumer un ordinateur precis)
  - `wake.devices.shutdown`
  - `wake.devices.manage`
  - `wake.users.manage`
- Aucune connexion DB cote frontend.
- `can_wake` resume l'acces a au moins un ordinateur, pas un droit universel.
- `listDevices` est filtree cote serveur. Ne jamais ajouter une machine a
  partir d'une reponse CRUD/commande sans relire cette liste.
- Les droits de gestion seuls ne donnent pas acces aux machines. Seul l'admin
  global Core garde un bypass complet.
- Les acces se gerent dans les permissions du domaine
  (`https://shinederu.ch/permissions`), projet Wake. Ne pas restaurer l'ancien
  editeur global ni les appels `listUsers`/`updateUserPermissions`.
- Effacer les cartes, donnees d'edition et confirmations lors d'une revocation;
  ignorer les reponses en vol anterieures a une invalidation de session/droits.
- Pour une machine existante, l'identite technique (MAC, IP, broadcast, port,
  liaison agent) est en lecture seule hors admin global Core. Ne pas permettre
  a un gestionnaire de rediriger son acces vers un autre ordinateur. La creation
  reste possible avec le droit de gestion, mais n'accorde aucun acces implicite.

## Agent systeme

La liaison technique reste stockee dans `corelink_machine_key` pour compatibilite
DB, mais l'interface emploie les termes `Agent systeme` et `Cle de liaison
agent`.

`listDevices` fournit directement `device.agent`, avec:

- etat et derniere presence;
- dernieres metriques CPU, RAM, GPU, disques et uptime;
- jobs d'arret actifs.

Le bouton d'arret utilise uniquement `POST ?action=shutdownDevice`. Il doit etre
actif seulement si l'ordinateur lui est autorise, si l'utilisateur possede
`wake.devices.shutdown`, si l'agent
lie est en ligne et si aucun arret n'est deja actif. Ne pas reintegrer un client
Corelink separe ni les actions veille, redemarrage ou mesure sans demande
explicite.

Le panneau Agent systeme du desktop doit rester entierement masque lorsque
`device.power_state` n'est pas strictement `online`. Le stockage est affiche en
`utilise / total`, en Go sous 1 To et en To a partir de 1 To.

## PWA unique et compatibilite mobile

Le site complet `/` dispose de surcharges responsive dans `src/index.css`
limitees a 768 px. La PWA utilise exactement cette meme interface. Garder le
rendu historique au-dessus de cette largeur. Le chargement des ordinateurs doit rester
visible au demarrage/apres connexion et lors d'une actualisation explicite, sans
afficher prematurement une liste vide ni animer le polling silencieux.

- `/` est l'unique application complete, sans redirection par largeur d'ecran.
- `/mobile/` redirige vers `/`; ne pas recreer de seconde application ou build.
- Une fois actif, le worker racine redirige aussi les chemins exacts `/mobile`,
  `/mobile/` et `/mobile/index.html` vers `/`, y compris hors ligne.
- Le manifeste principal est `/manifest.json`, avec `start_url` et `scope` a `/`.
  Son `id` reste `/mobile/` uniquement pour conserver l'identite d'installation
  historique; ce n'est ni une route d'application ni le scope du worker.
- `/mobile/manifest.json` reste disponible avec un contenu equivalent pour les
  anciennes installations. Preserver aussi les anciennes icones mobiles.
- `src/main.tsx` enregistre `/sw.js` avec le scope `/` en production. Ne jamais
  reutiliser l'ancien nettoyage qui desinscrivait le worker racine.
- `/mobile/sw.js` est un tombstone: purge cible des caches mobiles, desinscription
  du worker mobile et navigation des seuls clients `/mobile/` vers `/`.
- Le nettoyage de l'entree React cible seulement l'ancienne inscription mobile
  et les anciens stockages de transitions Wake; pas les sessions ni les caches
  d'autres applications.
- Le worker racine utilise `shinedewake-full-shell-<buildhash>` et une liste
  explicite de fichiers statiques generee au build. `/` et `/index.html` sont
  traites en network-first, avec `/index.html` comme repli hors ligne; seuls les
  fichiers statiques prelistes utilisent cache-first.
- Ne jamais mettre en cache les API Wake/Auth, les sessions, les donnees machines
  ou les commandes. Aucun rejeu, file hors ligne ou Background Sync.
- Le client Wake utilise aussi `cache: "no-store"` pour ses appels HTTP.
- Polling HTTP toutes les 15 secondes, uniquement onglet visible; les droits
  serveur, l'authentification et les conditions d'arret ne changent pas en PWA.

## Temps reel

- Rafraichissement HTTP silencieux toutes les 15 secondes quand l'onglet est
  visible.
- Les publications Mercure Wake sont suspendues tant qu'un contrat d'abonnement
  par ordinateur n'existe pas. Le frontend ne s'y abonne pas.
- Toute future integration Mercure doit garder une resynchronisation HTTP via
  `status` et `listDevices`.

## Verifications

Le frontend utilise React 19.3, Vite 8.3 et TypeScript 7.0. Les builds sont
verifies avec Node.js 24 LTS. Utiliser `npm ci` pour reproduire le lockfile.
Garder `resolve.dedupe` pour React/React DOM dans la configuration Vite afin
d'eviter une seconde instance issue des modules Auth voisins.

```powershell
cd P:\DEV\GitHub\App-ShinedeWake
npm run build
npm run test:pwa
node --check dist\sw.js
node --check public\mobile\sw.js
git -c safe.directory=* diff --check
rg -n "password|passwd|secret|BEGIN (RSA|OPENSSH|PRIVATE)|api_key|token" P:\DEV\GitHub\App-ShinedeWake
```

Smoke test conseille:

- connexion via auth commune;
- liste machines et etat agent integre;
- reveil d'une machine autorisee;
- extinction via Wake sur un agent lie et en ligne;
- refus ou bouton desactive sans permission, agent en ligne ou liaison;
- edition machine et composants si gestionnaire;
- panneau permissions si gestionnaire;
- absence d'appel navigateur vers `/corelink/`;
- absence des actions veille, mesure et redemarrage.
- navigateur et PWA conservent le dashboard complet, la gestion et les metriques;
- `/mobile/` redirige vers `/`, y compris apres migration d'une ancienne PWA;
- le worker racine et son cache statique fonctionnent hors ligne sans cache API;
- les reponses refusees et les permissions par ordinateur restent appliquees;
- les tests de commandes utilisent des reponses simulees, sans reveil ni arret reel.

## Deploiement

Copier uniquement le contenu de `dist\` vers `P:\PROD\ShinedeWake`.

Ne pas deployer:

- `.git`, `.github`
- `README.md`, `AGENTS.md`
- `.env*`
- `src\`
- `node_modules\`
- `package*.json`
- `tsconfig*.json`, `vite.config.ts`
- tests, caches, brouillons, exports temporaires

Preserver uniquement les artefacts publics necessaires (`index.html`, `assets\`,
`favicon.png` ou autres fichiers publics issus du build).

Le build unique produit le panel complet installable a la racine. Copier les
assets et icones avant les fichiers HTML et manifestes. Verifier que tous les
fichiers de la liste de precache sont presents, puis publier les workers en
dernier; ne pas deployer le modele `public/sw.js` sans l'injection du build.

Le deploiement est additif: conserver les fichiers de compatibilite
`mobile/index.html`, `mobile/manifest.json`, `mobile/sw.js`, `mobile/icons/` et
les anciens `mobile/assets/` encore utiles aux clients non migres. Ne pas
supprimer recursivement `mobile/`, ni synchroniser avec suppression automatique.
Un nettoyage ulterieur exige une verification ciblee des references et des
clients; les bundles devenus inutiles pourront alors etre archives hors de
`PROD`, de facon recuperable.

La migration d'une ancienne PWA exige une connexion et peut demander une
reouverture; l'ancien cache peut encore apparaitre avant la mise a jour. L'id
`/mobile/` preserve l'installation mobile recente, mais une tres ancienne PWA
racine identifiee par `/` peut rester une installation distincte du navigateur.
