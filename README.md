# Finanzas Personales

## Descripción

Aplicación simplificada de finanzas personales con registro diario de gastos, gastos fijos, metas de ahorro y autenticación por email mediante Supabase.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS · PWA

## Estructura

- `/src/App.tsx` — punto de entrada con React Router
- `/src/components/Layout.tsx` — Layout principal con sidebar de navegación y header responsive
- `/src/components/ExpensesPage.tsx` — Registro diario, categorías, filtros y totales
- `/src/components/SavingsPage.tsx` — Metas de ahorro mensuales, semestrales y anuales con progreso

## Rutas

| Ruta | Componente |
|------|-----------|
| `/` | Gastos diarios |
| `/ahorro` | Metas de ahorro |

## Instalación

```bash
npm install
npm run dev    # desarrollo (Vite)
npm run build  # build de producción → dist/
```

## Datos y backend

La app usa Supabase Auth para registro e ingreso con email y contraseña. Sin una sesión activa solo se muestra la pantalla de ingreso. Conectá un proyecto desde el panel Backend de Cosmos y aplicá la migración `001_finanzas_persistencia.sql` para habilitar el almacenamiento seguro por usuario.

## Deploy en Vercel

Dentro de Cosmos no hace falta crear archivos `.env`, copiar claves ni configurar manualmente las variables públicas. Si exportás el proyecto fuera de Cosmos, configurá las variables públicas de Supabase en el proveedor de despliegue y agregá el dominio publicado a los redirects de Auth.

## Integración continua

El workflow `.github/workflows/cosmos-build.yml` valida el build en cada push y, si falta `package-lock.json`, lo genera y propone un PR con el lockfile.

## Navegación

SPA con React Router. Sidebar lateral con dos áreas, colapsable en móvil. La pantalla principal prioriza la carga rápida de gastos y la segunda pestaña concentra las metas de ahorro.

---

_Generado con Cosmos Code_
