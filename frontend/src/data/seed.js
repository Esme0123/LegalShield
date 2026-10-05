/* Datos ficticios del simulador LegalShield · 100% en memoria. */

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
]

export const ROLES = [
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

export const INITIAL_RBAC = {
  socio: PERMISSIONS.map((p) => p.id),
  abogado: [
    'CASES_CREATE',
    'CASES_READ',
    'CASES_WRITE',
    'DOCS_REVEAL',
    'LOGS_VIEW',
    'AUDIT_RECEIPT',
    'RISK_ASSESS',
  ],
  asistente: ['CASES_CREATE', 'CASES_READ', 'CASES_WRITE', 'AUDIT_RECEIPT'],
  cliente: ['CASES_READ'],
}

export const DIRECTORY = [
  { userId: 'LEG-2026-0001', name: 'Mariana Solis R.', role: 'socio', department: 'Direccion Juridica' },
  { userId: 'LEG-2026-0142', name: 'Diego Ferrer', role: 'abogado', department: 'Litigacion' },
  { userId: 'LEG-2026-0277', name: 'Lucia Ampara', role: 'asistente', department: 'Tramitacion' },
  { userId: 'LEG-2026-0390', name: 'Andres Quintero', role: 'cliente', department: 'Externo' },
  { userId: 'LEG-2026-0411', name: 'Paula Sandoval', role: 'asistente', department: 'Archivo' },
]

/* Contrasena inicial del directorio de demostracion (SIMULACION: vive en memoria). */
export const DEMO_PASSWORD = 'Juris2026!Abg'

/* Fichas de identidad que alimentan la vista /profile y el alta /register. */
export const USER_PROFILES = {
  'LEG-2026-0001': {
    firstName: 'Mariana',
    lastName: 'Solis',
    email: 'mariana.solis@vidalpenalto.co',
    phone: '+57 601 742 1180',
    firm: 'Vidal & Penalto Bufetes',
    department: 'Direccion Juridica',
    roleLabel: 'Gerente / Socio',
    title: 'Socia directora · Firma procesal',
    joinedAt: '2024-02-05T09:00:00.000Z',
  },
  'LEG-2026-0142': {
    firstName: 'Diego',
    lastName: 'Ferrer',
    email: 'diego.ferrer@vidalpenalto.co',
    phone: '+57 300 552 8841',
    firm: 'Vidal & Penalto Bufetes',
    department: 'Litigacion',
    roleLabel: 'Abogado Patrocinante',
    title: 'Abogado patrocinante · Litigacion',
    joinedAt: '2025-06-16T09:00:00.000Z',
  },
  'LEG-2026-0277': {
    firstName: 'Lucia',
    lastName: 'Ampara',
    email: 'lucia.ampara@vidalpenalto.co',
    phone: '+57 315 409 2277',
    firm: 'Vidal & Penalto Bufetes',
    department: 'Tramitacion',
    roleLabel: 'Asistente',
    title: 'Asistente de tramitacion',
    joinedAt: '2025-01-20T09:00:00.000Z',
  },
  'LEG-2026-0390': {
    firstName: 'Andres',
    lastName: 'Quintero',
    email: 'andres.quintero@metalurgiaandes.co',
    phone: '+57 310 228 4419',
    firm: 'Metalurgia Andes S.A.S.',
    department: 'Externo',
    roleLabel: 'Cliente',
    title: 'Apoderado · Cliente externo',
    joinedAt: '2025-09-02T09:00:00.000Z',
  },
  'LEG-2026-0411': {
    firstName: 'Paula',
    lastName: 'Sandoval',
    email: 'paula.sandoval@vidalpenalto.co',
    phone: '+57 320 771 3390',
    firm: 'Vidal & Penalto Bufetes',
    department: 'Archivo',
    roleLabel: 'Analista',
    title: 'Analista de archivo documental',
    joinedAt: '2024-11-11T09:00:00.000Z',
  },
}

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

export const CASES = [
  {
    id: 'EXP-2026-0014',
    title: 'Despido disciplinario · Metalurgia Andes',
    client: 'Metalurgia Andes S.A.S.',
    court: 'Juzgado 12 Laboral de Bogota',
    matter: 'Laboral',
    stage: 'Prueba',
    risk: 'alta',
    deadline: '2026-10-21',
    progress: 62,
    owner: 'LEG-2026-0142',
    privileged: true,
    docs: [
      { id: 'D-101', name: 'Contrato laboral + anexos', pages: 24, classification: 'Confidencial' },
      { id: 'D-102', name: 'Acta deTermination disciplinario', pages: 9, classification: 'Privilegiada' },
      { id: 'D-103', name: 'Peritaje contable', pages: 41, classification: 'Restringida' },
    ],
  },
  {
    id: 'EXP-2026-0021',
    title: 'Nulidad contractual · Consorcion Vento',
    client: 'Consorcion Vento S.A.',
    court: 'Tribunal Superior',
    matter: 'Civil',
    stage: 'Contestacion',
    risk: 'critica',
    deadline: '2026-10-09',
    progress: 38,
    owner: 'LEG-2026-0001',
    privileged: false,
    docs: [
      { id: 'D-201', name: 'Minuta de conciliacion', pages: 6, classification: 'Restringida' },
      { id: 'D-202', name: 'Contrato marco (anexos I-VIII)', pages: 88, classification: 'Confidencial' },
    ],
  },
  {
    id: 'EXP-2026-0033',
    title: 'Derecho de peticion · Ministerio de Salud',
    client: 'Redaccion Norte (periodista)',
    court: 'Ministerio de Salud',
    matter: 'Administrativo',
    stage: 'Seguimiento',
    risk: 'media',
    deadline: '2026-11-02',
    progress: 84,
    owner: 'LEG-2026-0277',
    privileged: false,
    docs: [
      { id: 'D-301', name: 'Derecho de peticion PQR-2026-1187', pages: 12, classification: 'Publica' },
      { id: 'D-302', name: 'Anexos de prueba documental', pages: 31, classification: 'Confidencial' },
    ],
  },
  {
    id: 'EXP-2026-0047',
    title: 'Sucesion intestada · Familia Ortegas',
    client: 'Familia Ortega Medina',
    court: 'Juzgado 3 de Sucesiones',
    matter: 'Familia',
    stage: 'Peritaje',
    risk: 'baja',
    deadline: '2026-11-18',
    progress: 47,
    owner: 'LEG-2026-0001',
    privileged: true,
    docs: [
      { id: 'D-401', name: 'Testamento abierto', pages: 4, classification: 'Privilegiada' },
      { id: 'D-402', name: 'Inventario de bienes', pages: 19, classification: 'Restringida' },
    ],
  },
  {
    id: 'EXP-2026-0058',
    title: 'Propiedad industrial · Trademark Falcon',
    client: 'Falcon Studio SAS',
    court: 'SIC - Decision 3',
    matter: 'Comercial',
    stage: 'Ejecucion',
    risk: 'alta',
    deadline: '2026-10-27',
    progress: 71,
    owner: 'LEG-2026-0142',
    privileged: false,
    docs: [
      { id: 'D-501', name: 'Registro de marca (certificado)', pages: 3, classification: 'Publica' },
      { id: 'D-502', name: 'Evidencia de infraccion (capturas)', pages: 27, classification: 'Confidencial' },
    ],
  },
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

export const LIVESTREAM_TEMPLATES = [
  { type: 'AUTH_SUCCESS', severity: 'info', actor: 'LEG-2026-0142', message: 'Autenticacion correcta desde IP 10.20.4.18 (MFA passkey)' },
  { type: 'AUTH_SUCCESS', severity: 'info', actor: 'LEG-2026-0277', message: 'Sesion iniciada · token de 45 min emitido' },
  { type: 'INTRUSION_BLOCKED', severity: 'warn', actor: 'DESCONOCIDO', message: 'Patron XSS bloqueado en /api/cases/:id/docs (WAF nivel 2)' },
  { type: 'INTRUSION_BLOCKED', severity: 'critico', actor: 'DESCONOCIDO', message: 'Fuerza bruta: 6 intentos sobre LEG-2026-0142 bloqueados por rate-limit' },
  { type: 'DOC_REVEALED', severity: 'warn', actor: 'LEG-2026-0001', message: 'Documento D-103 revelado bajo rol Socio (justificado)' },
  { type: 'PERMISSION_CHANGED', severity: 'warn', actor: 'LEG-2026-0001', message: 'Rol Asistente: permiso LOGS_VIEW retirado' },
  { type: 'EXPORT_BLOCKED', severity: 'critico', actor: 'LEG-2026-0390', message: 'Cliente intentó exportar expediente fuera de su ambito' },
  { type: 'CASE_ARCHIVED', severity: 'info', actor: 'LEG-2026-0142', message: 'Expediente EXP-2026-0033 archivado con sello de integridad' },
  { type: 'TOKEN_ISSUED', severity: 'warn', actor: 'LEG-2026-0001', message: 'Token de reseteo temporal emitido con TTL 900s' },
  { type: 'INTEGRITY_CHECK', severity: 'info', actor: 'SISTEMA', message: 'Hash SHA-256 verificado sobre 128 expedientes' },
]

export const SEED_LOGS = [
  {
    id: 'LG-9a12',
    ts: '2026-10-05T07:41:02.000Z',
    type: 'AUTH_SUCCESS',
    severity: 'info',
    actor: 'LEG-2026-0001',
    target: 'Portal LegalShield',
    message: 'Primer inicio de sesion del dia tras rotacion de claves',
  },
  {
    id: 'LG-9a13',
    ts: '2026-10-05T08:02:55.000Z',
    type: 'PERMISSION_CHANGED',
    severity: 'warn',
    actor: 'LEG-2026-0001',
    target: 'rol:asistente',
    message: 'Reajuste de seguridad: LOGS_VIEW retirado por minima separacion de funciones',
  },
  {
    id: 'LG-9a14',
    ts: '2026-10-05T08:44:19.000Z',
    type: 'INTRUSION_BLOCKED',
    severity: 'critico',
    actor: 'DESCONOCIDO',
    target: '10.44.9.201',
    message: 'Intento de acceso a EXP-2026-0021 sin rol asignado · bloqueo 15 min',
  },
  {
    id: 'LG-9a15',
    ts: '2026-10-05T09:15:40.000Z',
    type: 'LOGIN_LOCKED',
    severity: 'critico',
    actor: 'LEG-2026-0411',
    target: 'sistema:auth',
    message: 'Cuenta bloqueada tras 3 intentos fallidos · notificacion al administrador enviada',
  },
  {
    id: 'LG-9a16',
    ts: '2026-10-05T09:47:03.000Z',
    type: 'DOC_REVEALED',
    severity: 'warn',
    actor: 'LEG-2026-0001',
    target: 'D-103',
    message: 'Revelacion de documento restringido registrada con justificacion',
  },
]