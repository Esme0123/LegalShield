# LegalShield · API REST (backend)

API Node.js + Express que expone autenticacion, matriz RBAC/SIS-321, expedientes
judiciales y auditoria. Sustituye el simulador en memoria del frontend por datos
persistentes en MySQL/MariaDB (driver `mysql2`).

## Estructura

```
back/
├── package.json
├── .env / .env.example
├── server.js                     # composicion de la app y arranque
├── config/
│   └── db.js                     # pool mysql2 (MySQL/MariaDB), helpers y transacciones
├── middlewares/
│   ├── authMiddleware.js         # verificacion del Bearer token
│   ├── rbacMiddleware.js         # permisos y alcance por ambito (A01:2021)
│   └── auditMiddleware.js        # bitacora global de peticiones
├── controllers/
│   ├── authController.js         # register, login, unlock, refresh
│   ├── profileController.js      # perfil y cambio de contrasena
│   ├── usersController.js        # ABM de usuarios, desbloqueo y emision de OTP (OSI)
│   ├── casesController.js        # CRUD de expedientes con filtro por titular
│   ├── rolesController.js        # matriz rol x permiso
│   └── auditController.js        # lectura de security_logs
├── routes/
│   ├── authRoutes.js
│   ├── usersRoutes.js
│   ├── casesRoutes.js
│   ├── rolesRoutes.js
│   └── auditRoutes.js
├── services/
│   ├── authService.js            # emision y verificacion de JWT
│   ├── auditService.js           # unico punto de escritura en la bitacora
│   └── notificationService.js    # avisos de seguridad al titular (user_notifications)
├── utils/
│   ├── errors.js                 # HttpError + factories por codigo
│   ├── helpers.js                # IP del cliente, asyncHandler
│   ├── identity.js               # User ID, correo y nombre de usuario
│   ├── logger.js                 # logger JSON en produccion
│   ├── passwordPolicy.js         # politica de contrasenas y score
│   └── unlockToken.js            # OTP de desbloqueo: generacion, HMAC-SHA256 y comparacion
├── database/
│   ├── schema.sql                # tablas, triggers, vista de la matriz
│   └── seed.sql                  # catalogo inicial y matriz base
└── scripts/
    ├── initDb.js                 # npm run init-db: esquema, migraciones y datos demo
    ├── setupDatabase.js          # npm run db:setup
    └── seedDatabase.js           # npm run db:seed
```

## Puesta en marcha

```bash
cd back
npm install
cp .env.example .env      # ajustar DB_* y los tres secretos obligatorios (ver abajo)

# Requiere MySQL 8 o MariaDB 10.4+ en marcha (p. ej. XAMPP) con los datos DB_* de .env
npm run init-db           # crea la base y el esquema, aplica migraciones y siembra datos demo
npm run start             # http://localhost:4000 (npm run dev para recarga automatica)
```

`npm run init-db` es idempotente: puede ejecutarse cuantas veces sea sin duplicar
datos. Crea la base `DB_NAME` si no existe, crea las tablas, triggers y vista,
aplica las migraciones pendientes sobre una base ya existente y siembra roles,
permisos, la matriz rol x permiso y las cuentas de demostracion.

`npm run db:setup` solo aplica `database/schema.sql`: crea la base y las tablas
(con triggers y el catalogo de roles y permisos), pero sin matriz rol x permiso
ni usuarios, y no migra una base existente. Para una base utilizable, o para
actualizar una creada con una version anterior, usar `npm run init-db`.

Comprobar salud: `curl http://localhost:4000/health`

### Secretos obligatorios en `.env`

`JWT_SECRET`, `JWT_REFRESH_SECRET` y `UNLOCK_TOKEN_SECRET` son obligatorios.
Cada uno debe ser un valor aleatorio propio de al menos 32 caracteres, distinto
de los otros dos, y no puede conservar el valor de ejemplo de `.env.example`
(los que empiezan por `reemplazar_por_`). Si alguno falta o no cumple estas
reglas, el servidor no arranca e indica cual corregir. Generar cada uno con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

La contrasena inicial de las cuentas de demostracion es la de `DEMO_PASSWORD`
(ver su valor por defecto en `back/scripts/initDb.js`).

## Endpoints

### Autenticacion · `/api/auth`

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| POST | `/register` | publica | Deshabilitado: responde siempre 403 "El alta de cuentas la realiza el Oficial de Seguridad de la Información", sin crear la cuenta ni consumir el correlativo del User ID, y registra `REGISTRATION_BLOCKED`. El alta la hace el OSI con `POST /api/users` (menor privilegio). |
| POST | `/login` | publica | Acepta User ID, username o correo. Cuenta desactivada: 403 (`AUTH_DISABLED`). Clave incorrecta: 401 con `failedAttempts`, `maxAttempts` y `showCaptcha`; desde el primer fallo exige CAPTCHA (`captchaToken` + `captchaResponse`) y uno ausente o incorrecto responde 401 y suma a `failed_attempts`. Bloqueo progresivo: al 3.er fallo la cuenta se bloquea 15 min (`LOCK_MINUTES`); el 2.º bloqueo sin login exitoso intermedio dura 30 min (`LOCK_MINUTES_SECOND`) y el 3.º es indefinido (`status = LOCKED_OSI`), que solo levanta el OSI o un OTP valido. Al bloquearse se registra `LOGIN_LOCKED` y se avisa al titular; todo intento sobre una cuenta bloqueada responde 401 con `isLocked`, `requiresOsi` y `remainingSeconds` (`null` si es indefinido) y registra `AUTH_LOCKED`. Clave correcta: reinicia contadores y backoff, emite JWT + refresh con User ID y permisos RBAC (`AUTH_SUCCESS`) e informa `mustChangePassword`; si es `true`, la sesion solo admite `GET /me`, `GET /profile`, `PUT /password`, `POST /logout` y `GET /notifications` (el resto responde 403 `PASSWORD_CHANGE_REQUIRED`). |
| POST | `/verify-unlock-token` | publica | Desbloqueo por OTP con `{ userCode, token }`: OTP de 6 digitos emitido por el OSI (`POST /api/users/:id/generate-unlock-token`). La base guarda solo su HMAC-SHA256 con `UNLOCK_TOKEN_SECRET`, ligado al usuario, y se compara en tiempo constante; vence a los 15 min (`UNLOCK_TOKEN_TTL_MINUTES`), admite 5 intentos (`UNLOCK_TOKEN_MAX_ATTEMPTS`) y es de un solo uso. Formato invalido: 400. Todo rechazo (usuario inexistente, token incorrecto, expirado, agotado o ya usado) responde el mismo 401; el motivo solo queda en `security_logs`. Si es valido desbloquea la cuenta (tambien `LOCKED_OSI`) y reinicia el backoff sin tocar la clave (`ACCOUNT_UNLOCKED_VIA_TOKEN`). |
| POST | `/refresh` | refresh token | Rota el refresh token y devuelve un access token nuevo. |
| POST | `/lock-status` | publica | Estado del bloqueo de una cuenta (`userCode`, `identifier` o `email`) para que el login retome la cuenta regresiva tras recargar la pagina: `isLocked`, `requiresOsi`, `remainingSeconds` (`null` si es indefinido) y `failedAttempts`. Una cuenta inexistente responde como una no bloqueada. Si el bloqueo temporal ya vencio lo libera; el indefinido (`LOCKED_OSI`) no se libera solo. |
| POST | `/unlock` | `ACCOUNT_UNLOCK` | Desbloqueo por el OSI con `{ userCode }`, sin tocar la clave: `is_locked = FALSE`, `status = 'ACTIVE'`, `failed_attempts = 0`; reinicia el backoff (`lock_count = 0`, tambien levanta `LOCKED_OSI`) y anula cualquier OTP pendiente. Cuenta desactivada: 409. Avisa al titular y registra `AUTH_UNLOCK`. |
| GET | `/me` | sesion | Identidad y permisos vigentes del titular. |
| POST | `/logout` | sesion | Cierra la sesion (evidencia en bitacora; el JWT es sin estado). |
| GET | `/directory` | sesion | Listado de cuentas no sensibles para la pantalla de login. |
| GET | `/profile` | sesion | Perfil completo + historial de contrasenas (5 ultimas). |
| PUT | `/profile` | sesion | Edicion de nombre, correo, despacho, departamento y telefono. El rol no es autoeditable. |
| PUT | `/password` | sesion | Cambio de clave: valida la actual, exige la politica y rechaza reutilizar las ultimas 5. |
| GET | `/password-history` | sesion | Metadatos del historial de claves. |
| GET | `/notifications` | sesion | Avisos de seguridad del propio titular (los 20 mas recientes) y el contador `unread`. |
| PATCH | `/notifications/:id/read` | sesion | Marca como leido un aviso propio; uno ajeno o inexistente responde 404. |

### Matriz de roles · `/api/roles`

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/matrix` | sesion | Matriz completa rol x permiso, con `assignments` y `matrix` listo para pintar. |
| POST | `/permissions` | `RBAC_MANAGE` | Aplica `{ grants: [{ role, permission, granted }] }` en una transaccion y devuelve la matriz ya actualizada. Sin reiniciar el servidor. |
| POST | `/reset` | `RBAC_MANAGE` | Restaura la matriz base de `database/seed.sql`. |

### Expedientes · `/api/cases`

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/` | `CASES_READ` | Lista acotada al titular. Filtros: `status`, `riskLevel`, `owner`, `search`, `limit`, `offset`. |
| GET | `/:id` | `CASES_READ` | Detalle. Un expediente de otro abogado responde 403. |
| POST | `/` | `CASES_CREATE` | Crea el expediente con correlativo `EXP-AAAA-NNNN`. |
| PUT | `/:id` | `CASES_WRITE` | Actualiza campos del expediente propio. |
| DELETE | `/:id` | `CASES_ARCHIVE` | Archivo logico: `status = 'archivado'` + `archived_at`. No borra evidencia. |

Control de acceso A01:2021: el socio (o quien tenga `RBAC_MANAGE`) opera sobre
todo el despacho; cualquier otro rol queda limitado a los expedientes donde
`assigned_lawyer_id` coincide con su usuario. El filtro viaja en la sentencia SQL,
no en un filtrado posterior.

### Auditoria · `/api/audit`

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/logs` | `LOGS_VIEW` | Historial inmutable con filtros `from`, `to`, `action`, `status`, `userCode`, `limit`, `offset`. Incluye resumen por estado y por accion. |
| GET | `/events` | `LOGS_VIEW` | Catalogo de eventos con ocurrencias y ultima vez vista. |

## Modelo de datos

`roles`, `permissions`, `role_permissions`, `users`, `password_history`,
`legal_cases`, `security_logs`, `activity_logs`, `user_notifications`.

Dos garantias las impone el esquema, no el codigo de aplicacion:

- `security_logs` es **inmutable**: los triggers `trg_security_logs_no_update` y
  `trg_security_logs_no_delete` lanzan `SIGNAL SQLSTATE '45000'` ante cualquier
  `UPDATE` o `DELETE`.
- `user_code` cumple el patron `^LEG-[0-9]{4}-[0-9]{4}$` mediante `CHECK`.

El trigger `trg_users_updated_at` mantiene `updated_at` sin intervencion de la API.

## Decisiones de seguridad

- **BCrypt 12 rounds** (`BCRYPT_ROUNDS`) en el alta de cuentas por el OSI
  (`POST /api/users`), el cambio de clave y la siembra de las cuentas demo; el
  login y el cambio de clave verifican con `bcrypt.compare`. El registro publico
  esta deshabilitado. El hash nunca sale de la API.
- **JWT con permisos rehidratados en cada peticion**: revocar un permiso en la
  matriz surte efecto de inmediato, sin esperar a que expire el token.
- **JWT stateless**: `POST /logout` deja evidencia en la bitacora, pero la
  revocacion real exigiria lista de tokens o TTL corto (hoy 45 min).
- **CORS por lista blanca** (`CORS_ORIGINS`), `helmet`, limite global de
  peticiones y un limite mas estricto sobre las rutas de autenticacion.
- **Enumeracion de cuentas mitigada**: usuario inexistente y clave incorrecta
  devuelven el mismo 401.
- **SQL parametrizado** en todos los controllers; los identificadores dinamicos
  (`ORDER BY`, `LIMIT`) se validan contra listas blancas antes de interpolarse.
- **Secrets fuera del repositorio**: `.env` esta en `.gitignore` y el arranque
  aborta (fallo seguro) si falta o es invalido cualquiera de los tres secretos:
  `JWT_SECRET`, `JWT_REFRESH_SECRET` y `UNLOCK_TOKEN_SECRET` deben tener al menos
  32 caracteres, no conservar el valor de ejemplo (prefijo `reemplazar_por_`) y
  ser distintos entre si.

## Puntos a revisar antes de produccion

1. El `.env` de este repo contiene secretos de desarrollo de ejemplo. Rotar
   `JWT_SECRET`, `JWT_REFRESH_SECRET` y la contrasena de la base.
2. `security_logs` crece sin limite: definir politica de retencion y archivado
   (particionado por mes o exportacion periodica), nunca con `DELETE`.
3. `pool.query('SELECT 1')` en `/health` no distingue un fallo de red de uno de
   credenciales; en produccion conviene validar tambien el esquema instalado.
4. No hay suite de pruebas ni migraciones versionadas: `schema.sql` es
   idempotente pero no registra historial de cambios de esquema.