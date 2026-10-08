# ShinedeWake

Frontend React/Vite du panel Wake. Il constitue l'interface unique pour
reveiller une machine, consulter son agent systeme et demander son extinction.

Documentation mise a jour le 2026-10-08.

## Role

ShinedeWake permet aux utilisateurs autorises de:

- consulter les machines et leur etat de puissance estime;
- envoyer une commande Wake-on-LAN;
- visualiser l'etat de l'agent systeme et ses dernieres metriques CPU, RAM, GPU,
  disques et uptime;
- demander un arret controle quand l'agent lie est disponible;
- maintenir les machines et leurs composants avec les droits de gestion;
- rejoindre la gestion des acces par ordinateur dans les permissions du domaine
  avec un compte admin global Core.

Une seule interface complete est disponible dans le navigateur et en PWA
installable a la racine `/`. L'ancienne URL `/mobile/` redirige vers `/` et ne
charge plus d'application simplifiee.

Le site complet `/` garde son rendu historique au-dessus de 768 px. Sur
telephone (768 px et moins), les commandes d'en-tete sont groupees, les
informations reseau/metriques passent sur deux colonnes et les formulaires
restent utilisables sans debordement horizontal. La PWA utilise cette meme
interface et ces memes styles, sans disposition simplifiee distincte.

Un indicateur anime et un message accompagnent la verification de session puis
le chargement des ordinateurs, y compris apres connexion. Les actualisations
explicites conservent les fiches visibles pendant l'attente; le polling reste
sans animation. Un echec de chargement est distingue d'une liste vide avec un
bouton de nouvelle tentative. L'animation respecte la reduction des mouvements.

Le panneau d'etat de l'agent systeme et ses metriques n'est affiche que lorsque
l'etat de puissance Wake de la machine vaut `online`. Le stockage courant est
presente sous la forme `utilise / total`, en Go sous 1 To et en To a partir de
1 To.

Le navigateur appelle uniquement l'API Wake pour les fonctions machine. Il ne
fait jamais de Wake-on-LAN directement, ne se connecte pas a MySQL et n'appelle
plus l'API Corelink. L'API Wake agrege les informations techniques necessaires.

## Statut et non-objectifs

ShinedeWake est maintenu a la demande. Son perimetre produit reste volontairement
limite au Wake-on-LAN, a l'etat et aux metriques courantes, a l'arret controle,
ainsi qu'a la gestion necessaire des machines et acces.

ShinedeWake n'est pas une plateforme de supervision ou de prise en main distante.
Sont hors perimetre sans decision explicite: historique et analytique des
metriques, alerting, terminal distant, scripts, gestion de processus ou services,
redemarrage, veille, hibernation et toute commande machine libre. Une nouvelle
action exige un besoin concret et une revue conjointe des contrats Wake/Corelink.

## Repo et deploiement

- Source DEV: `P:\DEV\GitHub\App-ShinedeWake`
- Runtime PROD: `P:\PROD\ShinedeWake`
- URL publique attendue: `https://wake.shinederu.ch`
- URL PWA: `https://wake.shinederu.ch/`
- Ancienne URL mobile: `https://wake.shinederu.ch/mobile/`, redirige vers `/`
- API Wake: `https://api.shinederu.ch/wake/`
- API Auth: `https://api.shinederu.ch/auth/`
- Backend source: `P:\DEV\GitHub\App-ShinedeWake-API`
- Branche normale: `main`

Le deploiement frontend copie uniquement le contenu de `dist\` vers
`P:\PROD\ShinedeWake`.

## Structure

- `src\App.tsx`: application complete unique, appareils, agent systeme et actions.
- `src\main.tsx`: entree React et enregistrement du worker racine en production.
- `index.html`: entree HTML unique avec manifeste et icones PWA.
- `src\lib\api.ts`: client HTTP Wake unique pour les fonctions machine.
- `src\lib\authClient.ts`: client auth commun.
- `src\types\api.ts`: contrats de l'API Wake, dont `WakeSystemAgent`.
- `src\components\LoginPanel.tsx`: panneau de connexion.
- `src\components\UserAccessPanel.tsx`: rappel des acces par ordinateur et lien
  vers la gestion centralisee du domaine.
- `src\index.css`: styles de l'application.
- `public\`: assets publics inclus au build.
- `public\manifest.json` et `public\icons\`: manifeste et icones PWA.
- `public\sw.js`: modele du worker racine, finalise pendant le build.
- `public\mobile\`: redirection vers `/`, manifeste de compatibilite, tombstone
  du worker mobile et icones historiques.
- `vite.config.ts` et `build\pwa.ts`: build unique et generation du worker dans
  `closeBundle`, avec hash de version et liste explicite des fichiers statiques.
- `dist\`: artefacts generes par Vite, seuls fichiers deployables en PROD.

Les anciens fichiers `src\lib\corelinkApi.ts` et `src\types\corelink.ts` ont ete
retires: un client Corelink separe recreerait deux autorites dans l'interface.

## Endpoints consommes

Wake:

- `GET https://api.shinederu.ch/wake/?action=status`
- `GET https://api.shinederu.ch/wake/?action=listDevices`
- `POST https://api.shinederu.ch/wake/?action=wakeDevice`
- `POST https://api.shinederu.ch/wake/?action=shutdownDevice`
- `POST https://api.shinederu.ch/wake/?action=createDevice`
- `PUT https://api.shinederu.ch/wake/?action=updateDevice`
- `DELETE https://api.shinederu.ch/wake/?action=deleteDevice`

Les anciens endpoints Wake `listUsers` et `updateUserPermissions` ne sont plus
consommes. Ils ne doivent pas etre retablis: l'ancien niveau global ecrasait les
roles Wake definis dans le domaine.

Auth est consomme indirectement par `@shinederu/auth-core` via
`VITE_SHINEDERU_API_AUTH_URL`.

Toutes les requetes navigateur utilisent `credentials: include` pour transmettre
le cookie de session `sid`.

## Contrat appareil et agent systeme

`listDevices` fournit les champs Wake historiques, puis un champ `agent`:

```json
{
  "id": 1,
  "name": "BooTao",
  "corelink_machine_key": "bootao",
  "power_state": "online",
  "agent": {
    "machine_key": "bootao",
    "display_name": "BooTao",
    "status": "online",
    "is_online": true,
    "last_seen_at": "2026-07-30 12:00:00",
    "latest_metrics": {
      "captured_at": "2026-07-30 12:00:00",
      "cpu_usage_percent": 18.2,
      "memory_used_mb": 8192,
      "memory_total_mb": 32768,
      "disks": [],
      "gpus": [],
      "uptime_seconds": 86400
    },
    "active_shutdown_jobs": []
  }
}
```

`agent` vaut `null` si aucune machine technique ne correspond a la cle. Les
metriques peuvent aussi etre `null` pendant le premier deploiement ou avant la
premiere collecte.

Le champ de stockage `corelink_machine_key` est conserve pour compatibilite. Son
libelle produit est `Cle de liaison agent`; les panneaux visibles utilisent
`Agent systeme`.

## Authentification et permissions

- Auth commune via `Module-Auth-Core` et `Module-Auth-React`.
- Cookie session attendu: `sid` sur `.shinederu.ch`.
- Le backend Wake reste l'autorite d'acces.
- Les comptes bannis sont refuses cote API si `users.is_banned` existe.

Permissions Wake:

- `wake.devices.<id>.wake`: voir et allumer l'ordinateur correspondant.
- `wake.devices.shutdown`: demande d'arret via l'agent lie, uniquement sur un
  ordinateur autorise par sa permission individuelle.
- `wake.devices.manage`: creation, edition et suppression des machines.
- `wake.users.manage`: affichage de l'information sur la gestion centralisee;
  ne permet ni une attribution locale ni un acces implicite aux ordinateurs.

Le statut expose `can_wake` (au moins un ordinateur autorise ou admin global),
`can_shutdown`, `can_manage_devices`, `can_manage_users` et le resume compatible
`can_manage`. La liste est filtree cote serveur avant chargement de l'etat et
des metriques. Les droits de gestion ne donnent pas implicitement acces aux
machines; seul l'admin global Core conserve son bypass integral.

Les acces sont attribues dans `https://shinederu.ch/permissions`, projet Wake:
chaque ordinateur dispose d'une permission stable par identifiant et d'un role
pratique `device_<id>`. Un role personnalise du domaine peut aussi porter
plusieurs permissions individuelles. Renommer une machine ne change pas son
identifiant de permission. Aucun ancien acces global n'est repris automatiquement.

Le panneau Wake ne contient plus d'editeur de roles: seuls les admins globaux
voient le lien vers l'administration du domaine; les autres gestionnaires sont
invites a contacter un admin global.

Le bouton d'arret reste desactive sans permission, sans agent en ligne,
lorsqu'un job d'arret est actif ou pendant le court delai d'arret deja programme.
L'interface efface les machines et donnees d'edition devenues interdites
des qu'un statut ou une reponse de refus est recu. Les reponses de commandes ne
reinjectent jamais une machine dans la liste; seule sa relecture filtree le peut.

Pour un ordinateur existant, seul un admin global Core peut changer l'identite
technique (MAC, IP cible, broadcast, port et cle de liaison agent). Ces champs
restent en lecture seule pour les autres gestionnaires afin de ne pas rediriger
un droit existant vers un autre ordinateur. Le nom, la description, les
composants, l'ordre et l'activation restent modifiables avec les droits requis.
Une creation permet de saisir l'identite technique, sans attribuer d'acces au
nouvel ordinateur.

## Base de donnees

Le frontend n'accede jamais a MySQL.

Les tables et migrations sont documentees dans
`P:\DEV\GitHub\App-ShinedeWake-API\README.md`. Le frontend connait uniquement la
liaison `corelink_machine_key` et le contrat JSON `device.agent`.

## Temps reel et evenements

Le frontend ne s'abonne pas encore a Mercure.

Etat actuel:

- rafraichissement HTTP silencieux toutes les 15 secondes quand l'onglet est
  visible;
- resynchronisation unique via `status` et `listDevices`;
- publications Mercure Wake suspendues tant qu'un contrat d'abonnement
  respectant les droits par ordinateur n'est pas disponible.

Ne pas reactiver les anciens evenements publics `wake.device.*` ou le topic
global: ils exposeraient des machines aux comptes qui n'y ont pas acces.
Une future integration doit filtrer les abonnements par ordinateur, garder la
resynchronisation HTTP et ne jamais declencher de commande critique via Mercure.

## PWA unique

La PWA installee ouvre le panel complet `/`, avec la meme UI responsive, les
memes appels API et les memes permissions que le navigateur. Il n'existe plus
de seconde application mobile ni de second build Vite.

- manifeste principal: `/manifest.json`;
- `start_url` et `scope`: `/`;
- `id`: `/mobile/`, conserve comme identifiant opaque des installations
  historiques, sans limiter le demarrage ou le scope a cette ancienne URL;
- icones principales: `/icons/`;
- worker: `/sw.js`, enregistre avec le scope `/` en production uniquement;
- cache: `shinedewake-full-shell-<buildhash>`, dont la version et la liste
  explicite de fichiers statiques sont injectees a la fin du build.

Le worker traite `/` et `/index.html` en network-first. En cas d'indisponibilite
reseau, il peut fournir `/index.html` depuis le precache et les fichiers
statiques prelistes (dont assets et icones) en cache-first. Seul le shell
statique est disponible hors ligne:
aucune session, liste de machines, metrique ou reponse d'API n'est mise en cache.
Les API Wake/Auth et les commandes exigent le reseau. Aucun Background Sync,
rejeu de commande ou file d'attente hors ligne n'est utilise.
Le client HTTP Wake demande aussi `cache: "no-store"`.

### Migration des anciennes installations

`/mobile/index.html` est une redirection de compatibilite vers `/`.
Le worker racine redirige lui aussi les chemins exacts `/mobile`, `/mobile/`
et `/mobile/index.html` vers `/`, meme hors ligne une fois ce worker actif.
`/mobile/manifest.json` reste servi avec un contenu equivalent au manifeste
principal et le meme identifiant d'installation. Les anciennes icones sous
`/mobile/icons/` sont conservees pour les raccourcis existants.

`/mobile/sw.js` est desormais un tombstone: il supprime uniquement les caches
mobiles concernes, desinscrit son propre worker et navigue les seuls clients
de l'ancienne URL `/mobile/` vers `/`. L'entree React nettoie aussi uniquement
l'ancienne inscription mobile et les stockages legacy de transitions Wake,
sans effacer les sessions ni les caches d'autres applications.

La premiere migration d'une ancienne installation necessite une connexion et
peut demander une reouverture. Un ancien cache peut encore afficher l'ancienne
interface avant la mise a jour du worker. L'identifiant `/mobile/` preserve
l'installation mobile recente; une tres ancienne PWA racine identifiee par `/`
peut rester une installation distincte, selon le navigateur.
Ne pas retablir l'ancien code qui desinscrivait le worker racine: `/sw.js`
heberge maintenant la PWA complete.

## Dependances inter-projets

- `App-ShinedeWake-API`: autorite des appareils, permissions, WOL, arret et
  contrat d'agent systeme.
- `Module-Auth-API`: session `sid`, utilisateurs et authentification commune.
- `Module-Auth-Core`: client auth TypeScript.
- `Module-Auth-React`: bindings React pour le contexte auth.
- `App-Corelink-API`: agent et collecteur technique cote serveur; aucune
  dependance navigateur directe.

Le build utilise des alias Vite vers:

- `P:\DEV\GitHub\Module-Auth-Core\src`
- `P:\DEV\GitHub\Module-Auth-React\src`

## Configuration

### Outils frontend

- React et React DOM 19.3, Lucide React 1.48.
- Vite 8.3, plugin React 6.1 et TypeScript 7.0.
- Node.js 24 LTS utilise pour les builds, avec les types Node 24.
- Installer les versions verrouillees avec `npm ci`, puis `npm run build`.

La configuration Vite deduplique React et React DOM pour les modules
Auth importes depuis les depots voisins. Ne pas modifier ces modules pour
mettre a jour les dependances de Wake.

Fichiers publics suivis:

- `.env.example`
- `.env.development`
- `.env.production`

Variables Vite:

- `VITE_SHINEDERU_API_AUTH_URL`
- `VITE_SHINEDEWAKE_API_URL`

Valeurs attendues en production:

```text
VITE_SHINEDERU_API_AUTH_URL=https://api.shinederu.ch/auth/
VITE_SHINEDEWAKE_API_URL=https://api.shinederu.ch/wake/
```

Ces valeurs sont publiques. Ne jamais ajouter de token, mot de passe ou secret
dans un `.env` frontend.

## Verifications

```powershell
cd P:\DEV\GitHub\App-ShinedeWake
npm run build
npm run test:pwa
node --check dist\sw.js
node --check public\mobile\sw.js
git -c safe.directory=* diff --check
rg -n "password|passwd|secret|BEGIN (RSA|OPENSSH|PRIVATE)|api_key|token" P:\DEV\GitHub\App-ShinedeWake
```

Smoke test manuel apres deploiement:

1. ouvrir `https://wake.shinederu.ch`;
2. verifier la connexion et les flags `status`;
3. verifier la liste et le panneau `Agent systeme`;
4. reveiller une machine autorisee;
5. demander l'arret d'une machine liee et en ligne;
6. verifier que l'arret devient indisponible pendant le job actif;
7. verifier l'editeur machine avec un compte gestionnaire et le lien vers les
   permissions du domaine avec un admin global;
8. verifier l'absence de requete navigateur vers `/corelink/`;
9. verifier l'absence des actions veille, mesure et redemarrage.
10. installer la PWA depuis `/` et verifier qu'elle ouvre le panel complet;
11. ouvrir `/mobile/` et verifier la redirection vers `/`, sans second bundle;
12. verifier `/manifest.json`, le worker `/sw.js` de scope `/` et le cache
    statique versionne;
13. verifier le demarrage hors ligne du shell sans cache API, session ou donnees
    machines; les commandes ne doivent jamais etre rejouees au retour du reseau;
14. avec un compte autorise uniquement pour Gooba, verifier l'absence de BooTao
    dans le navigateur et la PWA, puis la disparition de Gooba apres revocation;
15. verifier qu'un admin global Core garde toutes les machines et que les
    anciennes routes de gestion des acces Wake ne sont jamais appelees;
16. verifier qu'une creation recharge la liste filtree sans donner
    automatiquement acces au nouvel ordinateur.
17. verifier que l'identite technique d'une machine existante est en lecture
    seule pour un gestionnaire non global et editable pour un admin global Core.
18. simuler une ancienne PWA `/mobile/`, verifier sa migration, la disparition
    de son worker/cache et la preservation des caches hors perimetre;
19. verifier le rendu desktop et responsive sans changement de disposition.

Pour les verifications automatisees, simuler les reponses API et les commandes:
ne pas reveiller ou eteindre une machine reelle pour tester la PWA.

## Deploiement

```powershell
cd P:\DEV\GitHub\App-ShinedeWake
npm run build
```

Copier uniquement le contenu de `dist\` vers `P:\PROD\ShinedeWake`. Ne pas
deployer `.git`, les sources, `.env*`, `node_modules`, docs, tests ou caches.
Avant de supprimer d'anciens assets, verifier que le nouvel `index.html` ne les
reference plus.

Le build unique produit le panel complet installable a la racine et les seuls
fichiers de compatibilite dans `dist\mobile\`.

Ordre de copie:

1. publier les assets et icones;
2. publier les fichiers HTML et manifestes, y compris ceux de compatibilite;
3. verifier que chaque fichier de la liste de precache du worker final est
   present et disponible;
4. publier les workers en dernier. Deployer `dist/sw.js`, jamais directement
   le modele `public/sw.js` qui n'a pas encore sa liste injectee.

Le deploiement est additif: preserver `mobile/index.html`,
`mobile/manifest.json`, `mobile/sw.js`, `mobile/icons/` et les anciens bundles
`mobile/assets/` pour les installations pas encore migrees. La nouvelle entree
mobile ne sert plus la vue simplifiee, mais des clients anciens peuvent encore
avoir besoin de ses assets pendant leur mise a jour. Ne pas supprimer tout le
dossier `mobile/` ni utiliser une synchronisation avec suppression automatique.

Un nettoyage des anciens bundles est une operation ulterieure distincte:
verifier les references, les clients concernes et les chemins exacts avant
d'archiver les seuls fichiers devenus inutiles hors de `PROD`, de facon
recuperable.

## Notes de reprise

- Etat documente le 2026-10-08.
- Wake est le produit et l'API navigateur uniques.
- Le navigateur et la PWA partagent l'application complete racine. L'ancienne
  interface mobile simplifiee est retiree; `/mobile/` reste une compatibilite.
- Arcadia ne fait plus partie du contrat.
- Les migrations de permissions sont documentees dans le README de
  `App-ShinedeWake-API`. La migration par ordinateur repart sans attribution
  automatique, tout en conservant `core.super_admin`.
