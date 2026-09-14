# ShinedeWake

Frontend React/Vite du panel Wake. Il constitue l'interface unique pour
reveiller une machine, consulter son agent systeme et demander son extinction.

Documentation mise a jour le 2026-08-11.

## Role

ShinedeWake permet aux utilisateurs autorises de:

- consulter les machines et leur etat de puissance estime;
- envoyer une commande Wake-on-LAN;
- visualiser l'etat de l'agent systeme et ses dernieres metriques CPU, RAM, GPU,
  disques et uptime;
- demander un arret controle quand l'agent lie est disponible;
- maintenir les machines, leurs composants et les acces Wake avec les droits de
  gestion.

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
- API Wake: `https://api.shinederu.ch/wake/`
- API Auth: `https://api.shinederu.ch/auth/`
- Backend source: `P:\DEV\GitHub\App-ShinedeWake-API`
- Branche normale: `main`

Le deploiement frontend copie uniquement le contenu de `dist\` vers
`P:\PROD\ShinedeWake`.

## Structure

- `src\App.tsx`: application principale, appareils, agent systeme et actions.
- `src\lib\api.ts`: client HTTP Wake unique pour les fonctions machine.
- `src\lib\authClient.ts`: client auth commun.
- `src\types\api.ts`: contrats de l'API Wake, dont `WakeSystemAgent`.
- `src\components\LoginPanel.tsx`: panneau de connexion.
- `src\components\UserAccessPanel.tsx`: gestion des acces Wake.
- `src\index.css`: styles de l'application.
- `public\`: assets publics inclus au build.
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
- `GET https://api.shinederu.ch/wake/?action=listUsers`
- `PUT https://api.shinederu.ch/wake/?action=updateUserPermissions`

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

- `wake.devices.wake`: acces au panel et envoi WOL.
- `wake.devices.shutdown`: demande d'arret via l'agent lie.
- `wake.devices.manage`: creation, edition et suppression des machines.
- `wake.users.manage`: gestion des acces utilisateurs.

Le statut expose `can_wake`, `can_shutdown`, `can_manage_devices`,
`can_manage_users` et le resume compatible `can_manage`. Le bouton d'arret
reste desactive sans permission, sans agent en ligne, lorsqu'un job d'arret est
actif ou pendant le court delai d'arret deja programme. Le role projet `wake`
represente dans l'UI l'utilisation normale (reveil et arret); le role `manage`
ajoute la gestion.

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
- publication Mercure cote API apres un reveil ou une demande d'arret.

Evenements publies par l'API Wake:

- `wake.device.wake_requested`
- `wake.device.wake_succeeded`
- `wake.device.wake_failed`
- `wake.device.shutdown_requested`

Topics:

- `https://api.shinederu.ch/wake/topics/devices`
- `https://api.shinederu.ch/wake/topics/devices/{DEVICE_ID}`

Mercure ne doit jamais servir a declencher une commande critique.

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
7. verifier l'editeur et les permissions avec un compte gestionnaire;
8. verifier l'absence de requete navigateur vers `/corelink/`;
9. verifier l'absence des actions veille, mesure et redemarrage.

## Deploiement

```powershell
cd P:\DEV\GitHub\App-ShinedeWake
npm run build
```

Copier uniquement le contenu de `dist\` vers `P:\PROD\ShinedeWake`. Ne pas
deployer `.git`, les sources, `.env*`, `node_modules`, docs, tests ou caches.
Avant de supprimer d'anciens assets, verifier que le nouvel `index.html` ne les
reference plus.

## Notes de reprise

- Etat documente le 2026-07-30.
- Wake est le produit et l'API navigateur uniques.
- Arcadia ne fait plus partie du contrat.
- La migration d'acces et de liaison agent se trouve dans
  `App-ShinedeWake-API\sql\005_wake_shutdown_permission_and_agent_link.sql`.
