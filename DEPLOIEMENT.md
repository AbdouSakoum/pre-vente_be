# Guide de Déploiement — Prevente

## Infrastructure

- **Serveur** : VPS Contabo — IP `13.140.148.8`
- **Base de données** : PostgreSQL 16 installé directement sur le serveur
- **Backend** : Conteneur Docker — image `abderrazzaksakoum/prevente_be`
- **Frontend** : Conteneur Docker — image `abderrazzaksakoum/prevente_fe`
- **Fichiers uploadés** : `/opt/prevente/uploads/` (bind mount, persistant)
- **Fichier env** : `/opt/prevente/.env`
- **Docker Compose** : `/opt/prevente/docker-compose.prod.yml`

---

## Premier déploiement (déjà effectué)

### 1 — Base de données
```bash
# Sur le serveur SSH
psql -U prevente -h localhost -d prevente -f /opt/prevente/init.sql
docker exec prevente_backend node src/db/migrate.js
```

### 2 — Dossiers et fichiers
```bash
mkdir -p /opt/prevente/uploads
chmod 755 /opt/prevente/uploads
```

### 3 — Lancer les conteneurs
```bash
cd /opt/prevente
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

---

## Redéployer une nouvelle version

### Backend
```bash
# 1. Local — Git Bash
cd ~/Desktop/Personnel/pre-vente/app/backend
docker build -t abderrazzaksakoum/prevente_be:latest .
docker push abderrazzaksakoum/prevente_be:latest

# 2. Serveur SSH
cd /opt/prevente
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d

# 3. Si nouvelles migrations
docker exec prevente_backend node src/db/migrate.js
```

### Frontend
```bash
# 1. Local — Git Bash
cd ~/Desktop/Personnel/pre-vente/app/frontend
docker build -t abderrazzaksakoum/prevente_fe:latest .
docker push abderrazzaksakoum/prevente_fe:latest

# 2. Serveur SSH
cd /opt/prevente
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

### Les deux en même temps
```bash
# Local — builder et pusher les deux images
cd ~/Desktop/Personnel/pre-vente/app/backend
docker build -t abderrazzaksakoum/prevente_be:latest .
docker push abderrazzaksakoum/prevente_be:latest

cd ~/Desktop/Personnel/pre-vente/app/frontend
docker build -t abderrazzaksakoum/prevente_fe:latest .
docker push abderrazzaksakoum/prevente_fe:latest

# Serveur SSH
cd /opt/prevente
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d
docker exec prevente_backend node src/db/migrate.js
```

---

## Commandes utiles sur le serveur

```bash
# Voir les conteneurs en cours
docker ps

# Voir les logs backend
docker logs prevente_backend

# Voir les logs frontend
docker logs prevente_frontend

# Redémarrer un conteneur
docker restart prevente_backend
docker restart prevente_frontend

# Tester l'API
curl http://localhost/api/health

# Insérer les données de démo
docker exec prevente_backend node src/db/seed.js

# Backup des fichiers uploadés
tar -czf /opt/prevente/uploads_backup_$(date +%Y%m%d).tar.gz /opt/prevente/uploads/
```

---

## Fichiers importants

| Fichier | Emplacement |
|---|---|
| Variables d'environnement | `/opt/prevente/.env` |
| Docker Compose production | `/opt/prevente/docker-compose.prod.yml` |
| Fichiers uploadés | `/opt/prevente/uploads/` |
| Logs PostgreSQL | `journalctl -u postgresql` |

---

## Prochaines étapes recommandées

- [ ] SSL/HTTPS avec Let's Encrypt (si domaine disponible)
- [ ] Firewall UFW (autoriser uniquement ports 22, 80, 443)
- [ ] Backup automatique de la base de données
