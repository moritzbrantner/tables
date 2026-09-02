import { cloneElement, createContext, isValidElement, useContext } from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  OptionHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

function cx(...values: Array<false | null | string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export type UiThemeName = "atlas" | "bobba" | "paper" | "pop" | "pulse" | "studio" | "zleek";

export function UiTheme({ className, theme, ...props }: HTMLAttributes<HTMLDivElement> & { theme: UiThemeName }) {
  return <div className={cx("demo-theme", className)} data-demo-theme={theme} {...props} />;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  size?: string;
  variant?: string;
};

export function Button({ asChild = false, children, className, size, type = "button", variant, ...props }: ButtonProps) {
  const classes = cx("demo-button", size && `demo-button--${size}`, variant && `demo-button--${variant}`, className);

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>;
    return cloneElement(child, {
      ...props,
      className: cx(classes, child.props.className),
    });
  }

  return <button className={classes} type={type} {...props}>{children}</button>;
}

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "destructive" | "outline" | "secondary";
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return <span className={cx("demo-badge", `demo-badge--${variant}`, className)} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("demo-card", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("demo-card__header", className)} {...props} />;
}

type CardTitleProps = HTMLAttributes<HTMLHeadingElement> & {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
};

export function CardTitle({ className, level = 3, ...props }: CardTitleProps) {
  const classes = cx("demo-card__title", className);
  if (level === 1) return <h1 className={classes} {...props} />;
  if (level === 2) return <h2 className={classes} {...props} />;
  if (level === 4) return <h4 className={classes} {...props} />;
  if (level === 5) return <h5 className={classes} {...props} />;
  if (level === 6) return <h6 className={classes} {...props} />;
  return <h3 className={classes} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("demo-card__description", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("demo-card__content", className)} {...props} />;
}

export function Alert({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("demo-alert", className)} role="status" {...props} />;
}

export function AlertDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("demo-alert__description", className)} {...props} />;
}

export function DescriptionList({ className, ...props }: HTMLAttributes<HTMLDListElement>) {
  return <dl className={cx("demo-description-list", className)} {...props} />;
}

export function DescriptionListItem({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("demo-description-list__item", className)} {...props} />;
}

export function DescriptionListTerm({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <dt className={cx("demo-description-list__term", className)} {...props} />;
}

export function DescriptionListDetail({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <dd className={cx("demo-description-list__detail", className)} {...props} />;
}

export function Empty({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("demo-empty", className)} {...props} />;
}

export function EmptyHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("demo-empty__header", className)} {...props} />;
}

export function EmptyDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("demo-empty__description", className)} {...props} />;
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cx("demo-label", className)} {...props} />;
}

type MetricStripItem = {
  id: string;
  label: ReactNode;
  value: ReactNode;
};

export function MetricStrip({ className, items }: { className?: string; items: readonly MetricStripItem[] }) {
  return (
    <dl className={cx("demo-metric-strip", className)}>
      {items.map((item) => (
        <div className="demo-metric-strip__item" key={item.id}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx("demo-select", className)} {...props} />;
}

export function NativeSelectOption(props: OptionHTMLAttributes<HTMLOptionElement>) {
  return <option {...props} />;
}

type ToggleGroupContextValue = {
  onValueChange?: (value: string) => void;
  value?: string;
};

const ToggleGroupContext = createContext<ToggleGroupContextValue>({});

type ToggleGroupProps = HTMLAttributes<HTMLDivElement> & {
  onValueChange?: (value: string) => void;
  type: "single";
  value?: string;
  variant?: string;
};

export function ToggleGroup({ children, className, onValueChange, type: _type, value, variant, ...props }: ToggleGroupProps) {
  return (
    <ToggleGroupContext.Provider value={{ onValueChange, value }}>
      <div className={cx("demo-toggle-group", variant && `demo-toggle-group--${variant}`, className)} {...props}>{children}</div>
    </ToggleGroupContext.Provider>
  );
}

export function ToggleGroupItem({ children, className, value, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> & { value: string }) {
  const group = useContext(ToggleGroupContext);
  const selected = group.value === value;
  return (
    <button
      aria-pressed={selected}
      className={cx("demo-toggle-group__item", selected && "is-active", className)}
      onClick={() => group.onValueChange?.(selected ? "" : value)}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

type ToolbarProps = HTMLAttributes<HTMLDivElement> & {
  justify?: "between" | "center" | "end" | "start";
};

export function Toolbar({ className, justify, ...props }: ToolbarProps) {
  return <div className={cx("demo-toolbar", justify && `demo-toolbar--${justify}`, className)} role="toolbar" {...props} />;
}

export function ToolbarGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("demo-toolbar__group", className)} {...props} />;
}

export function ToolbarSpacer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cx("demo-toolbar__spacer", className)} {...props} />;
}

type ViewHeaderProps = HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  title?: ReactNode;
};

export function ViewHeader({ actions, children, className, description, eyebrow, title, ...props }: ViewHeaderProps) {
  return (
    <section className={cx("demo-view-header", className)} {...props}>
      <div className="demo-view-header__copy">
        {eyebrow ? <p className="demo-view-header__eyebrow">{eyebrow}</p> : null}
        {title ? <h1>{title}</h1> : null}
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="demo-view-header__actions">{actions}</div> : null}
      {children}
    </section>
  );
}

type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
  onValueChange?: (value: string) => void;
  value?: string;
};

export function SearchField({ className, inputProps, onValueChange, value = "", ...props }: SearchFieldProps) {
  return (
    <input
      className={cx("demo-search-field", className)}
      onChange={(event) => onValueChange?.(event.currentTarget.value)}
      type="search"
      value={value}
      {...props}
      {...inputProps}
    />
  );
}
