# ShinedeWake

Frontend React/Vite du panel Wake-on-LAN Shinede.

## Role

ShinedeWake permet aux utilisateurs autorises de consulter les machines reveillables, d'envoyer une commande Wake-on-LAN via l'API proprietaire `wake`, et aux gestionnaires de maintenir les machines et les acces utilisateurs.

Le frontend ne fait pas de Wake-on-LAN directement et n'ecrit jamais en base. Toute action metier passe par `https://api.shinederu.ch/wake/`.

## Repo et deploiement

- Source DEV: `P:\DEV\GitHub\App-ShinedeWake`
- Runtime PROD: `P:\PROD\ShinedeWake`
- API Wake: `https://api.shinederu.ch/wake/`
- API Auth: `https://api.shinederu.ch/auth/`
- Backend source: `P:\DEV\GitHub\App-ShinedeWake-API`
- Branche normale: `main`

Le deploiement frontend copie uniquement le contenu de `dist\` vers `P:\PROD\ShinedeWake`.

## Endpoints

Le frontend consomme:

- `GET https://api.shinederu.ch/wake/?action=status`
- `GET https://api.shinederu.ch/wake/?action=listDevices`
- `POST https://api.shinederu.ch/wake/?action=wakeDevice`
- `POST https://api.shinederu.ch/wake/?action=createDevice`
- `PUT https://api.shinederu.ch/wake/?action=updateDevice`
- `DELETE https://api.shinederu.ch/wake/?action=deleteDevice`
- `GET https://api.shinederu.ch/wake/?action=listUsers`
- `PUT https://api.shinederu.ch/wake/?action=updateUserPermissions`
- `GET https://api.shinederu.ch/corelink/?action=status`
- `GET https://api.shinederu.ch/corelink/?action=getMachine&machine_key=<key>`
- `GET https://api.shinederu.ch/corelink/?action=listJobs&machine_key=<key>&status=active`
- `POST https://api.shinederu.ch/corelink/?action=createJob`

## Authentification et permissions

- Auth commune via `@shinederu/auth-core` et `@shinederu/auth-react`.
- Cookie session attendu: `sid` sur `.shinederu.ch`.
- Les droits effectifs viennent de l'API Wake et de `Module-ShinedeCore-PHP`.
- Le frontend affiche ou masque les controles selon `status.can_wake` et `status.can_manage`, mais le backend reste l'autorite.

Permissions stables:

- `wake.devices.wake`: acces au panel et envoi WOL.
- `wake.devices.manage`: gestion des machines.
- `wake.users.manage`: gestion des acces Wake.

## Base de donnees

Le frontend n'accede pas a MySQL. Les tables concernees cote API sont documentees dans `P:\DEV\GitHub\App-ShinedeWake-API\README.md`:

- `wake_devices`
- `wake_device_components`
- `wake_user_permissions` legacy
- tables partagees `users`, `auth_sessions`, `core_*`

## Dossiers runtime et fichiers partages

- PROD public: `P:\PROD\ShinedeWake`.
- Aucun dossier de stockage persistant n'est requis pour le frontend.
- Ne jamais copier `src\`, `node_modules\`, `.git`, `.env.*`, docs ou caches en PROD.

## Temps reel et evenements

Le frontend utilise actuellement un rafraichissement HTTP silencieux toutes les 15 secondes quand l'onglet est visible. Il peut se resynchroniser via `status` et `listDevices`.

L'API Wake publie des evenements Mercure best-effort apres `wakeDevice`:

- `wake.device.wake_requested`
- `wake.device.wake_succeeded`
- `wake.device.wake_failed`

Topics:

- `https://api.shinederu.ch/wake/topics/devices`
- `https://api.shinederu.ch/wake/topics/devices/{DEVICE_ID}`

Le frontend ne s'abonne pas encore a Mercure. Mercure ne doit pas servir a declencher une commande WOL.

## Dependances inter-projets

Le build utilise des alias locaux vers les modules voisins:

- `P:\DEV\GitHub\Module-Auth-Core\src`
- `P:\DEV\GitHub\Module-Auth-React\src`

Ces modules doivent etre presents dans le workspace pour `npm run build`.

## Configuration

Fichiers publics suivis:

- `.env.example`
- `.env.development`
- `.env.production`

Variables Vite:

- `VITE_SHINEDERU_API_AUTH_URL=https://api.shinederu.ch/auth/`
- `VITE_SHINEDEWAKE_API_URL=https://api.shinederu.ch/wake/`
- `VITE_CORELINK_API_URL=https://api.shinederu.ch/corelink/`

Ces valeurs sont publiques. Ne pas ajouter de secret dans les `.env` frontend.

## Verifications

```powershell
cd P:\DEV\GitHub\App-ShinedeWake
npm run build
git -c safe.directory=* diff --check
rg -n "password|passwd|secret|BEGIN (RSA|OPENSSH|PRIVATE)|api_key|token" P:\DEV\GitHub\App-ShinedeWake
```

## Deploiement

```powershell
cd P:\DEV\GitHub\App-ShinedeWake
npm run build
```

Puis copier uniquement le contenu de `dist\` vers `P:\PROD\ShinedeWake`.

Ne pas deployer:

- `.git`, `.github`
- `README.md`, `AGENTS.md`
- `.env*`
- `src\`
- `node_modules\`
- `package*.json`
- `tsconfig*.json`, `vite.config.ts`
- tests, caches, brouillons, exports temporaires

## Notes de reprise

La derniere version DEV etait plus recente que la PROD observee le 2026-06-12 avant resynchronisation. Si une correction urgente a ete faite directement en PROD, comparer le contenu et les dates avant de deployer.
