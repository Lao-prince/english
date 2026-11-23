# English Space interface

## Audit and update plan

The app started with one React entry point and one URL. Signed-out views covered loading, browser access, invitations, expiry and errors. The signed-in page stacked availability, upcoming lessons and, for teachers, invitations. Forms and actions repeated Tailwind classes, and the two schedule lists shared a single heading and loading treatment. Telegram provided the launch payload and ready notification. Browser visitors could open the same entry point.

Use one foundation for spacing, type, color and controls. Split the three existing areas into query-addressable views while keeping their component state mounted. Redesign the lists, forms and feedback states. Verify each role at narrow and wide widths, including Telegram theme, viewport and keyboard behavior.

| Role | Views |
| --- | --- |
| Teacher | Schedule, Lessons, Students |
| Student | Schedule, Lessons |
| Signed out | Access and invitation states |

Schedule is the default view. Query links preserve browser Back and Forward, leave Telegram's launch fragment intact, and work under the existing production static server. Active links use `aria-current`, a visible marker and a stronger label. Mobile uses a fixed dock. Tablet and desktop use navigation in the page header.

## Foundations and components

- Warm neutral surfaces, aubergine text and muted violet actions. Dark mode follows Telegram when present, with the operating system preference as the fallback.
- System typography with a display serif for page titles, a compact scale for headings and labels, and tabular numerals for the schedule.
- A 4 px spacing scale, 44 px minimum controls, 1 px borders, consistent corners and 20 px line icons. Shadows are reserved for elevated surfaces.
- Shared Button, IconButton, Field, Badge, Panel, Notice, EmptyState, LoadingState and Icon components. Forms preserve native input semantics. Booking and cancellation confirmations stay inline so the lesson remains visible.
- Native input styles cover text fields, textarea, select, checkbox, radio and switch patterns. The UI uses only the controls its current flows need. Dropdowns, dialogs, sheets, and tooltips can use the same foundations when a workflow calls for them.

Visual references were used for layout rhythm and component consistency. [Memorisely](https://www.memorisely.com/) · [123done Universal Design System](https://123d.one/design-system)
