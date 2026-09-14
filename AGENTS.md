# Guide Agents - ShinedeWake

Ce depot contient la PWA React/Vite minimaliste de Wake. L'ecran operationnel
affiche uniquement une grande tuile par machine active pour le reveil et l'arret
controle. Le projet doit rester deployable dans `P:\PROD\ShinedeWake`
uniquement sous forme d'artefacts `dist\`.

Documentation mise a jour le 2026-09-14.

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

- `src\App.tsx`: auth, liste, transitions et modale d'extinction.
- `src\lib\api.ts`: client Wake unique pour les appareils et actions machine.
- `src\lib\authClient.ts`: client auth commun.
- `src\types\api.ts`: contrat Wake, y compris `device.agent`.
- `src\components\LoginPanel.tsx`: connexion hors session.
- `src\index.css`: tuiles plein ecran, modale et responsive.
- `public\manifest.json`: contrat d'installation PWA.
- `public\sw.js`: cache du shell statique uniquement.
- `public\icons\`: icones PWA, maskable et Apple.
- `dist\`: build Vite, a ne pas modifier a la main.

Incrementer `shinedewake-shell-vN` dans `public\sw.js` lorsque le worker, le
manifeste ou une icone change. Les caches d'autres applications partageant
l'origine ne doivent jamais etre supprimes.

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

## Etats et agent systeme

- Rouge uniquement pour `device.power_state=offline`.
- Vert uniquement pour `device.power_state=online`.
- Gris pour `device.power_state=unknown`; ne pas deviner l'etat.
- Orange pendant un reveil ou un arret en cours.

La couleur ne doit jamais etre calculee depuis `device.agent.is_online`.
Corelink reste une precondition de l'arret: permission
`wake.devices.shutdown`, cle de liaison, agent en ligne et aucun job actif.
L'ecran ne montre plus les metriques ou details de l'agent.

Une transition locale est conservee au plus 120 secondes dans `localStorage`.
Elle sert uniquement a l'affichage et ne doit jamais rejouer une commande.

## Temps reel

- Rafraichissement HTTP silencieux toutes les 15 secondes en etat stable et
  toutes les 3 secondes pendant une transition, quand l'onglet est visible.
- L'API Wake publie des evenements Mercure `wake.device.*`, mais ce frontend ne
  s'y abonne pas encore.
- Toute future integration Mercure doit garder une resynchronisation HTTP via
  `status` et `listDevices`.

## Verifications

```powershell
cd P:\DEV\GitHub\App-ShinedeWake
npm run build
node --check public\sw.js
git -c safe.directory=* diff --check
rg -n "password|passwd|secret|BEGIN (RSA|OPENSSH|PRIVATE)|api_key|token" P:\DEV\GitHub\App-ShinedeWake
```

Smoke test conseille:

- connexion via auth commune;
- tuiles rouge `offline`, verte `online`, grise `unknown`;
- reveil rouge -> orange -> vert;
- modale verte avec focus initial sur `Non` et annulation sans requete;
- extinction confirmee verte -> orange -> rouge;
- refus sans permission, agent en ligne ou liaison;
- absence d'appel navigateur vers `/corelink/`;
- absence des actions veille, mesure et redemarrage;
- PWA installable avec icones 192/512;
- aucun cache API, Background Sync ou rejeu differe.

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
