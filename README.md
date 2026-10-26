# LegalShield SaaS - Sistema de Gestión Legal Seguro

> **Proyecto de Reingeniería de Seguridad de Sistemas (SIS 321)**  
> **Universidad Católica Boliviana "San Pablo" - Unidad Académica Regional La Paz**  
> **Docente:** Mgr. Ing. Lourdes Peredo Quiroga  
> **Gestión:** 2026

---

## Descripción General

**LegalShield** es una plataforma web SaaS diseñada para la administración operativa y jurídica de despachos de abogados. El proyecto demuestra la transformación de una arquitectura web base vulnerable hacia un modelo de defensa en profundidad respaldado en los **7 Principios de Diseño Seguro**, las **5 Reglas de Oro** y el cumplimiento de controles **ISO 27001** / mitigaciones **OWASP Top 10**.

---

## Tabla de Usuarios y Credenciales del Sistema

> **Contraseña universal para todas las cuentas de demostración:** `Juris2026!Abg`

| Usuario (`nombre.apellido`) | Código Corporativo | Rol | Función en el Sistema | Permisos Principales |
| :--- | :--- | :--- | :--- | :--- |
| `osi.seguridad` | `LEG-2026-0002` | **OSI** | Oficial de Seguridad de la Información | Gestión de Usuarios (ABM), Matriz RBAC, Tokens de Desbloqueo, Logs de Seguridad. |
| `mariana.solis` | `LEG-2026-0001` | **Socio** | Dirección y Gestión de Despacho | Crear/Editar Expedientes, Asignar Abogados, Logs de Aplicación. |
| `diego.ferrer` | `LEG-2026-0142` | **Abogado** | Litigante y Gestión de Casos | Consultar y Actualizar Casos Asignados. |
| `paula.sando` | `LEG-2026-0411` | **Asistente** | Apoyo Operativo | Consulta de Expedientes (Solo Lectura). |
| `carlos.cliente` | `LEG-2026-0390` | **Cliente** | Titular de Causa | Consulta de Estado Procesal Propio. |

---

## Stack Tecnológico

- **Frontend:** React 19, Vite, Tailwind CSS, Lucide React Icons.
- **Backend API:** Node.js, Express.js (Arquitectura REST).
- **Base de Datos:** MySQL (XAMPP / Service Port 3306).
- **Seguridad & Crypto:** Bcrypt (Factor 12), JWT (Json Web Token), Express Rate Limit, CAPTCHA challenge.

---

## Cobertura de Principios de Diseño Seguro y OWASP Top 10

1. **Menor Privilegio:** Control de acceso dinámico RBAC por roles y permisos explícitos.
2. **Seguridad por Defecto:** Middlewares de denegación por defecto en endpoints de la API.
3. **Economía del Mecanismo:** Microservicios desacoplados de autenticación, expedientes y auditoría.
4. **Mediación Completa:** Interceptación y validación de propiedad de recursos en cada solicitud HTTP.
5. **Segregación de Privilegios:** Separación entre la administración de ciberseguridad (OSI) y la operación legal (Socio).
6. **Menos Asombro:** Interfaz corporativa limpia, terminología entendible e identificadores estandarizados (`nombre.apellido`).
7. **Mecanismo Menos Común:** Limitación de peticiones por IP, bloqueo temporal con persistencia en MySQL, desafío CAPTCHA anti-bot y tokens de desbloqueo de 6 dígitos validados por OSI.

---

## Guía de Instalación y Puesta en Marcha Local

### Prerrequisitos

- Node.js (v18 o superior)
- XAMPP con servicio MySQL iniciado en el puerto 3306

### Pasos de Ejecución

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/Esme0123/LegalShield.git
   cd LegalShield
   ```

2. **Configurar e inicializar el Backend:**
   ```bash
   cd back
   npm install
   npm run init-db    # Crea la base de datos legalshield_db y siembra los usuarios
   node server.js     # Servidor API corriendo en http://localhost:4000
   ```

3. **Configurar e inicializar el Frontend:**
   ```bash
   cd ../frontend
   npm install
   npm run dev        # Servidor de desarrollo en http://localhost:5173 o 5174
   ```

4. **Acceder a la aplicación:**
   Abre el navegador en http://localhost:5173 e ingresa con las credenciales de prueba (osi.seguridad o mariana.solis con clave Juris2026!Abg).
