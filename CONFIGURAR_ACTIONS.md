# Configurar GitHub Actions · CAMPEONES

## 1. Preparar Cloudflare una sola vez

En Cloudflare crea las dos bases de datos D1 `campeones-liga-db` y `campeones-notificaciones-db`.
Coloca sus identificadores UUID reales en `worker/wrangler.toml` y `worker-notificaciones/wrangler.toml`.
Si ya existen, reutiliza exactamente los mismos ID: no crees bases de datos nuevas.

Aplica una sola vez los esquemas SQL con Wrangler desde el ordenador (o consola que uses):

```bash
cd worker
npx wrangler d1 execute campeones-liga-db --remote --file=schema.sql
cd ../worker-notificaciones
npm install
npx wrangler d1 execute campeones-notificaciones-db --remote --file=schema.sql
```

Si ya aplicaste los esquemas, NO repitas sin comprobar sus tablas. El workflow no borra ni recrea bases de datos.

## 2. Secretos de los Workers (configuración inicial)

Guárdalos DIRECTAMENTE en Cloudflare (no en GitHub):

Desde `worker/`:

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put VAPID_PUBLIC_KEY
```

Desde `worker-notificaciones/`:

```bash
npm install
npx web-push generate-vapid-keys
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
```

La `VAPID_PUBLIC_KEY` debe coincidir en ambos Workers. `VAPID_SUBJECT` debe ser de tipo `mailto:contacto@tudominio.es` con dirección real.
Los secretos se configuran inicialmente antes de la primera prueba. No los publiques en un commit.

## 3. Crear token para Actions

Cloudflare → Profile → API Tokens → Create Token; token con permisos para desplegar Workers/scripts y acceso a la cuenta correcta. Ajusta los permisos necesarios según los recursos D1. Copia el ACCOUNT ID de Cloudflare.

GitHub → repositorio → Settings → Secrets and variables → Actions → New repository secret:

- `CLOUDFLARE_API_TOKEN`: token de Cloudflare.
- `CLOUDFLARE_ACCOUNT_ID`: ID de cuenta de Cloudflare.

## 4. GitHub Pages

GitHub → repositorio → Settings → Pages → Build and deployment → Source: **GitHub Actions** (no Deploy from a branch).

## 5. Subir estructura

Sube las carpetas `web/`, `worker/`, `worker-notificaciones/` y `.github/workflows/desplegar.yml` a la **raíz** del repositorio.
GitHub → Actions → Desplegar CAMPEONES → Run workflow (o haz un push a main).

Orden: `notificaciones` → `api`; en paralelo `pages-build` → `pages-deploy`.

## 6. Conectar web y API

Abre la URL de GitHub Pages, usa «Configurar Cloudflare Worker» y escribe la URL del Worker `campeones-liga-api` (HTTPS, sin barra final).

## 7. Pruebas y seguridad

Comprueba la salud del API en `https://<TU-WORKER>.workers.dev/api/health`, prueba con cuentas ficticias, después verifica push en dispositivos compatibles.
Cualquier cambio del código en `main` redeplegará los tres servicios; los secretos y los datos D1 se conservan.

**IMPORTANTE:** Este workflow no inicializa D1 ni crea secretos VAPID. Es intencionado: son operaciones de configuración inicial que no deben repetirse en cada despliegue.
