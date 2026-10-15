/* Catalogos didacticos de referencia (roles/permisos e ISO 27001).
 * Los datos de negocio (usuarios, expedientes, auditoria, RBAC) viven en MySQL
 * y se consumen via la API REST; aqui no hay datos simulados. */

export const PERMISSIONS = [
  { id: 'CASES_CREATE', label: 'Crear expedientes', group: 'Expedientes', severity: 'alta' },
  { id: 'CASES_READ', label: 'Leer expedientes', group: 'Expedientes', severity: 'media' },
  { id: 'CASES_WRITE', label: 'Editar expedientes', group: 'Expedientes', severity: 'alta' },
  { id: 'CASES_ARCHIVE', label: 'Archivar expedientes', group: 'Expedientes', severity: 'critica' },
  { id: 'DOCS_REVEAL', label: 'Revelar documentos restringidos', group: 'Documentos', severity: 'critica' },
  { id: 'DOCS_DOWNLOAD', label: 'Descargar documentos', group: 'Documentos', severity: 'alta' },
  { id: 'LOGS_VIEW', label: 'Ver logs de auditoria', group: 'Auditoria', severity: 'media' },
  { id: 'LOGS_EXPORT', label: 'Exportar logs', group: 'Auditoria', severity: 'alta' },
  { id: 'AUDIT_RECEIPT', label: 'Emitir comprobantes', group: 'Auditoria', severity: 'media' },
  { id: 'RBAC_MANAGE', label: 'Administrar matriz RBAC', group: 'Seguridad', severity: 'critica' },
  { id: 'TOKEN_RESET', label: 'Emitir tokens de reseteo', group: 'Seguridad', severity: 'critica' },
  { id: 'RISK_ASSESS', label: 'Modificar evaluacion de riesgo', group: 'Seguridad', severity: 'media' },
  { id: 'USERS_READ', label: 'Ver lista y detalles de usuarios', group: 'Usuarios', severity: 'media' },
  { id: 'USERS_CREATE', label: 'Registrar usuarios', group: 'Usuarios', severity: 'alta' },
  { id: 'USERS_UPDATE', label: 'Editar datos, rol o estado', group: 'Usuarios', severity: 'alta' },
  { id: 'USERS_DELETE', label: 'Dar de baja (desactivar) usuarios', group: 'Usuarios', severity: 'critica' },
  { id: 'USERS_UNLOCK', label: 'Desbloquear usuarios y resetear clave', group: 'Usuarios', severity: 'critica' },
  { id: 'USERS_MANAGE', label: 'Gestionar el ABM completo de usuarios', group: 'Usuarios', severity: 'critica' },
  { id: 'ROLES_MANAGE', label: 'Modificar la matriz de roles y permisos', group: 'Seguridad', severity: 'critica' },
  { id: 'ACCOUNT_UNLOCK', label: 'Desbloquear cuentas inhabilitadas temporalmente', group: 'Seguridad', severity: 'critica' },
  { id: 'SECURITY_LOGS_VIEW', label: 'Ver la bitacora de seguridad', group: 'Auditoria', severity: 'critica' },
]

export const ROLES = [
  {
    id: 'osi',
    label: 'OSI',
    short: 'OSI',
    description: 'Oficial de Seguridad de la Informacion. ABM de usuarios, matriz RBAC y bitacora de seguridad.',
    accent: 'critica',
  },
  {
    id: 'socio',
    label: 'Socio',
    short: 'SOC',
    description: 'Direccion del despacho. Responsabilidad final sobre el cierre de expedientes.',
    accent: 'pastel',
  },
  {
    id: 'abogado',
    label: 'Abogado',
    short: 'ABG',
    description: 'Practicante principal con firma procesal y acceso a la prueba documental.',
    accent: 'accent',
  },
  {
    id: 'asistente',
    label: 'Asistente',
    short: 'AST',
    description: 'Soporte administrativo. Opera expedientes sin acceso a material restringido.',
    accent: 'info',
  },
  {
    id: 'cliente',
    label: 'Cliente',
    short: 'CLI',
    description: 'Acceso externo limitado al seguimiento de su propio expediente.',
    accent: 'ice',
  },
]

/* Roles que un usuario puede solicitar al registrarse en /register. */
export const REGISTER_ROLES = [
  {
    id: 'abogado',
    label: 'Abogado',
    icon: 'gavel',
    description: 'Firma procesal y acceso a la prueba documental restringida.',
    department: 'Litigacion',
  },
  {
    id: 'asistente',
    label: 'Asistente',
    icon: 'userCheck',
    description: 'Tramitacion y soporte operativo sin material privilegiado.',
    department: 'Tramitacion',
  },
  {
    id: 'socio',
    label: 'Socio',
    icon: 'scale',
    description: 'Direccion del despacho y responsabilidad final sobre el cierre.',
    department: 'Direccion Juridica',
  },
]

/* =====================================================================
   SIS-321 · Matriz de roles y permisos por sistema / recurso
   Replica de la planilla "SIS 321 U1 MatrizRoles EjLPQ.xlsx" (UCB):
   cuatro sistemas agrupados y nueve roles filas. Los identificadores de
   recurso son unicos por sistema porque "Consultas" y "Reportes" se
   repiten en los Sistemas A y B.
   ===================================================================== */

export const SIS321_SYSTEMS = [
  {
    id: 'RED',
    label: 'RED',
    long: 'RED · Infraestructura y puesto de trabajo',
    description: 'Plataforma institucional, altas de usuarios, repositorio interno e impresion.',
    resources: [
      { id: 'RED_SO', label: 'Sistema operativo' },
      { id: 'RED_USUARIOS', label: 'Administracion usuarios' },
      { id: 'RED_DOCUMENTOS', label: 'Documentos internos' },
      { id: 'RED_IMPRESORAS', label: 'Gestion de impresoras' },
    ],
  },
  {
    id: 'CORREO',
    label: 'CORREO',
    long: 'CORREO · Mensajeria institucional',
    description: 'Buzon interno, dominios externos y cliente web OWA.',
    resources: [
      { id: 'CORREO_INTERNO', label: 'Correo interno' },
      { id: 'CORREO_EXTERNO', label: 'Correo externo' },
      { id: 'CORREO_OWA', label: 'OWA' },
    ],
  },
  {
    id: 'SISTEMA_A',
    label: 'SISTEMA A',
    long: 'SISTEMA A · Gestion legal',
    description: 'Operacion transaccional del sistema juridico del despacho.',
    resources: [
      { id: 'A_CONSULTAS', label: 'Consultas' },
      { id: 'A_MODIFICACIONES', label: 'Modificaciones' },
      { id: 'A_REGISTRO_CUENTAS', label: 'Registro cuentas' },
      { id: 'A_ABM_USUARIOS', label: 'ABM Usuarios' },
      { id: 'A_REPORTES', label: 'Reportes' },
      { id: 'A_BAJA_COMPROBANTES', label: 'Baja de comprobantes' },
    ],
  },
  {
    id: 'SISTEMA_B',
    label: 'SISTEMA B',
    long: 'SISTEMA B · Auditoria',
    description: 'Control posterior: personal, planillas, asistencia y rendicion.',
    resources: [
      { id: 'B_CONSULTAS', label: 'Consultas' },
      { id: 'B_PERSONAL', label: 'Administracion de personal' },
      { id: 'B_PLANILLAS', label: 'Planillas' },
      { id: 'B_ASISTENCIA', label: 'Control de asistencia' },
      { id: 'B_REPORTES', label: 'Reportes' },
    ],
  },
]

export const SIS321_ROLES = [
  { id: 'gerente', label: 'Gerente / Socio', short: 'GER', description: 'Direccion del despacho y aprobacion final de operaciones.' },
  { id: 'tecnologia', label: 'Tecnologia', short: 'TEC', description: 'Infraestructura RED, correo institucional y soporte tecnico.' },
  { id: 'seguridad', label: 'Seguridad', short: 'SEG', description: 'Monitoreo, altas/bajas de cuentas y control de accesos.' },
  { id: 'contador', label: 'Contador', short: 'CON', description: 'Planillas, comprobantes y rendicion financiera.' },
  { id: 'patrocinante', label: 'Abogado Patrocinante', short: 'PAT', description: 'Gestion y modificacion de expedientes propios.' },
  { id: 'auditor', label: 'Auditor', short: 'AUD', description: 'Consulta y reporte del Sistema B sin poder de modificacion.' },
  { id: 'analista', label: 'Analista', short: 'ANA', description: 'Consulta operativa, sin operaciones sensibles.' },
  { id: 'autorizador', label: 'Autorizador', short: 'AUT', description: 'Aprobacion de bajas de comprobantes y cierres de gestion.' },
  { id: 'pasante', label: 'Pasante', short: 'PAS', description: 'Consulta minima y despacho de documentos internos.' },
]

const grant = (...ids) => ids

/** Estado inicial de la planilla: rol -> recursos concedidos. */
export const SIS321_MATRIX = {
  gerente: grant(
    'RED_SO',
    'RED_USUARIOS',
    'RED_DOCUMENTOS',
    'RED_IMPRESORAS',
    'CORREO_INTERNO',
    'CORREO_EXTERNO',
    'CORREO_OWA',
    'A_CONSULTAS',
    'A_MODIFICACIONES',
    'A_REGISTRO_CUENTAS',
    'A_ABM_USUARIOS',
    'A_REPORTES',
    'A_BAJA_COMPROBANTES',
    'B_CONSULTAS',
    'B_PERSONAL',
    'B_PLANILLAS',
    'B_ASISTENCIA',
    'B_REPORTES',
  ),
  tecnologia: grant(
    'RED_SO',
    'RED_USUARIOS',
    'RED_DOCUMENTOS',
    'RED_IMPRESORAS',
    'CORREO_INTERNO',
    'CORREO_EXTERNO',
    'CORREO_OWA',
    'A_CONSULTAS',
    'A_ABM_USUARIOS',
    'A_REPORTES',
    'B_CONSULTAS',
    'B_ASISTENCIA',
    'B_REPORTES',
  ),
  seguridad: grant(
    'RED_SO',
    'RED_USUARIOS',
    'RED_DOCUMENTOS',
    'CORREO_INTERNO',
    'CORREO_EXTERNO',
    'CORREO_OWA',
    'A_CONSULTAS',
    'A_ABM_USUARIOS',
    'A_REPORTES',
    'A_BAJA_COMPROBANTES',
    'B_CONSULTAS',
    'B_PERSONAL',
    'B_ASISTENCIA',
    'B_REPORTES',
  ),
  contador: grant(
    'RED_DOCUMENTOS',
    'CORREO_INTERNO',
    'CORREO_EXTERNO',
    'CORREO_OWA',
    'A_CONSULTAS',
    'A_MODIFICACIONES',
    'A_REGISTRO_CUENTAS',
    'A_REPORTES',
    'B_CONSULTAS',
    'B_PERSONAL',
    'B_PLANILLAS',
    'B_ASISTENCIA',
    'B_REPORTES',
  ),
  patrocinante: grant(
    'RED_DOCUMENTOS',
    'CORREO_INTERNO',
    'CORREO_EXTERNO',
    'A_CONSULTAS',
    'A_MODIFICACIONES',
    'A_REGISTRO_CUENTAS',
    'A_REPORTES',
    'B_CONSULTAS',
    'B_ASISTENCIA',
  ),
  auditor: grant('RED_DOCUMENTOS', 'CORREO_INTERNO', 'CORREO_EXTERNO', 'A_CONSULTAS', 'A_REPORTES', 'B_CONSULTAS', 'B_REPORTES'),
  analista: grant('RED_DOCUMENTOS', 'CORREO_INTERNO', 'CORREO_EXTERNO', 'A_CONSULTAS', 'A_REPORTES', 'B_CONSULTAS'),
  autorizador: grant(
    'RED_DOCUMENTOS',
    'CORREO_INTERNO',
    'CORREO_EXTERNO',
    'A_CONSULTAS',
    'A_MODIFICACIONES',
    'A_REPORTES',
    'A_BAJA_COMPROBANTES',
    'B_CONSULTAS',
    'B_PERSONAL',
    'B_ASISTENCIA',
    'B_REPORTES',
  ),
  pasante: grant('RED_DOCUMENTOS', 'CORREO_INTERNO', 'CORREO_EXTERNO', 'A_CONSULTAS', 'A_BAJA_COMPROBANTES'),
}

/* =====================================================================
   Resumen · Matriz de clasificacion de informacion
   Cada dimension (confidencialidad, integridad, disponibilidad) se valora
   de 1 a 3 y se convierte a porcentaje; el total ponderado define el nivel.
   ===================================================================== */

export const INFO_ASSETS = [
  { id: 'IA-01', name: 'Expediente judicial confidencial', owner: 'Direccion Juridica', confidentiality: 3, integrity: 3, availability: 2 },
  { id: 'IA-02', name: 'Base de datos de clientes', owner: 'Tramitacion', confidentiality: 3, integrity: 3, availability: 3 },
  { id: 'IA-03', name: 'Llaves de cifrado y certificados', owner: 'Tecnologia', confidentiality: 3, integrity: 3, availability: 2 },
  { id: 'IA-04', name: 'Contratos y escrituras firmadas', owner: 'Litigacion', confidentiality: 2, integrity: 3, availability: 2 },
  { id: 'IA-05', name: 'Planillas y liquidaciones de personal', owner: 'Contabilidad', confidentiality: 3, integrity: 2, availability: 2 },
  { id: 'IA-06', name: 'Actas de asistencia y horarios', owner: 'Seguridad', confidentiality: 1, integrity: 2, availability: 3 },
  { id: 'IA-07', name: 'Bitacora de auditoria del sistema', owner: 'Seguridad', confidentiality: 2, integrity: 3, availability: 3 },
  { id: 'IA-08', name: 'Manuales y procedimiento del despacho', owner: 'Direccion Juridica', confidentiality: 1, integrity: 2, availability: 2 },
  { id: 'IA-09', name: 'Respaldo de expedientes electronicos', owner: 'Archivo', confidentiality: 2, integrity: 3, availability: 3 },
  { id: 'IA-10', name: 'Correo institucional y OWA', owner: 'Tecnologia', confidentiality: 2, integrity: 1, availability: 3 },
]

export const RISK_CONTROLS = [
  { id: 'A.5.1', name: 'Politicas de seguridad de la informacion', domain: 'Organizacional', score: 4, target: 5 },
  { id: 'A.5.15', name: 'Control de acceso', domain: 'Organizacional', score: 4, target: 5 },
  { id: 'A.5.24', name: 'Gestion de incidentes', domain: 'Organizacional', score: 2, target: 4 },
  { id: 'A.6.1', name: 'Cifrado de informacion', domain: 'Tecnologico', score: 5, target: 5 },
  { id: 'A.6.3', name: 'Proteccion de datos personales', domain: 'Tecnologico', score: 3, target: 5 },
  { id: 'A.8.2', name: 'Antimalware', domain: 'Tecnologico', score: 4, target: 5 },
  { id: 'A.8.5', name: 'Copias de seguridad', domain: 'Tecnologico', score: 2, target: 4 },
  { id: 'A.8.15', name: 'Registro (logging)', domain: 'Tecnologico', score: 5, target: 5 },
  { id: 'A.8.16', name: 'Monitorizacion de eventos', domain: 'Tecnologico', score: 3, target: 4 },
  { id: 'A.9.2', name: 'Auditoria continua', domain: 'Aplicacion', score: 3, target: 4 },
  { id: 'A.10.1', name: 'Criptografia y claves', domain: 'Aplicacion', score: 4, target: 5 },
  { id: 'A.12.4', name: 'Gestion de proveedores', domain: 'Aplicacion', score: 2, target: 3 },
]

export const RISK_HEATMAP = [
  { id: 'R-01', name: 'Acceso indebido a expediente restringido', probability: 4, impact: 5, treatment: 'Revocar' },
  { id: 'R-02', name: 'Exfiltracion de prueba documental', probability: 3, impact: 5, treatment: 'Reducir' },
  { id: 'R-03', name: 'Eliminacion de evidencia por insiders', probability: 2, impact: 5, treatment: 'Evitar' },
  { id: 'R-04', name: 'Denegacion de servicio al portal interno', probability: 2, impact: 3, treatment: 'Transferir' },
  { id: 'R-05', name: 'Uso indebido de token de reseteo', probability: 3, impact: 4, treatment: 'Reducir' },
  { id: 'R-06', name: 'Perdida de respaldo de expedientes', probability: 1, impact: 4, treatment: 'Evitar' },
  { id: 'R-07', name: 'Fuga por dispositivo no gestionado', probability: 3, impact: 3, treatment: 'Aceptar' },
  { id: 'R-08', name: 'Clausula de reserva no ejecutada', probability: 1, impact: 2, treatment: 'Aceptar' },
]

