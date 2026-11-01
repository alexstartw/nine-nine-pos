'use client';

import clsx from 'clsx';
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { createPortal } from 'react-dom';

/**
 * Drop-in replacement for <select> that renders identically in every browser.
 * Accepts the same <option> children and calls onChange with an event-like
 * object ({ target: { value } }), so existing handlers keep working unchanged.
 */

export interface SelectChangeEvent {
  target: { value: string; name?: string };
  currentTarget: { value: string; name?: string };
}

interface ParsedOption {
  value: string;
  label: string;
  disabled: boolean;
}

interface SelectFieldProps {
  value?: string | number | null;
  onChange?: (event: SelectChangeEvent) => void;
  children?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  className?: string;
  size?: 'md' | 'sm';
  'aria-label'?: string;
}

const LIST_MAX_HEIGHT = 288;
const VIEWPORT_PADDING = 8;
const LIST_MAX_WIDTH = 560;

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

function parseOptions(children: ReactNode): ParsedOption[] {
  const result: ParsedOption[] = [];
  Children.toArray(children).forEach((child) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child)) return;
    if (child.type === 'option') {
      const label = textOf(child.props.children);
      const value = child.props.value !== undefined ? String(child.props.value) : label;
      result.push({ value, label, disabled: !!child.props.disabled });
    } else if (child.props.children) {
      result.push(...parseOptions(child.props.children));
    }
  });
  return result;
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx('shrink-0 transition-transform duration-150', open && 'rotate-180')}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function SelectField({
  value,
  onChange,
  children,
  disabled,
  required,
  name,
  id,
  className,
  size = 'md',
  'aria-label': ariaLabel
}: SelectFieldProps) {
  const options = useMemo(() => parseOptions(children), [children]);
  const currentValue = value === null || value === undefined ? '' : String(value);
  const selectedIndex = options.findIndex((opt) => opt.value === currentValue);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : options[0];

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [listStyle, setListStyle] = useState<React.CSSProperties>({ position: 'fixed', top: 0, left: 0, visibility: 'hidden' });
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const typeahead = useRef({ text: '', timer: 0 as unknown as ReturnType<typeof setTimeout> });
  const reactId = useId();
  const listId = `${reactId}-list`;

  useEffect(() => setMounted(true), []);

  const close = useCallback((returnFocus = true) => {
    setIsOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  function firstEnabled(from: number, step: 1 | -1): number {
    for (let i = from; i >= 0 && i < options.length; i += step) {
      if (!options[i].disabled) return i;
    }
    return -1;
  }

  function open() {
    if (disabled || options.length === 0) return;
    setListStyle({ position: 'fixed', top: 0, left: 0, visibility: 'hidden' });
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabled(0, 1));
    setIsOpen(true);
  }

  function commit(index: number) {
    const opt = options[index];
    if (!opt || opt.disabled) return;
    if (opt.value !== currentValue) {
      const target = { value: opt.value, name };
      onChange?.({ target, currentTarget: target });
    }
    close();
  }

  // Position the list (portal, fixed) under the trigger; flip upward when needed.
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const listHeight = Math.min(listRef.current?.scrollHeight ?? LIST_MAX_HEIGHT, LIST_MAX_HEIGHT);
    const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_PADDING;
    const spaceAbove = rect.top - VIEWPORT_PADDING;
    const placeAbove = spaceBelow < listHeight + 6 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(LIST_MAX_HEIGHT, (placeAbove ? spaceAbove : spaceBelow) - 6));
    const maxWidth = Math.min(LIST_MAX_WIDTH, viewportWidth - VIEWPORT_PADDING * 2);
    const minWidth = Math.min(rect.width, maxWidth);
    const left = Math.max(VIEWPORT_PADDING, Math.min(rect.left, viewportWidth - VIEWPORT_PADDING - minWidth));

    setListStyle({
      position: 'fixed',
      left,
      minWidth,
      maxWidth,
      maxHeight,
      ...(placeAbove ? { bottom: viewportHeight - rect.top + 6 } : { top: rect.bottom + 6 })
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen, updatePosition, options.length]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function handlePointer(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close(false);
    }
    function handleScroll(event: Event) {
      if (listRef.current && listRef.current.contains(event.target as Node)) return;
      updatePosition();
    }
    window.addEventListener('mousedown', handlePointer);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen, close, updatePosition]);

  // Keep the active option visible.
  useEffect(() => {
    if (!isOpen || activeIndex < 0 || !listRef.current) return;
    // Scroll only the list itself; scrollIntoView would also scroll the page.
    const list = listRef.current;
    const el = list.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (!el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < list.scrollTop) {
      list.scrollTop = top - 6;
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight + 6;
    }
  }, [isOpen, activeIndex, listStyle]);

  function handleTypeahead(char: string) {
    const state = typeahead.current;
    clearTimeout(state.timer);
    state.text += char.toLowerCase();
    state.timer = setTimeout(() => {
      state.text = '';
    }, 600);
    const start = isOpen ? activeIndex : selectedIndex;
    const ordered = options.map((_, i) => (start + 1 + i) % options.length);
    const match =
      ordered.find((i) => !options[i].disabled && options[i].label.toLowerCase().startsWith(state.text)) ??
      ordered.find((i) => !options[i].disabled && options[i].label.toLowerCase().startsWith(char.toLowerCase()));
    if (match === undefined) return;
    if (isOpen) {
      setActiveIndex(match);
    } else if (options[match].value !== currentValue) {
      const target = { value: options[match].value, name };
      onChange?.({ target, currentTarget: target });
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const { key } = event;

    if (!isOpen) {
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
        event.preventDefault();
        open();
        return;
      }
    } else {
      if (key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (key === 'Tab') {
        close(false);
        return;
      }
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault();
        const step = key === 'ArrowDown' ? 1 : -1;
        const next = firstEnabled(activeIndex + step, step);
        if (next >= 0) setActiveIndex(next);
        return;
      }
      if (key === 'Home' || key === 'End') {
        event.preventDefault();
        const next = key === 'Home' ? firstEnabled(0, 1) : firstEnabled(options.length - 1, -1);
        if (next >= 0) setActiveIndex(next);
        return;
      }
      if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        commit(activeIndex);
        return;
      }
    }

    if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      handleTypeahead(key);
    }
  }

  return (
    <div className={clsx('relative', className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={handleKeyDown}
        className={clsx(
          'flex w-full items-center justify-between gap-2 border bg-white text-left text-dusk transition-[border-color,box-shadow]',
          'focus:outline-none focus-visible:border-clay focus-visible:ring-[3px] focus-visible:ring-clay/20',
          size === 'sm' ? 'min-h-[32px] rounded-lg pl-2.5 pr-2 text-[13px]' : 'min-h-[44px] rounded-xl pl-3 pr-2.5 text-sm',
          isOpen ? 'border-clay ring-[3px] ring-clay/20' : 'border-sand/60',
          disabled && 'cursor-not-allowed bg-linen opacity-60'
        )}
      >
        <span className="min-w-0 truncate">
          {selected?.label ?? ' '}
        </span>
        <span className="text-dusk/70">
          <ChevronDown open={isOpen} />
        </span>
      </button>

      {required && (
        // Keeps native form validation (required) working.
        <select
          aria-hidden="true"
          tabIndex={-1}
          required
          name={name}
          value={currentValue}
          onChange={() => undefined}
          onFocus={() => triggerRef.current?.focus()}
          className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
      {!required && name && <input type="hidden" name={name} value={currentValue} />}

      {mounted &&
        isOpen &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            className="z-[1000] overflow-y-auto overscroll-contain rounded-[14px] bg-white p-1.5 text-dusk shadow-[0_12px_32px_rgba(70,63,58,0.16),0_1px_2px_rgba(70,63,58,0.08)]"
            style={listStyle}
            onMouseDown={(event) => event.preventDefault()}
          >
            {options.map((opt, index) => {
              const isSelected = opt.value === currentValue;
              const isActive = index === activeIndex;
              return (
                <div
                  key={`${opt.value}-${index}`}
                  id={`${listId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled || undefined}
                  onMouseEnter={() => !opt.disabled && setActiveIndex(index)}
                  onClick={() => commit(index)}
                  className={clsx(
                    'flex cursor-pointer items-center justify-between gap-3 rounded-lg pl-3 pr-2.5',
                    size === 'sm' ? 'min-h-[34px] text-[13px]' : 'min-h-[40px] text-sm',
                    isActive && 'bg-sand/25',
                    isSelected && 'font-semibold',
                    opt.disabled && 'cursor-not-allowed opacity-40'
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  <span className="flex w-4 shrink-0 text-clay">{isSelected && <CheckIcon />}</span>
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
