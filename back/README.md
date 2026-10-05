# LegalShield · API REST (backend)

API Node.js + Express que expone autenticacion, matriz RBAC/SIS-321, expedientes
judiciales y auditoria. Sustituye el simulador en memoria del frontend por datos
persistentes en PostgreSQL.

## Estructura

```
back/
├── package.json
├── .env / .env.example
├── server.js                     # composicion de la app y arranque
├── config/
│   └── db.js                     # pool pg, helpers y transacciones
├── middlewares/
│   ├── authMiddleware.js         # verificacion del Bearer token
│   ├── rbacMiddleware.js         # permisos y alcance por ambito (A01:2021)
│   └── auditMiddleware.js        # bitacora global de peticiones
├── controllers/
│   ├── authController.js         # register, login, unlock, refresh
│   ├── profileController.js      # perfil y cambio de contrasena
│   ├── casesController.js        # CRUD de expedientes con filtro por titular
│   ├── rolesController.js        # matriz rol x permiso
│   └── auditController.js        # lectura de security_logs
├── routes/
│   ├── authRoutes.js
│   ├── casesRoutes.js
│   ├── rolesRoutes.js
│   └── auditRoutes.js
├── services/
│   ├── authService.js            # emision y verificacion de JWT
│   └── auditService.js           # unico punto de escritura en la bitacora
├── utils/
│   ├── errors.js                 # HttpError + factories por codigo
│   ├── helpers.js                # IP del cliente, asyncHandler
│   ├── identity.js               # User ID, correo y nombre de usuario
│   ├── logger.js                 # logger JSON en produccion
│   └── passwordPolicy.js         # politica de contrasenas y score
├── database/
│   ├── schema.sql                # tablas, triggers, vista de la matriz
│   └── seed.sql                  # catalogo inicial y matriz base
└── scripts/
    ├── setupDatabase.js          # npm run db:setup
    └── seedDatabase.js           # npm run db:seed
```

## Puesta en marcha

```bash
cd back
npm install
cp .env.example .env      # ajustar credenciales y JWT_SECRET

# Crear la base (una vez) en PostgreSQL
psql -U postgres -c "CREATE DATABASE legalshield;"

npm run db:setup          # aplica database/schema.sql
npm run db:seed           # catalogo + usuarios + expedientes, con hashes bcrypt reales
npm run dev               # http://localhost:4000
```

Comprobar salud: `curl http://localhost:4000/health`

La contrasena inicial de las cuentas de demostracion es la de `DEMO_PASSWORD`
(por defecto `Juris2026!Abg`).

## Endpoints

### Autenticacion · `/api/auth`

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| POST | `/register` | publica | Emite `LEG-2026-XXXX`, valida complejidad (12 chars, mayuscula, minuscula, numero, simbolo), hashea con bcrypt 12 rounds y guarda el primer hash en `password_history`. |
| POST | `/login` | publica | Bloquea con 403 si `is_locked`; si la clave falla incrementa `failed_attempts`; al llegar a 3 marca `is_locked` y escribe `AUTH_LOCKED`; si es correcta reinicia el contador y emite JWT con User ID + permisos RBAC, registrando `AUTH_SUCCESS`. |
| POST | `/refresh` | refresh token | Rota el refresh token y devuelve un access token nuevo. |
| POST | `/unlock` | `TOKEN_RESET` | Desbloquea la cuenta: `is_locked = FALSE`, `failed_attempts = 0`. |
| GET | `/me` | sesion | Identidad y permisos vigentes del titular. |
| POST | `/logout` | sesion | Cierra la sesion (evidencia en bitacora; el JWT es sin estado). |
| GET | `/directory` | sesion | Listado de cuentas no sensibles para la pantalla de login. |
| GET | `/profile` | sesion | Perfil completo + historial de contrasenas (5 ultimas). |
| PUT | `/profile` | sesion | Edicion de nombre, correo, despacho, departamento y telefono. El rol no es autoeditable. |
| PUT | `/password` | sesion | Cambio de clave: valida la actual, exige la politica y rechaza reutilizar las ultimas 5. |
| GET | `/password-history` | sesion | Metadatos del historial de claves. |

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
`legal_cases`, `security_logs`.

Dos garantias las impone el esquema, no el codigo de aplicacion:

- `security_logs` es **inmutable**: el trigger `trg_security_logs_immutable` lanza
  excepcion ante cualquier `UPDATE` o `DELETE`.
- `user_code` cumple el patron `^LEG-[0-9]{4}-[0-9]{4}$` mediante `CHECK`.

El trigger `trg_users_updated_at` mantiene `updated_at` sin intervencion de la API.

## Decisiones de seguridad

- **BCrypt 12 rounds** en registro y cambio de clave. El hash nunca sale de la API.
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
  aborta si `JWT_SECRET` es corto o si coincide con `JWT_REFRESH_SECRET`.

## Puntos a revisar antes de produccion

1. El `.env` de este repo contiene secretos de desarrollo de ejemplo. Rotar
   `JWT_SECRET`, `JWT_REFRESH_SECRET` y la contrasena de la base.
2. `security_logs` crece sin limite: definir politica de retencion y archivado
   (particionado por mes o exportacion periodica), nunca con `DELETE`.
3. `pool.query('SELECT 1')` en `/health` no distingue un fallo de red de uno de
   credenciales; en produccion conviene validar tambien el esquema instalado.
4. El frontend sigue leyendo del store en memoria: falta el cliente HTTP que
   consuma estos endpoints (`src/store/useApiStore.js`) y el cambio de
   `useAppStore` a esa capa.
5. No hay suite de pruebas ni migraciones versionadas: `schema.sql` es
   idempotente pero no registra historial de cambios de esquema.