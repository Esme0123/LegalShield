# TLS y HSTS de LegalShield

En desarrollo la API y el frontend corren por HTTP en `localhost`: no hay TLS en local. Este
documento explica el soporte tecnico que trae el backend para operar detras de un proxy inverso
que termine TLS. La configuracion de estas opciones corresponde a quien despliegue la
aplicacion; en desarrollo estan apagadas.

## Modelo

- El TLS lo termina un proxy inverso o un balanceador. El backend de Node recibe HTTP desde ese
  proxy y **no** gestiona certificados.
- El backend se entera de que la conexion original fue HTTPS por la cabecera
  `X-Forwarded-Proto`, y solo si `TRUST_PROXY` confia en ese proxy.

## Redireccion de HTTP a HTTPS

Con `NODE_ENV=production` y `HTTPS_REDIRECT=true`, toda peticion que el proxy marque como HTTP se
redirige con `308` a `https://<PUBLIC_API_HOST>` conservando la ruta y la consulta. `GET /health`
queda exenta, porque los sondeos de salud suelen llegar por HTTP interno. Esta opcion esta
apagada por defecto y se ignora fuera de produccion.

| Variable | Para que sirve |
| :--- | :--- |
| `TRUST_PROXY` | Numero de saltos de proxy (p. ej. `1`) o lista de IP/CIDR de confianza. Hace que Express use `X-Forwarded-Proto` y `X-Forwarded-For`. No usar `true`. |
| `HTTPS_REDIRECT` | `true` activa la redireccion. Exige `TRUST_PROXY` y `PUBLIC_API_HOST`. |
| `PUBLIC_API_HOST` | Host publico de la API, sin esquema ni ruta. Es el destino fijo de la redireccion: evita tomarlo de una cabecera manipulable. |

Si `HTTPS_REDIRECT=true` y falta `TRUST_PROXY` o `PUBLIC_API_HOST` (o este ultimo es invalido),
el servidor **no arranca** (fallo seguro): sin `TRUST_PROXY` todo parecería HTTP y se produciria
un bucle de redirecciones.

## HSTS

- El backend envia `Strict-Transport-Security: max-age=<HSTS_MAX_AGE>; includeSubDomains` solo
  con `NODE_ENV=production`. `HSTS_MAX_AGE` son segundos y vale `31536000` (un año) por defecto.
- No se activa `preload`: inscribir el dominio en la lista de precarga de los navegadores es
  dificil de revertir.
- Antes de subir `HSTS_MAX_AGE` a un año conviene probar con un valor corto (por ejemplo `300`)
  para confirmar que ningun subdominio necesita HTTP.
