# ShinedeWake

PWA React/Vite minimaliste pour allumer et eteindre les machines autorisees.

Documentation mise a jour le 2026-09-14.

## Role

L'ecran authentifie affiche uniquement un fond et une grande tuile par machine
active:

- rouge: machine `offline`, un appui envoie le Wake-on-LAN;
- vert: machine `online`, un appui ouvre la confirmation d'extinction;
- orange: demarrage ou extinction en attente;
- gris: etat `unknown`, aucune action n'est envoyee.

La couleur se base strictement sur `device.power_state`. L'etat Corelink ne
decide jamais si une machine apparait allumee; `device.agent.is_online` reste
uniquement une precondition de securite avant de proposer l'extinction.

Les metriques, composants, IP, MAC et panneaux de gestion ne sont plus affiches
dans cette telecommande. Les appareils desactives sont masques.

## Repo et deploiement

- Source DEV: `P:\DEV\GitHub\App-ShinedeWake`
- Runtime PROD: `P:\PROD\ShinedeWake`
- URL publique: `https://wake.shinederu.ch`
- API Wake: `https://api.shinederu.ch/wake/`
- API Auth: `https://api.shinederu.ch/auth/`
- Backend source: `P:\DEV\GitHub\App-ShinedeWake-API`
- Branche normale: `main`

Le deploiement copie uniquement le contenu genere de `dist\` vers
`P:\PROD\ShinedeWake`.

## Structure

- `src\App.tsx`: authentification, rafraichissement et telecommande machines.
- `src\index.css`: interface plein ecran, tuiles et modale responsive.
- `src\lib\api.ts`: client HTTP Wake.
- `src\lib\authClient.ts`: client auth commun.
- `src\types\api.ts`: contrats de l'API Wake.
- `src\components\LoginPanel.tsx`: connexion lorsque la session est absente.
- `public\manifest.webmanifest`: manifeste installable.
- `public\sw.js`: cache du shell statique uniquement.
- `public\icons\`: icones PWA, maskable et Apple.
- `dist\`: artefacts Vite deployables.

Les anciens helpers de gestion restent dans le client/types pour compatibilite,
mais l'ecran minimal ne les appelle plus.

## Endpoints consommes

- `GET https://api.shinederu.ch/wake/?action=status`
- `GET https://api.shinederu.ch/wake/?action=listDevices`
- `POST https://api.shinederu.ch/wake/?action=wakeDevice`
- `POST https://api.shinederu.ch/wake/?action=shutdownDevice`

Toutes les requetes utilisent `credentials: include` pour le cookie `sid`. Le
navigateur n'appelle jamais directement `/corelink/`.

## Etats et transitions

### Reveil

Un appui sur une tuile rouge:

1. passe immediatement la tuile en orange;
2. envoie une seule requete `wakeDevice`;
3. rafraichit toutes les 3 secondes;
4. passe en vert uniquement lorsque l'API retourne `power_state=online`.

L'attente est conservee dans `localStorage` pour survivre a une relance courte de
la PWA. Elle expire apres 120 secondes sans nouvel envoi automatique.

### Extinction

Un appui sur une tuile verte ouvre une modale accessible:

```text
Eteindre <machine> ?
Etes-vous sur de vouloir eteindre cet ordinateur ?
Non | Oui, eteindre
```

Le focus initial est place sur `Non`; Echap et le clic sur le fond annulent. La
requete `shutdownDevice` n'est envoyee qu'apres `Oui, eteindre`, avec permission
`wake.devices.shutdown`, liaison agent et agent en ligne. La tuile reste orange
jusqu'au retour `power_state=offline`.

Les jobs d'extinction actifs fournis par l'API rendent aussi la tuile orange et
empechent les doublons.

## Authentification et permissions

- Auth commune via `Module-Auth-Core` et `Module-Auth-React`.
- Cookie attendu: `sid` sur `.shinederu.ch`.
- `wake.devices.wake`: acces a la liste et reveil.
- `wake.devices.shutdown`: extinction via l'agent lie.
- Le backend reste l'autorite finale pour chaque commande.

Sans session, le formulaire de connexion est affiche. Sans droit Wake, l'ecran
affiche un refus d'acces. Une deconnexion discrete reste disponible en haut a
droite.

## Base de donnees

Le frontend n'accede jamais a MySQL. Les tables et migrations appartiennent a
`App-ShinedeWake-API`; le frontend ne connait que son contrat JSON.

## PWA et fonctionnement hors ligne

Le manifeste declare:

- `start_url` et `scope` a `/`;
- affichage `standalone`;
- icones PNG 192 x 192 et 512 x 512;
- icone maskable 512 x 512;
- couleurs de lancement alignees sur le fond de l'application.

Le service worker met uniquement en cache le shell HTML/CSS/JS et les icones.
Les appels a `api.shinederu.ch`, l'authentification, l'etat des machines et les
POST Wake/extinction restent strictement reseau. Il n'existe ni cache API, ni
Background Sync, ni rejeu differe d'une commande.

Lors d'une modification du service worker, du manifeste ou des icones, incrementer
la version `shinedewake-shell-vN` dans `public\sw.js`. Les bundles Vite hashes sont
eux actualises et nettoyes a chaque navigation reussie.

## Temps reel

Le frontend utilise une resynchronisation HTTP:

- toutes les 15 secondes en etat stable;
- toutes les 3 secondes pendant une transition;
- uniquement lorsque l'onglet est visible;
- immediatement au retour de visibilite.

L'API publie des evenements Mercure, mais cette PWA ne s'y abonne pas. Toute
future integration doit conserver la resynchronisation HTTP.

## Dependances inter-projets

- `App-ShinedeWake-API`: statut, appareils, WOL et extinction.
- `Module-Auth-API`: session et utilisateurs.
- `Module-Auth-Core`: client auth TypeScript.
- `Module-Auth-React`: contexte React d'authentification.
- `App-Corelink-API`: passerelle agent cote serveur, jamais appelee directement.

Le build utilise des alias Vite vers les sources locales `Module-Auth-Core` et
`Module-Auth-React`.

## Configuration

Variables Vite publiques:

- `VITE_SHINEDERU_API_AUTH_URL`
- `VITE_SHINEDEWAKE_API_URL`

Valeurs de production:

```text
VITE_SHINEDERU_API_AUTH_URL=https://api.shinederu.ch/auth/
VITE_SHINEDEWAKE_API_URL=https://api.shinederu.ch/wake/
```

Ne jamais ajouter de token, mot de passe ou secret dans un `.env` frontend.

## Verifications

```powershell
cd P:\DEV\GitHub\App-ShinedeWake
npm run build
node --check public\sw.js
git -c safe.directory=* diff --check
```

Smoke test:

1. verifier la connexion commune;
2. verifier rouge pour `offline`, vert pour `online`, gris pour `unknown`;
3. verifier le passage immediat rouge vers orange puis orange vers vert;
4. verifier que le vert ouvre la modale et que `Non` n'envoie rien;
5. confirmer une extinction autorisee puis verifier orange vers rouge;
6. verifier les refus sans permission ou agent en ligne;
7. verifier l'installation PWA et l'absence de cache/rejeu API.

## Deploiement

```powershell
cd P:\DEV\GitHub\App-ShinedeWake
npm run build
```

Copier uniquement le contenu de `dist\` vers `P:\PROD\ShinedeWake`. Ne pas
deployer `.git`, les sources, `.env*`, `node_modules`, docs, tests ou caches.
Avant de supprimer d'anciens assets hashes, verifier que le nouvel `index.html`
ne les reference plus.

## Notes de reprise

- Interface PWA minimaliste depuis le 2026-09-14.
- Wake reste l'unique API navigateur et Corelink reste strictement technique.
- Aucune capacite API, DB ou agent n'a ete ajoutee pour cette refonte.
