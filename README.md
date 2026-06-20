# srpske-vesti — préfecture quotidienne des actualités serbes

Application privée, 100 % automatisée, **0 €/mois**, qui envoie chaque matin à ta grand-mère un
message WhatsApp avec un lien vers une page web (en serbe) contenant un résumé complet et structuré
de l'actualité serbe des dernières 24 h.

- **Cerveau & planification** : GitHub Actions (cron quotidien) — tourne dans le cloud, sans tes appareils.
- **Résumé** : Claude (ta clé API Anthropic).
- **Page de lecture** : statique, hébergée sur GitHub Pages — toujours en ligne.
- **WhatsApp** : un court message avec le lien (CallMeBot ou WhatsApp Cloud API).
- **Stockage / sauvegarde** : fichiers JSON versionnés dans le repo (`data/`) = backup automatique.

Tout ce que voit l'utilisateur est en **serbe** (ћирилица + latinica, bascule sur la page).

---

## 1. Tester en local (sans rien configurer)

```bash
cd "srpske-vesti"
npm install
npm run mock        # génère docs/index.html avec des données d'exemple
npm run preview     # idem + sert la page sur http://localhost:4173
```

Ouvre `docs/index.html` : tu verras la page telle que la recevra ta grand-mère, avec les
boutons **Latinica/Ћирилица** et **clair/sombre**.

Pour un vrai résumé (réseau + IA) :

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
npm run digest -- --no-send      # collecte réelle + résumé Claude, sans envoyer WhatsApp
```

## 2. Mettre en ligne (gratuit, 24/7)

1. **Crée un repo GitHub** (privé) et pousse ce dossier.
2. **Settings → Secrets and variables → Actions → Secrets** :
   - `ANTHROPIC_API_KEY` = ta clé Anthropic.
   - (WhatsApp, selon le provider choisi — voir §3).
3. **Settings → … → Variables** :
   - `SITE_BASE_URL` = `https://TON_USER.github.io/srpske-vesti`
   - `WHATSAPP_PROVIDER` = `callmebot` ou `meta` (ou `none` pour ne pas envoyer).
4. **Settings → Pages** : *Deploy from a branch* → branche `main` → dossier `/docs`.
5. **Actions** : active les workflows, puis **Run workflow** (`Дневни преглед вести`) pour un test manuel.
6. Le cron tourne ensuite chaque jour. ⏰ **Heure** : modifie la ligne `cron` dans
   `.github/workflows/daily.yml`. GitHub est en **UTC** → `30 7 * * *` = 09:30 à Belgrade l'été
   (CEST). En hiver (CET) ce serait 08:30 : ajuste à `30 8 * * *` ou garde une marge.

## 3. Brancher WhatsApp (choisis UNE option, les deux sont gratuites)

### Option A — CallMeBot (le plus rapide, pour démarrer)
1. Ta grand-mère (ou toi sur son téléphone) envoie sur WhatsApp le message
   `I allow callmebot to send me messages` au **+34 644 51 95 23**.
2. Elle reçoit en retour une **API key**.
3. Secrets GitHub : `CALLMEBOT_PHONE` = `+3816...` (son numéro, format international),
   `CALLMEBOT_APIKEY` = la clé reçue. Variable `WHATSAPP_PROVIDER` = `callmebot`.

### Option B — WhatsApp Cloud API (officiel Meta, plus fiable)
1. Crée une app sur [developers.facebook.com](https://developers.facebook.com) → produit **WhatsApp**.
2. Enregistre ton **numéro dédié** comme expéditeur (il ne pourra plus servir dans l'app WhatsApp normale).
3. Crée et fais approuver un **template** (catégorie *Utility*) avec une variable `{{1}}` pour le lien.
4. Secrets : `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TO` (numéro de ta grand-mère),
   `WHATSAPP_TEMPLATE` (nom du template). Variable `WHATSAPP_PROVIDER` = `meta`.

## 4. Réglages

`config/settings.json` — heure d'envoi affichée, fuseau, écriture par défaut (cyrillique/latin),
fenêtre de collecte, modèle Claude, météo, provider WhatsApp.

`config/sources.json` — liste des flux RSS (médias + agences). Les flux indisponibles sont
ignorés et consignés dans `data/logs.json` ; ajuste librement.

## 5. Ce qui existe / ce qui vient ensuite

**Fait (Phase 1)** : collecte RSS, dédup + regroupement, résumé serbe bilingue par sections,
page de lecture adaptée aux seniors (police large, clair/sombre, Ћирилица/Latinica), météo,
archive, historique, journaux, envoi WhatsApp par lien, planification cloud.

**À venir** : dashboard privé (Cloudflare Access), recherche, assistant IA en serbe,
résumés hebdo/mensuel, mode ultra-détaillé (`npm run ultra`), tendances Reddit/Google Trends,
alertes d'erreurs.
