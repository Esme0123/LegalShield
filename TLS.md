# TLS y HSTS de LegalShield

En desarrollo la API y el frontend corren por HTTP en `localhost`. Este documento describe
como queda protegido el transporte en un despliegue real. **No hay TLS en local**: lo que
sigue se comprueba contra el dominio desplegado, no en `localhost`.

## Modelo

- El TLS lo termina la plataforma o un proxy inverso (Render, Vercel, Nginx, un balanceador).
  El backend de Node recibe HTTP desde ese proxy y **no** gestiona certificados.
- El backend se entera de que la conexion original fue HTTPS por la cabecera
  `X-Forwarded-Proto`, y solo si `TRUST_PROXY` confia en ese proxy.
- Las cookies de sesion (refresh token) llevan `Secure` cuando `NODE_ENV=production`, por lo
  que solo viajan por HTTPS.

## Variables del backend (`back/.env`)

| Variable | Valor en produccion | Para que sirve |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Activa HSTS, la cookie `Secure` y la redireccion. |
| `TRUST_PROXY` | numero de saltos (p. ej. `1`) o lista de IP/CIDR del proxy | Hace que Express use `X-Forwarded-Proto` y `X-Forwarded-For`. No usar `true`. |
| `HTTPS_REDIRECT` | `true` | Redirige con `308` toda peticion que el proxy marque como HTTP. |
| `PUBLIC_API_HOST` | host publico de la API, sin esquema ni ruta (p. ej. `api.ejemplo.com`) | Destino fijo de la redireccion; evita tomarlo de una cabecera manipulable. |
| `HSTS_MAX_AGE` | `31536000` (por defecto) | Segundos que el navegador exigira HTTPS. |
| `REFRESH_COOKIE_SAMESITE` | `strict`, o `none` si frontend y API estan en sitios distintos | `none` fuerza `Secure` y depende de HTTPS. |

Si `HTTPS_REDIRECT=true` y falta `TRUST_PROXY` o `PUBLIC_API_HOST`, el servidor **no arranca**
(fallo seguro): sin ellos todo parecería HTTP y se produciria un bucle de redirecciones.

## Pasos de despliegue

1. Publica el backend detras de una plataforma o proxy que termine TLS con un certificado
   valido (el de la plataforma, o Let's Encrypt si es un proxy propio).
2. Averigua cuantos proxies hay entre el cliente y Node y fija `TRUST_PROXY` con ese numero.
   Con un unico proxy gestionado, suele ser `1`.
3. Define `NODE_ENV=production`, `HTTPS_REDIRECT=true` y `PUBLIC_API_HOST`.
4. Lista en `CORS_ORIGINS` solo los origenes `https://` del frontend. En produccion el
   comodin `*` se ignora.
5. Sirve el frontend solo por HTTPS y apunta `VITE_API_BASE_URL` a `https://...`.
6. Comprueba que el sondeo de salud de la plataforma use `GET /health`: esa ruta no se
   redirige.

## HSTS

- El backend envia `Strict-Transport-Security: max-age=<HSTS_MAX_AGE>; includeSubDomains` solo
  con `NODE_ENV=production`. No se activa `preload`: inscribir el dominio en la lista de
  precarga de los navegadores es dificil de revertir.
- Antes de subir `HSTS_MAX_AGE` a un año, prueba con un valor corto (por ejemplo `300`) para
  confirmar que ningun subdominio necesita HTTP.
- El frontend lo sirve otro host: configura ahi sus propias cabeceras (en Vercel, la seccion
  `headers` de `vercel.json`).

## Verificacion contra el dominio desplegado

Sustituye `api.ejemplo.com` por el host real.

```bash
# 1. HTTP redirige a HTTPS (308)
curl -sI http://api.ejemplo.com/api/ | head -n 5

# 2. HTTPS responde y trae HSTS
curl -sI https://api.ejemplo.com/health | grep -i -E "^HTTP|strict-transport-security"

# 3. La cookie de sesion lleva HttpOnly, Secure y SameSite (el cierre de sesion la reenvia
#    para borrarla, con los mismos atributos)
curl -si -X POST https://api.ejemplo.com/api/auth/logout -H "X-Requested-With: XMLHttpRequest" \
  | grep -i "set-cookie"
```

## Simulacion local (no es una prueba de TLS)

Con el backend en `NODE_ENV=production`, `TRUST_PROXY=loopback`, `HTTPS_REDIRECT=true` y
`PUBLIC_API_HOST=api.ejemplo.test`, se puede simular el proxy con la cabecera:

```bash
curl -si http://localhost:4000/api/ -H "X-Forwarded-Proto: http"   # 308 hacia https://api.ejemplo.test/api/
curl -si http://localhost:4000/api/ -H "X-Forwarded-Proto: https"  # respuesta normal
```

Solo demuestra la logica de la redireccion. No prueba certificados ni cifrado.

## Pendiente

El punto C1 queda **parcial** hasta que se despliegue y se ejecute la verificacion de la
seccion anterior contra el dominio real.
