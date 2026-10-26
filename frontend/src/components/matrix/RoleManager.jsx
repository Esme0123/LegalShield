import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, UserCog } from 'lucide-react'
import { Badge } from '@/components/ui/primitives'
import { rolesApi } from '@/lib/apiClient'
import { toast } from '@/store/toastStore'

/** Rol del Oficial de Seguridad: el servidor tampoco permite eliminarlo. */
const PROTECTED_ROLES = ['osi']
const EMPTY_FORM = { code: '', name: '', description: '' }

/**
 * Alta y baja de roles contra /api/roles. Solo se monta con ROLES_MANAGE; el
 * servidor vuelve a validar el permiso en cada peticion.
 */
export default function RoleManager() {
  const [roles, setRoles] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const data = await rolesApi.matrix()
      setRoles(data.roles ?? [])
    } catch (error) {
      toast.danger('No se pudieron cargar los roles', error.message)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleChange = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }))

  const handleCreate = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      const { role } = await rolesApi.create({
        code: form.code.trim().toLowerCase(),
        name: form.name.trim(),
        description: form.description.trim(),
      })
      toast.mint('Rol creado', `${role.name} (${role.code}) no tiene permisos hasta que se le asignen`)
      setForm(EMPTY_FORM)
      await refresh()
    } catch (error) {
      toast.danger('No se pudo crear el rol', error.message)
    } finally {
      setBusy(false)
    }
  }

  // Doble confirmacion en el mismo boton: evita borrados por un clic accidental.
  const handleDelete = async (code) => {
    if (pendingDelete !== code) {
      setPendingDelete(code)
      return
    }
    setBusy(true)
    try {
      await rolesApi.remove(code)
      toast.mint('Rol eliminado', code)
      await refresh()
    } catch (error) {
      toast.danger('No se pudo eliminar el rol', error.message)
    } finally {
      setPendingDelete(null)
      setBusy(false)
    }
  }

  return (
    <div className="ls-card space-y-5 p-5">
      <div className="flex items-center gap-2">
        <UserCog className="h-4 w-4 text-accent" />
        <h3 className="font-display text-[13px] font-bold tracking-tight">Administración de roles</h3>
      </div>

      <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end">
        <div>
          <label className="ls-label" htmlFor="role-code">Código</label>
          <input
            id="role-code"
            className="ls-input"
            value={form.code}
            onChange={handleChange('code')}
            placeholder="pasante"
            maxLength={32}
            required
          />
        </div>
        <div>
          <label className="ls-label" htmlFor="role-name">Nombre</label>
          <input
            id="role-name"
            className="ls-input"
            value={form.name}
            onChange={handleChange('name')}
            placeholder="Pasante"
            maxLength={80}
            required
          />
        </div>
        <div>
          <label className="ls-label" htmlFor="role-description">Descripción</label>
          <input
            id="role-description"
            className="ls-input"
            value={form.description}
            onChange={handleChange('description')}
            placeholder="Opcional"
            maxLength={500}
          />
        </div>
        <button type="submit" disabled={busy} className="ls-btn-primary px-4 text-xs">
          <Plus className="h-3.5 w-3.5" /> Crear rol
        </button>
      </form>

      <ul className="divide-y divide-line/40">
        {roles.map((role) => {
          const protectedRole = PROTECTED_ROLES.includes(role.code)
          const confirming = pendingDelete === role.code
          return (
            <li key={role.code} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="font-mono text-[11px] text-accent">{role.code}</span>
              <span className="text-[12px] font-semibold">{role.name}</span>
              {protectedRole && <Badge tone="pastel">Protegido</Badge>}
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{role.description}</span>
              <button
                type="button"
                disabled={busy || protectedRole}
                onClick={() => handleDelete(role.code)}
                onBlur={() => setPendingDelete(null)}
                title={protectedRole ? 'El rol osi no puede eliminarse' : 'Eliminar rol'}
                className={confirming ? 'ls-btn-danger px-3 text-xs' : 'rounded-lg border border-line/50 p-2 text-muted transition hover:border-accent/60 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40'}
              >
                {confirming ? 'Confirmar eliminación' : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
