# Guide des Migrations DB

## Règle : chaque migration doit être appliquée sur les deux environnements

### 1. Prod (Azure)
```bash
copy .env.prod .env
npm run migrate
```

### 2. Dev (VPS Contabo)
```bash
copy .env.dev .env
npm run migrate
```

### 3. Remettre l'env souhaité
```bash
copy .env.prod .env   # pour travailler sur prod
copy .env.dev .env    # pour travailler sur dev
```

---

## Créer une migration
```bash
# Nommer le fichier : NNN_description.sql (NNN = numéro suivant)
# Exemple : 015_add_phone_to_users.sql
```

Toujours utiliser `IF NOT EXISTS` / `IF EXISTS` pour l'idempotence.
