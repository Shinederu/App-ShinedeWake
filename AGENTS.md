# Guide Agents - ShinedeWake

Ce depot contient le frontend React/Vite du panel Wake-on-LAN. Il doit rester
deployable dans `P:\PROD\ShinedeWake` uniquement sous forme d'artefacts `dist\`.

Documentation mise a jour le 2026-06-26.

## Lecture de demarrage

1. Lire `P:\AGENTS.md`.
2. Lire `P:\ECOSYSTEM.md`.
3. Lire `P:\README.md`.
4. Lire `P:\DEV\GitHub\README.md`.
5. Lire `P:\DEV\GitHub\AGENTS.md`.
6. Lire ce fichier.
7. Lire `README.md`.
8. Lire `P:\DEV\GitHub\App-ShinedeWake-API\README.md` si le changement touche endpoints, permissions, DB, logs, Mercure ou integrations Corelink/Arcadia.

## Perimetre

- Projet courant: `App-ShinedeWake`.
- Frontend PROD: `P:\PROD\ShinedeWake`.
- Backend associe: `App-ShinedeWake-API`, seulement a modifier si l'utilisateur inclut explicitement l'API Wake dans la demande.
- Ne pas modifier Corelink, Arcadia, Auth ou les modules partages depuis ce depot. Documenter le besoin dans `P:\DEV\AI-Exchange` si un autre projet doit agir.

## Source de verite

- Frontend DEV: `P:\DEV\GitHub\App-ShinedeWake`
- Frontend PROD: `P:\PROD\ShinedeWake`
- API Wake: `https://api.shinederu.ch/wake/`
- API Corelink consommee: `https://api.shinederu.ch/corelink/`
- API Auth: `https://api.shinederu.ch/auth/`
- Code projet: `wake`
- Branche normale: `main`

Ne pas modifier directement `P:\PROD\ShinedeWake` pour un changement durable.
Modifier en DEV, builder, commit/push, puis deployer `dist\` si necessaire.

## Structure utile

- `src\App.tsx`: logique d'application et UI principale.
- `src\lib\api.ts`: client Wake.
- `src\lib\corelinkApi.ts`: client Corelink.
- `src\lib\authClient.ts`: client auth commun.
- `src\types\`: contrats TypeScript des APIs consommees.
- `src\components\`: composants React.
- `src\index.css`: styles.
- `public\`: assets publics.
- `dist\`: build Vite, a ne pas modifier a la main.

## Auth, permissions et DB

- Auth via `Module-Auth-Core` et `Module-Auth-React`.
- Cookie session: `sid`.
- Le backend Wake valide `auth_sessions`, `users` et `core_*`.
- Le frontend reflete `status.can_wake` et `status.can_manage`, mais ne decide jamais l'autorisation finale.
- Permissions Wake stables: `wake.devices.wake`, `wake.devices.manage`, `wake.users.manage`.
- Les permissions Corelink sont exposees par Corelink via `can_view` et `can_execute_jobs`; Wake ne les gere pas.
- Aucune connexion DB cote frontend.

## Corelink

Le frontend peut afficher les machines Corelink liees par `corelink_machine_key`
et proposer les jobs suivants:

- `collect_metrics`
- `reboot`
- `shutdown`

Le bouton `Veille` ne doit pas etre reintegre dans Wake sans demande explicite.
Un libelle de compatibilite peut rester pour afficher un ancien job `sleep`
renvoye par Corelink, mais Wake ne doit pas proposer cette action.

## Temps reel

- Rafraichissement HTTP silencieux toutes les 15 secondes quand l'onglet est visible.
- L'API Wake publie des evenements Mercure `wake.device.*`, mais ce frontend ne s'y abonne pas encore.
- Toute future integration Mercure doit garder une resynchronisation HTTP via `status` et `listDevices`.

## Verifications

```powershell
cd P:\DEV\GitHub\App-ShinedeWake
npm run build
git -c safe.directory=* diff --check
rg -n "password|passwd|secret|BEGIN (RSA|OPENSSH|PRIVATE)|api_key|token" P:\DEV\GitHub\App-ShinedeWake
```

Smoke test conseille:

- connexion via auth commune;
- liste machines;
- wake d'une machine autorisee;
- edition machine et composants si gestionnaire;
- panneau permissions si gestionnaire;
- panneau Corelink sur une machine liee;
- absence du bouton `Veille`.

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
