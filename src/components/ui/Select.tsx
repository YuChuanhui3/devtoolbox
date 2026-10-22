import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';
import { cn } from '@/lib/cn';

interface SelectOption {
  value: string;
  label: ReactNode;
  disabled: boolean;
}

interface SelectChangeEvent {
  target: {
    value: string;
    name?: string;
  };
}

export interface SelectProps {
  value?: string | number;
  onChange?: (event: SelectChangeEvent) => void;
  children?: ReactNode;
  className?: string;
  wrapperClassName?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  placeholder?: Localized;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

const VIEWPORT_MARGIN = 8;
const MENU_GAP = 6;
const MENU_ITEM_HEIGHT = 36;
const MENU_MAX_HEIGHT = 280;
const MENU_MIN_WIDTH = 168;

function childrenToOptions(children: ReactNode): SelectOption[] {
  const options: SelectOption[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child) || child.type !== 'option') return;
    const props = child.props as {
      value?: string | number;
      children?: ReactNode;
      disabled?: boolean;
    };
    const label = props.children;
    const value =
      props.value !== undefined
        ? String(props.value)
        : typeof label === 'string' || typeof label === 'number'
          ? String(label)
          : '';
    options.push({ value, label, disabled: Boolean(props.disabled) });
  });

  return options;
}

export function Select({
  value,
  onChange,
  children,
  className,
  wrapperClassName,
  id,
  name,
  disabled = false,
  placeholder = { zh: '请选择', en: 'Select…' },
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: SelectProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const wrapperRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();

  const options = useMemo(() => childrenToOptions(children), [children]);
  const selectedValue = value !== undefined ? String(value) : (options[0]?.value ?? '');
  const selectedIndex = options.findIndex((option) => option.value === selectedValue);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  const openMenu = (index = selectedIndex >= 0 ? selectedIndex : 0) => {
    if (disabled || options.length === 0) return;
    setActiveIndex(index);
    setOpen(true);
  };

  const selectOption = (option: SelectOption) => {
    if (option.disabled) return;
    onChange?.({ target: { value: option.value, name } });
    closeMenu(true);
  };

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const estimatedHeight = Math.min(
      MENU_MAX_HEIGHT,
      Math.max(80, options.length * MENU_ITEM_HEIGHT + 12),
    );
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    const shouldOpenAbove =
      spaceBelow < Math.min(estimatedHeight, 180) && spaceAbove > spaceBelow;
    const available = shouldOpenAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(80, Math.min(estimatedHeight, available, MENU_MAX_HEIGHT));
    const width = Math.min(
      Math.max(rect.width, MENU_MIN_WIDTH),
      window.innerWidth - VIEWPORT_MARGIN * 2,
    );
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
    );
    const top = shouldOpenAbove
      ? Math.max(VIEWPORT_MARGIN, rect.top - maxHeight - MENU_GAP)
      : Math.min(window.innerHeight - maxHeight - VIEWPORT_MARGIN, rect.bottom + MENU_GAP);

    setPosition({ top, left, width, maxHeight });
  };

  useEffect(() => {
    if (!open) return;

    updatePosition();

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
      }
    };
    const onViewportChange = () => updatePosition();

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, options.length]);

  const scrollOptionIntoView = (index: number) => {
    const menu = menuRef.current;
    const node = optionRefs.current[index];
    if (!menu || !node) return;
    const top = node.offsetTop;
    const bottom = top + node.offsetHeight;
    if (top < menu.scrollTop) {
      menu.scrollTop = top;
    } else if (bottom > menu.scrollTop + menu.clientHeight) {
      menu.scrollTop = bottom - menu.clientHeight;
    }
  };

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const node = optionRefs.current[activeIndex];
      node?.focus({ preventScroll: true });
      scrollOptionIntoView(activeIndex);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    scrollOptionIntoView(activeIndex);
  }, [activeIndex, open]);

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (open) return;
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openMenu(event.key === 'ArrowUp' ? Math.max(0, options.length - 1) : undefined);
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (options.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + options.length) % options.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) selectOption(option);
    } else if (event.key === 'Tab') {
      closeMenu();
    }
  };

  return (
    <span ref={wrapperRef} className={cn('relative inline-flex min-w-0 items-center', wrapperClassName)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          'flex h-9 w-full cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface pl-3 pr-8 text-left text-sm text-ink transition-colors duration-300 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent-soft disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', !selectedOption && 'text-ink-3')}>
          {selectedOption?.label ?? t(placeholder)}
        </span>
        <ChevronDown
          className={cn(
            'pointer-events-none absolute right-2.5 h-4 w-4 text-ink-3 transition-transform duration-200',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              tabIndex={-1}
              onKeyDown={handleMenuKeyDown}
              style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
              }}
              className="code-scroll z-[95] animate-fade-in overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-[0_18px_50px_rgba(8,12,20,0.28)] outline-none"
            >
              {options.length === 0 ? (
                <p className="px-2.5 py-2 text-xs text-ink-3">
                  {t({ zh: '暂无选项', en: 'No options' })}
                </p>
              ) : (
                options.map((option, index) => {
                  const selected = option.value === selectedValue;
                  return (
                    <button
                      key={`${option.value}-${index}`}
                      ref={(node) => {
                        optionRefs.current[index] = node;
                      }}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={option.disabled}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectOption(option)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] leading-5 transition-colors duration-150',
                        option.disabled && 'cursor-not-allowed text-ink-3 opacity-60',
                        !option.disabled && index === activeIndex
                          ? 'bg-accent-soft text-accent-strong'
                          : 'text-ink-2',
                        !option.disabled && index !== activeIndex && 'hover:bg-surface-2',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {selected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                    </button>
                  );
                })
              )}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
