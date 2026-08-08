# Frontend Structure

## App shell

- Global top bar with workspace switcher, alerts, theme toggle, and quick actions.
- Left navigation grouped by business capability.
- Reusable card language that matches the provided Pop In Solutions references: white surfaces, blue primary accents, soft borders, and generous spacing.

## Route map

- `/dashboard`: business OS landing page
- `/crm`: pipeline, forecast, contact timeline
- `/accounting`: finance summary, invoice and cash widgets
- `/hr`: employee metrics, leave queue, attendance
- `/forms/builder`: drag-and-drop builder canvas, field palette, logic sidebar

## Component groups

- `components/layout/*`: shell, header, navigation
- `components/modules/*`: route-level business widgets
- `components/ui/*`: cards and simple primitives
- `lib/data.ts`: sample seed data for the design prototype

