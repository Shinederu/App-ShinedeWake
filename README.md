# ShinedeWake

Frontend React/Vite du panel Wake-on-LAN Shinede.

Documentation mise a jour le 2026-06-26.

## Role

ShinedeWake permet aux utilisateurs autorises de:

- consulter les machines reveillables;
- envoyer une commande Wake-on-LAN via l'API proprietaire Wake;
- consulter l'etat de puissance estime par l'API Wake;
- visualiser les informations Corelink des machines liees;
- demander l'extinction Corelink autorisee (`shutdown`) quand une machine liee est allumee;
- maintenir les machines, leurs composants materiels et les acces utilisateurs quand ils ont les droits de gestion.

Le frontend ne fait jamais de Wake-on-LAN directement, ne se connecte pas a MySQL
et n'ecrit pas dans les tables d'un autre projet. Toute action metier passe par
une API proprietaire.

## Repo et deploiement

- Source DEV: `P:\DEV\GitHub\App-ShinedeWake`
- Runtime PROD: `P:\PROD\ShinedeWake`
- URL publique attendue: `https://wake.shinederu.ch`
- API Wake: `https://api.shinederu.ch/wake/`
- API Auth: `https://api.shinederu.ch/auth/`
- API Corelink: `https://api.shinederu.ch/corelink/`
- Backend source: `P:\DEV\GitHub\App-ShinedeWake-API`
- Branche normale: `main`

Le deploiement frontend copie uniquement le contenu de `dist\` vers
`P:\PROD\ShinedeWake`.

## Structure

- `src\App.tsx`: application principale, chargement des donnees, actions Wake/Corelink et editeur machines.
- `src\lib\api.ts`: client HTTP Wake.
- `src\lib\corelinkApi.ts`: client HTTP Corelink.
- `src\lib\authClient.ts`: client auth commun.
- `src\types\api.ts`: types de l'API Wake.
- `src\types\corelink.ts`: types lus depuis Corelink.
- `src\components\LoginPanel.tsx`: panneau de connexion.
- `src\components\UserAccessPanel.tsx`: gestion des acces Wake.
- `src\index.css`: styles de l'application.
- `public\`: assets publics inclus au build.
- `dist\`: artefacts generes par Vite, seuls fichiers deployables en PROD.

## Endpoints consommes

Wake:

- `GET https://api.shinederu.ch/wake/?action=status`
- `GET https://api.shinederu.ch/wake/?action=listDevices`
- `POST https://api.shinederu.ch/wake/?action=wakeDevice`
- `POST https://api.shinederu.ch/wake/?action=createDevice`
- `PUT https://api.shinederu.ch/wake/?action=updateDevice`
- `DELETE https://api.shinederu.ch/wake/?action=deleteDevice`
- `GET https://api.shinederu.ch/wake/?action=listUsers`
- `PUT https://api.shinederu.ch/wake/?action=updateUserPermissions`

Corelink:

- `GET https://api.shinederu.ch/corelink/?action=status`
- `GET https://api.shinederu.ch/corelink/?action=getMachine&machine_key=<key>`
- `GET https://api.shinederu.ch/corelink/?action=listJobs&machine_key=<key>&status=active&limit=5`
- `POST https://api.shinederu.ch/corelink/?action=createJob`

Auth:

- Consomme indirectement par `@shinederu/auth-core` via `VITE_SHINEDERU_API_AUTH_URL`.

Toutes les requetes navigateur utilisent `credentials: include` pour transmettre
le cookie de session `sid`.

## Authentification et permissions

- Auth commune via `Module-Auth-Core` et `Module-Auth-React`.
- Cookie session attendu: `sid` sur `.shinederu.ch`.
- Le frontend affiche ou masque les controles selon les flags renvoyes par les APIs, mais les backends restent l'autorite.
- Les comptes bannis sont refuses cote API Wake si `users.is_banned` existe.

Permissions Wake stables:

- `wake.devices.wake`: acces au panel Wake et envoi WOL.
- `wake.devices.manage`: creation, edition et suppression des machines.
- `wake.users.manage`: gestion des acces utilisateurs Wake.

Permissions Corelink:

- Le frontend lit seulement `corelink.status.can_view` et `corelink.status.can_execute_jobs`.
- Les droits Corelink ne sont pas geres par Wake.
- L'action d'extinction Corelink est disponible uniquement quand la machine Wake possede un `corelink_machine_key`, que l'agent est en ligne, qu'aucun job actif ne bloque l'action, et que l'utilisateur a les droits Corelink requis.

## Base de donnees

Le frontend n'accede pas a MySQL.

Les tables Wake sont documentees dans le README de
`P:\DEV\GitHub\App-ShinedeWake-API`:

- `wake_devices`
- `wake_device_components`
- `wake_user_permissions` legacy
- tables partagees `users`, `auth_sessions`, `core_*`

Le champ `wake_devices.corelink_machine_key` relie optionnellement une machine
Wake a une machine Corelink. Wake reste proprietaire du reveil WOL; Corelink
reste proprietaire des jobs machine.

## Dossiers runtime et fichiers partages

- PROD public: `P:\PROD\ShinedeWake`
- Aucun stockage persistant frontend.
- Aucun dossier partage avec Wake API, Corelink ou Arcadia.

Ne jamais copier en PROD:

- `.git`, `.github`
- `README.md`, `AGENTS.md`
- `.env*`
- `src\`
- `node_modules\`
- `package*.json`
- `tsconfig*.json`, `vite.config.ts`
- caches, tests, brouillons, exports temporaires

## Temps reel et evenements

Le frontend ne s'abonne pas encore a Mercure.

Etat actuel:

- rafraichissement HTTP silencieux toutes les 15 secondes quand l'onglet est visible;
- resynchronisation possible via `status`, `listDevices`, puis snapshot Corelink;
- publication Mercure faite cote API Wake seulement apres une commande `wakeDevice` ou un reveil interne.

Evenements publies par l'API Wake:

- `wake.device.wake_requested`
- `wake.device.wake_succeeded`
- `wake.device.wake_failed`

Topics:

- `https://api.shinederu.ch/wake/topics/devices`
- `https://api.shinederu.ch/wake/topics/devices/{DEVICE_ID}`

Mercure ne doit pas servir a declencher une commande critique. Une future
integration frontend Mercure devra toujours garder une resynchronisation HTTP.

## Dependances inter-projets

- `App-ShinedeWake-API`: proprietaire des machines, permissions Wake, WOL, ping et evenements Mercure.
- `Module-Auth-API`: session `sid`, utilisateurs et authentification commune.
- `Module-Auth-Core`: client auth TypeScript.
- `Module-Auth-React`: bindings React pour le contexte auth.
- `App-Corelink-API`: etat agent, metriques et jobs controles des machines liees.

Le build utilise des alias Vite vers les modules voisins:

- `P:\DEV\GitHub\Module-Auth-Core\src`
- `P:\DEV\GitHub\Module-Auth-React\src`

Ces modules doivent etre presents dans le workspace pour `npm run build`.

## Configuration

Fichiers publics suivis:

- `.env.example`
- `.env.development`
- `.env.production`

Variables Vite:

- `VITE_SHINEDERU_API_AUTH_URL`
- `VITE_SHINEDEWAKE_API_URL`
- `VITE_CORELINK_API_URL`

Valeurs attendues en production:

```text
VITE_SHINEDERU_API_AUTH_URL=https://api.shinederu.ch/auth/
VITE_SHINEDEWAKE_API_URL=https://api.shinederu.ch/wake/
VITE_CORELINK_API_URL=https://api.shinederu.ch/corelink/
```

Ces valeurs sont publiques. Ne jamais ajouter de token, mot de passe ou secret
dans un `.env` frontend.

## Verifications

```powershell
cd P:\DEV\GitHub\App-ShinedeWake
npm run build
git -c safe.directory=* diff --check
rg -n "password|passwd|secret|BEGIN (RSA|OPENSSH|PRIVATE)|api_key|token" P:\DEV\GitHub\App-ShinedeWake
```

Smoke test manuel conseille apres build/deploiement:

1. ouvrir `https://wake.shinederu.ch`;
2. verifier la connexion via auth commune;
3. verifier `status` et `listDevices`;
4. reveiller une machine autorisee;
5. ouvrir l'editeur machine si `wake.devices.manage`;
6. verifier les permissions utilisateurs si `wake.users.manage`;
7. verifier le panneau Corelink sur une machine liee;
8. confirmer que le bouton principal devient `Eteindre` quand la machine est allumee;
9. confirmer que les boutons `Mesurer` et `Redemarrer` ne sont plus visibles.

Le bouton `Veille` n'est pas expose dans l'interface Wake.

## Deploiement

```powershell
cd P:\DEV\GitHub\App-ShinedeWake
npm run build
```

Copier ensuite uniquement le contenu de `dist\` vers `P:\PROD\ShinedeWake`.

Avant de supprimer d'anciens assets, verifier que le nouvel `index.html` ne les
reference plus. Ne pas deployer les sources, fichiers de dev ou documentation en
PROD.

## Notes de reprise

- Etat documente le 2026-06-26.
- Les derniers changements durables connus concernent l'integration Corelink,
  le retrait des boutons `Veille`, `Mesurer` et `Redemarrer`, le bouton
  principal `Eteindre` quand une machine est allumee, l'affichage du pourcentage
  de stockage Corelink, et l'endpoint interne Wake cote API pour les appels
  Arcadia/Corelink.
- Si une correction urgente a ete faite directement en PROD, comparer le contenu
  et les dates avant de redeployer.
