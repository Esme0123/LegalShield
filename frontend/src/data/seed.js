/* Catalogos didacticos de referencia (etiquetas de permisos e ISO 27001).
 * Los datos de negocio (usuarios, roles, expedientes, auditoria, RBAC) viven en MySQL
 * y se consumen via la API REST; aqui no hay datos simulados. */

export const PERMISSIONS = [
  { id: 'CASES_CREATE', label: 'Crear expedientes', group: 'Expedientes', severity: 'alta' },
  { id: 'CASES_READ', label: 'Consultar expedientes', group: 'Expedientes', severity: 'media' },
  { id: 'CASES_WRITE', label: 'Editar expedientes', group: 'Expedientes', severity: 'alta' },
  { id: 'CASES_ARCHIVE', label: 'Archivar expedientes', group: 'Expedientes', severity: 'critica' },
  { id: 'DOCS_REVEAL', label: 'Revelar documentos restringidos', group: 'Documentación', severity: 'critica' },
  { id: 'DOCS_DOWNLOAD', label: 'Descargar documentos', group: 'Documentación', severity: 'alta' },
  { id: 'LOGS_VIEW', label: 'Consultar historial', group: 'Auditoría', severity: 'media' },
  { id: 'LOGS_EXPORT', label: 'Exportar bitácora', group: 'Auditoría', severity: 'alta' },
  { id: 'AUDIT_RECEIPT', label: 'Emitir comprobantes', group: 'Auditoría', severity: 'media' },
  { id: 'RBAC_MANAGE', label: 'Administrar permisos por rol', group: 'Seguridad', severity: 'critica' },
  { id: 'TOKEN_RESET', label: 'Emitir tokens de reseteo', group: 'Seguridad', severity: 'critica' },
  { id: 'RISK_ASSESS', label: 'Modificar la evaluación de riesgo', group: 'Seguridad', severity: 'media' },
  { id: 'USERS_READ', label: 'Ver la lista de usuarios', group: 'Usuarios', severity: 'media' },
  { id: 'USERS_CREATE', label: 'Registrar usuarios', group: 'Usuarios', severity: 'alta' },
  { id: 'USERS_UPDATE', label: 'Editar datos, rol o estado', group: 'Usuarios', severity: 'alta' },
  { id: 'USERS_DELETE', label: 'Dar de baja usuarios', group: 'Usuarios', severity: 'critica' },
  { id: 'USERS_UNLOCK', label: 'Desbloquear usuarios (sin reset de clave)', group: 'Usuarios', severity: 'critica' },
  { id: 'USERS_MANAGE', label: 'Gestionar usuarios', group: 'Usuarios', severity: 'critica' },
  { id: 'ROLES_MANAGE', label: 'Modificar la matriz de permisos', group: 'Seguridad', severity: 'critica' },
  { id: 'ACCOUNT_UNLOCK', label: 'Desbloquear cuentas inhabilitadas', group: 'Seguridad', severity: 'critica' },
  { id: 'SECURITY_LOGS_VIEW', label: 'Consultar la bitácora de seguridad', group: 'Auditoría', severity: 'critica' },
]

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

