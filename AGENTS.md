# Guide Agents - ShinedeWake

Ce depot contient le frontend React/Vite du panel Wake et sa PWA mobile separee.
Wake est l'interface unique pour le reveil, l'observation de l'agent systeme et
l'arret controle des machines. Le projet doit rester deployable dans
`P:\PROD\ShinedeWake` uniquement sous forme d'artefacts `dist\`.

Documentation mise a jour le 2026-09-25.

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

- `src\App.tsx`: logique d'application et UI principale.
- `src\MobileApp.tsx`: UI minimale chargee uniquement sous `/mobile/`.
- `src\mobile.tsx` et `src\mobile.css`: entree et styles mobiles isoles.
- `mobile\index.html`: seconde entree HTML.
- `src\lib\api.ts`: client Wake unique pour les appareils et actions machine.
- `src\lib\authClient.ts`: client auth commun.
- `src\types\api.ts`: contrat Wake, y compris `device.agent`.
- `src\components\`: composants React.
- `src\index.css`: styles.
- `public\`: assets publics.
- `public\mobile\`: manifeste, worker et icones de la PWA mobile.
- `public\sw.js`: tombstone de desinscription de l'ancienne PWA racine.
- `vite.mobile.config.ts`: build mobile avec base `/mobile/`.
- `dist\`: build Vite, a ne pas modifier a la main.

## Auth et permissions

- Auth via `Module-Auth-Core` et `Module-Auth-React`.
- Cookie session: `sid`.
- Le frontend reflete `status.can_wake`, `status.can_shutdown`,
  `status.can_manage_devices`, `status.can_manage_users` et le resume
  `status.can_manage`, mais ne decide jamais l'autorisation finale.
- Permissions Wake stables:
  - `wake.devices.wake`
  - `wake.devices.shutdown`
  - `wake.devices.manage`
  - `wake.users.manage`
- Aucune connexion DB cote frontend.

## Agent systeme

La liaison technique reste stockee dans `corelink_machine_key` pour compatibilite
DB, mais l'interface emploie les termes `Agent systeme` et `Cle de liaison
agent`.

`listDevices` fournit directement `device.agent`, avec:

- etat et derniere presence;
- dernieres metriques CPU, RAM, GPU, disques et uptime;
- jobs d'arret actifs.

Le bouton d'arret utilise uniquement `POST ?action=shutdownDevice`. Il doit etre
actif seulement si l'utilisateur possede `wake.devices.shutdown`, si l'agent
lie est en ligne et si aucun arret n'est deja actif. Ne pas reintegrer un client
Corelink separe ni les actions veille, redemarrage ou mesure sans demande
explicite.

Le panneau Agent systeme du desktop doit rester entierement masque lorsque
`device.power_state` n'est pas strictement `online`. Le stockage est affiche en
`utilise / total`, en Go sous 1 To et en To a partir de 1 To.

## PWA mobile

- `/` reste le panel complet historique sans redirection par largeur d'ecran.
- `/mobile/` est une seconde application minimale avec une tuile par machine.
- Rouge = `offline`, vert = `online`, orange = transition, gris = `unknown`.
- Le reveil passe immediatement en orange puis attend un etat strict `online`.
- L'arret exige confirmation, permission, liaison et agent en ligne.
- Le manifeste, le worker, les icones, les bundles et le stockage transitoire
  portent tous un perimetre mobile distinct.
- Le worker `/mobile/sw.js` a le scope `/mobile/` et ne doit jamais controler `/`.
- Ne jamais cacher/rejouer les appels API ni utiliser Background Sync.
- Polling 15 secondes stable, 3 secondes en transition, uniquement onglet visible.

## Temps reel

- Rafraichissement HTTP silencieux toutes les 15 secondes quand l'onglet est
  visible.
- L'API Wake publie des evenements Mercure `wake.device.*`, mais ce frontend ne
  s'y abonne pas encore.
- Toute future integration Mercure doit garder une resynchronisation HTTP via
  `status` et `listDevices`.

## Verifications

Le frontend utilise React 19.3, Vite 8.3 et TypeScript 7.0. Les builds sont
verifies avec Node.js 24 LTS. Utiliser `npm ci` pour reproduire le lockfile.
Garder `resolve.dedupe` pour React/React DOM dans les deux configs Vite afin
d'eviter une seconde instance issue des modules Auth voisins.

```powershell
cd P:\DEV\GitHub\App-ShinedeWake
npm run build
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
- `/` conserve le dashboard, la gestion et les metriques sans worker mobile;
- `/mobile/` couvre reveil, confirmation d'arret, transitions et etat inconnu;
- le shell mobile fonctionne hors ligne sans rendre les commandes actionnables.

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

Le panel racine doit conserver l'interface historique. Le second build ecrit
dans `dist\mobile\` sans vider `dist`. En production, copier les assets mobiles
avant `mobile\index.html` et `mobile\sw.js`; conserver le tombstone historique
versionne `/sw.js` tant que d'anciennes inscriptions de scope `/` peuvent
subsister.
