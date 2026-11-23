import type { ButtonHTMLAttributes, FormEvent, ReactNode } from 'react';

export const paths = {
  schedule: 'M7 3v4m10-4v4M4 10h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2 9h2m4 0h2m-8 3h2',
  lessons: 'M12 6a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 4v3l2 2M9 3h6',
  students: 'M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m16 0v-2a4 4 0 0 0-2-3.5M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7-7a3.5 3.5 0 0 1 0 7',
  refresh: 'M20 5v5h-5M4 19v-5h5m11-4a8 8 0 0 0-14-4m-2 8a8 8 0 0 0 14 4',
  plus: 'M12 5v14M5 12h14',
  copy: 'M9 9h11v11H9zM16 6V4H4v12h2',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
} as const;

export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger' };
export function Button({ variant = 'secondary', type = 'button', className = '', ...props }: ButtonProps) {
  return <button type={type} className={`button button--${variant} ${className}`} {...props} />;
}

export function IconButton({ icon, label, ...props }: ButtonProps & { icon: keyof typeof paths; label: string }) {
  return <Button {...props} className="icon-button" aria-label={label} title={label}><Icon name={icon} /></Button>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export const fieldValidation = {
  onInvalid(event: FormEvent<HTMLElement>) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const { valueMissing, patternMismatch, rangeUnderflow, rangeOverflow, stepMismatch } = input.validity;
    if (valueMissing) input.setCustomValidity('Заполните это поле.');
    else if (patternMismatch) input.setCustomValidity('Проверьте код приглашения.');
    else if (rangeUnderflow || rangeOverflow) input.setCustomValidity(`Введите число от ${input.min} до ${input.max}.`);
    else if (stepMismatch) input.setCustomValidity('Введите целое число.');
    else input.setCustomValidity('Проверьте значение в этом поле.');
  },
  onInput(event: FormEvent<HTMLElement>) {
    if (event.target instanceof HTMLInputElement) event.target.setCustomValidity('');
  },
};

export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`panel ${className}`}>{children}</div>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'success' | 'danger' | 'warning'; children: ReactNode }) {
  return <p className={`notice notice--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>{children}</p>;
}

export function EmptyState({ icon, title, children }: { icon: keyof typeof paths; title: string; children: ReactNode }) {
  return <div className="empty"><span className="icon-tile"><Icon name={icon} /></span><div>
    <p className="item-title">{title}</p><p className="muted">{children}</p>
  </div></div>;
}

export function LoadingState({ label }: { label: string }) {
  return <div className="loading" role="status"><span className="skeleton" aria-hidden="true" />{label}</div>;
}
