# CAMPEONES · PWA Fantasy de 6.º

Primera versión funcional: **GitHub Pages (web instalable) + Cloudflare Worker (API) + Cloudflare D1 (base de datos)**.

## Qué incluye

- Acceso privado de alumnado con código aleatorio de 8 caracteres y acceso del profesor.
- 40 personajes, incluido el personaje secreto asignado a cada alumno; la relación solo se muestra al alumno correspondiente y al profesor.
- Reparto inicial aleatorio: 1 POR + 2 DEF + 2 MED + 1 DEL. Los mismos futbolistas pueden aparecer en diferentes clubes.
- Mercado con cambio por otro jugador de la misma posición, saldo y máximo 2 operaciones por semana.
- 3 misiones automáticas con puntos para el club (máximo 5) y monedas (máximo 3 M por semana).
- Bloqueo y publicación manual de jornadas, clasificación, actualización de precios y nueva temporada trimestral.
- PWA instalable, responsive, caché de interfaz y demostración sin servidor.

**Importante:** esta es una **versión inicial de prueba/piloto**, no un sistema escolar auditado. Antes de introducir nombres auténticos o datos escolares deben revisarse seguridad, protección de datos, permisos del centro y medidas contra abusos. Los puntos visibles se generan mediante resultados lúdicos virtuales; **no se publican notas ni puntuaciones académicas**. No hay aún editor avanzado de misiones, carga de imágenes, exportación Excel, recuperación de credenciales, copias automáticas ni cierre horario automático.

## Paso 1. Crear base D1 en Cloudflare

En ordenador, instala Node.js. Abre una terminal en la carpeta `worker` y ejecuta:

```bash
npm install -g wrangler
wrangler login
wrangler d1 create campeones-liga-db
```

El último comando mostrará un `database_id` (UUID). Abre `worker/wrangler.toml` y sustituye `REEMPLAZAR_CON_ID_D1` por ese UUID.

Después, en `worker/`, ejecuta:

```bash
wrangler d1 execute campeones-liga-db --remote --file=schema.sql
```

## Paso 2. Configurar contraseñas del Worker

Sin meter ninguna contraseña en GitHub, desde `worker/`:

```bash
wrangler secret put ADMIN_PASSWORD
wrangler secret put SESSION_SECRET
```

Utiliza una contraseña de administrador larga y una clave de sesión aleatoria, **diferentes entre sí**. Guarda la contraseña de profesor en un lugar seguro.

Opcional, pero recomendado: limita los orígenes admitidos por el navegador. En `worker/wrangler.toml` agrega al final:

```toml
[vars]
FRONTEND_ORIGIN = "https://TU_USUARIO.github.io"
```

Es el origen, sin la ruta del repositorio.

## Paso 3. Publicar el Worker

En `worker/`:

```bash
wrangler deploy
```

Copia la dirección `https://campeones-liga-api.TU_SUBDOMINIO.workers.dev` que devuelva Cloudflare. Comprueba que `https://...workers.dev/api/health` responde `{"ok":true,...}`.

## Paso 4. Subir la web a GitHub Pages

1. Crea un repositorio nuevo, por ejemplo `campeones-sexto`.
2. Sube **solo el contenido de `web/`** a la raíz del repositorio (`index.html`, `app.js`, `style.css`, `icon.svg`, `manifest.webmanifest`, `sw.js`).
3. En GitHub: **Settings → Pages → Deploy from a branch → main → /(root) → Save**.
4. La web estará normalmente en `https://TU_USUARIO.github.io/campeones-sexto/`.
5. Abre la web. Pulsa **Configurar Cloudflare Worker** y pega la URL pública del Worker.

**Nunca subas a GitHub contraseñas, claves de sesión ni códigos privados de alumnos.** El archivo de configuración incluido no contiene secretos.

## Paso 5. Crear la liga

1. Entra como **Profesor**, con `ADMIN_PASSWORD`.
2. Copia y pega los nombres de los alumnos, **uno por línea**, en "Crear liga".
3. Pulsa **Crear liga y generar códigos**.
4. Guarda inmediatamente la lista de códigos de acceso que aparece. **No podrán volver a consultarse** (se almacena su hash, no el código en claro).
5. Entrega a cada alumno su usuario (`A01`, `A02`...) y código individual por un canal privado.
6. Cada alumno entra desde su dispositivo con esos dos datos.

## Cómo jugar

- **Mi carrera:** cada alumno conoce únicamente su personaje.
- **Mi equipo:** su plantilla 1-2-2-1, puntuaciones y presupuesto.
- **Mercado:** elegir primero a quien vender y después a quien comprar en la misma posición; confirmar el cambio.
- **Misiones:** resolver cada reto una sola vez por jornada para obtener recompensas.
- **Panel docente:** bloquear el mercado antes de **Publicar jornada**. Al publicar se calculan puntos para los 40 personajes sin revelar identidades; las puntuaciones no proceden de notas escolares.
- **Trimestres:** comenzar nueva temporada desde el panel docente para reasignar identidades y equipos.

## Pruebas básicas antes de usar con alumnado

- Entrar como profesor, crear 2 alumnos ficticios y guardar los códigos.
- Abrir otro navegador, entrar como A01, comprobar que solo ve su propio personaje.
- Fichar a un jugador de la misma posición con saldo suficiente y comprobar que sigue habiendo 6.
- Completar las 3 misiones y verificar +3 M y un máximo de +5 puntos bonus.
- Bloquear el mercado y publicar jornada, revisar clasificación y cambios de valores.
- Volver a iniciar sesión y verificar que todos los cambios persisten.

## Notas de seguridad y límites

- Las identidades secreto-alumno no se envían a otros estudiantes desde el Worker.
- Los códigos de alumno se almacenan como resumen SHA-256 con secreto del servidor (nunca como texto plano).
- Se recomienda configurar reglas adicionales de limitación de peticiones a nivel Cloudflare y copias de seguridad D1 antes de producción.
- Los datos académicos privados no están implementados en este MVP. La puntuación pública se genera a partir de eventos virtuales independientes de los datos escolares.
- El bloqueo de mercado es manual. Las recompensas de misiones se suman al club; los puntos se incorporan al publicar la jornada.
- **No uses fotos ni datos personales del alumnado en pruebas públicas.** Utiliza nombres ficticios.
- Las imágenes ilustradas del prototipo anterior son referencias de diseño, no recursos oficiales de esta aplicación. Esta primera entrega usa cartas gráficas sin imágenes externas para evitar problemas de derechos.


## Nuevo módulo: notificaciones push (segundo Worker)

Incluye `worker-notificaciones/`: Worker independiente con base de datos D1 para las suscripciones y la librería `web-push` para envío real de Web Push. El Worker de notificaciones **no es un endpoint público**: se conecta al Worker principal mediante un **Service Binding**, que autentica las sesiones antes de permitir suscripciones o envíos.

### Instalación

1. En `worker-notificaciones/` ejecuta `npm install` y `npx wrangler d1 create campeones-notificaciones-db`. Copia el ID generado al `wrangler.toml` del módulo.
2. Ejecuta `npx wrangler d1 execute campeones-notificaciones-db --remote --file=schema.sql`.
3. Genera el par VAPID con `npx web-push generate-vapid-keys` (desde `worker-notificaciones/`). Guarda ambos valores **fuera de GitHub**.
4. En `worker-notificaciones/` crea los tres secretos: `npx wrangler secret put VAPID_PUBLIC_KEY`, `npx wrangler secret put VAPID_PRIVATE_KEY`, `npx wrangler secret put VAPID_SUBJECT`. El último usa `mailto:correo-del-centro@dominio.example` (un correo válido del responsable).
5. Despliega **primero** notificaciones: `npx wrangler deploy` en `worker-notificaciones/`.
6. En `worker/` (API principal), crea el secreto `VAPID_PUBLIC_KEY` con **la misma clave pública** y ejecuta `wrangler deploy`. `worker/wrangler.toml` ya incluye `[[services]]` enlazando con `campeones-notificaciones`.
7. Sube el contenido actualizado de `web/` a GitHub Pages (incluyendo `sw.js`). En la PWA, entra con un usuario real y pulsa el perfil superior → **Activar avisos**. Debe ser una interacción del usuario para que el navegador solicite permiso.
8. Como profesor, abre el perfil superior y envía una notificación general de prueba. Publicar jornada y comenzar temporada lanzan avisos automáticos.

### Limitaciones y medidas de seguridad

- Requiere HTTPS, Service Worker y permiso explícito. En iPhone/iPad es necesario **instalar la PWA en la pantalla de inicio** antes de activar push.
- Los alumnos pueden cancelar suscripción desde Ajustes. Los endpoints caducados (404/410) se borran al intentar enviar.
- Las notificaciones no muestran datos académicos, nombres de alumnos ni identidades de personajes.
- Los envíos masivos de este MVP se hacen secuencialmente para grupos de clase pequeños; para ampliar a muchos centros convendría usar Cloudflare Queues.
- La entrega está sujeta al sistema operativo, el permiso del navegador y los proveedores push; no se garantiza llegada inmediata.
- En los ejemplos anteriores, los datos y estadísticas eran simulados: prueba toda la integración con cuentas ficticias antes de incorporar información real de menores.
- El aviso de apertura de mercado coincide con la publicación de jornada; no se mandan notificaciones de fichajes individuales en esta versión.
