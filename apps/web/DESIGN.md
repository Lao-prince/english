# English Space interface

## Pink redesign

The existing workspace has Schedule, Upcoming lessons and Students, plus access and invitation states. Schedule includes publishing, booking and cancellation. Students includes invitations, roster editing and credit management. Students can see their own credit activity in Lessons. An audit found English copy and English server errors exposed directly in forms, a violet brand palette, and Telegram integration that only read the light or dark setting.

The redesign starts with Schedule and its navigation and applies the same components to access, lessons, invitations, roster, and credits. Neutral surfaces, system sans-serif with Cyrillic support, quiet dividers, and pink `#FFCDE6` distinguish the selected destination and brand mark. Navigation uses a fixed bottom dock below 768px, a compact header on tablets, and a side rail from 1024px. Links keep their query destinations and role restrictions. Dates, messages, form validation, and accessible names use Russian.

The brief's emphasis on typography, spacing, and restrained surfaces informed the design direction. [Spline One's design portfolio](https://www.behance.net/spline-one)

The existing Telegram theme event refreshes the app's semantic color tokens. Accept background colors that work with the app's fallback text, then accept foreground colors that achieve 4.5:1 contrast on the selected surfaces. Adopt the Telegram button colors as a pair with the same threshold. The pink active marker uses its own dark foreground. In a browser, system appearance sets the base palette. [Telegram WebApp theme parameters](https://core.telegram.org/bots/webapps#themeparams)

## Previous iteration

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
