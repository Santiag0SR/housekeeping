# Housekeeping Dashboard

Panel de limpieza semanal conectado a Mews + Supabase.

## Setup rápido

### 1. Supabase — crear la tabla

Ve a tu proyecto en [supabase.com](https://supabase.com), abre el **SQL Editor** y ejecuta el contenido de `supabase-schema.sql`.

### 2. Variables de entorno

Crea un archivo `.env.local` en la raíz del proyecto (copia de `.env.local.example`):

```
MEWS_CLIENT_TOKEN=...        # De tu flujo n8n (ya lo tienes)
MEWS_ACCESS_TOKEN=...        # De tu flujo n8n (ya lo tienes)
MEWS_CLIENT_NAME=MiHotel Housekeeping 1.0.0

NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...   # En Supabase > Settings > API
SUPABASE_SERVICE_ROLE_KEY=...       # En Supabase > Settings > API (secret)
```

### 3. Instalar y arrancar

```bash
npm install
npm run dev
```

### 4. Deploy en Vercel

```bash
npx vercel
```

Añade las mismas variables de entorno en el dashboard de Vercel (Settings > Environment Variables).

---

## URLs por edificio

| Edificio | URL |
|----------|-----|
| JB | `tudominio.com/jb` |
| AB | `tudominio.com/ab` |
| FM | `tudominio.com/fm` |
| AO | `tudominio.com/ao` |
| GMC | `tudominio.com/gmc` |
| CDV | `tudominio.com/cdv` |
| Todos | `tudominio.com/all` |

---

## Lógica de limpieza por día

| Icono | Tipo | Descripción |
|-------|------|-------------|
| 🔄 Checkout | El huésped sale ese día — limpieza completa |
| 🛎️ Entrada | Nuevo huésped entra — preparar amenities según personas |
| 🏠 Estancia | Huésped continúa — mantenimiento |
| 🛋️ Sofá cama | Aparece cuando hay más de 2 personas |

## Notas técnicas

- Los datos de Mews se refrescan en cada carga y auto-refrescan cada 2 minutos
- El estado de limpieza se guarda en Supabase (`room_cleaning_status`)
- El estado se resetea automáticamente cada día (la tabla guarda por fecha)
- Los prefijos de edificio se detectan del nombre de habitación: `jb`, `ab`, `fm`, `ao`, `gmc`, `cdv`
