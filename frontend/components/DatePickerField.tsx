'use client';

import clsx from 'clsx';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月'
];

const POPOVER_WIDTH = 324;
const POPOVER_HEIGHT_ESTIMATE = 360;
const YEAR_PAGE = 12;

type View = 'days' | 'months' | 'years';

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function dateFromISO(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function isoFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildCalendarMatrix(viewDate: Date): Date[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const cells: Date[] = [];

  for (let i = 0; i < totalCells; i += 1) {
    const dayOffset = i - firstDay + 1;
    cells.push(new Date(year, month, dayOffset));
  }
  return cells;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
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
    >
      <path d={direction === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  );
}

interface DatePickerFieldProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  className?: string;
}

export function DatePickerField({
  value,
  onChange,
  placeholder = '選擇日期',
  disabled,
  name,
  className
}: DatePickerFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<View>('days');
  const [viewDate, setViewDate] = useState(() => (value ? dateFromISO(value) : new Date()));
  const [focusedIso, setFocusedIso] = useState<string>(() => value || isoFromDate(new Date()));
  const [inputValue, setInputValue] = useState(value ?? '');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const todayIso = useMemo(() => isoFromDate(new Date()), []);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const [placeAbove, setPlaceAbove] = useState(false);

  useEffect(() => {
    if (value) {
      setViewDate(dateFromISO(value));
      setInputValue(value);
    } else {
      setInputValue('');
    }
  }, [value]);

  const close = useCallback((returnFocus: boolean) => {
    setIsOpen(false);
    if (returnFocus) inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      window.addEventListener('mousedown', handleClickOutside);
      return () => window.removeEventListener('mousedown', handleClickOutside);
    }
    return undefined;
  }, [isOpen]);

  function open() {
    if (disabled) return;
    const base = value ? dateFromISO(value) : new Date();
    setViewDate(base);
    setFocusedIso(isoFromDate(base));
    setView('days');
    setIsOpen(true);
  }

  function handleSelect(date: Date) {
    const iso = isoFromDate(date);
    onChange(iso);
    close(true);
  }

  function isValidIso(valueToCheck: string): boolean {
    const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoPattern.test(valueToCheck)) return false;
    const date = dateFromISO(valueToCheck);
    return !Number.isNaN(date.getTime()) && isoFromDate(date) === valueToCheck;
  }

  function normalizeManualInput(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return '';

    if (isValidIso(trimmed)) return trimmed;

    const slashPattern = /^(\d{4})[\/](\d{1,2})[\/](\d{1,2})$/;
    const slashMatch = trimmed.match(slashPattern);
    if (slashMatch) {
      const [, y, m, d] = slashMatch;
      const iso = `${y}-${pad(Number(m))}-${pad(Number(d))}`;
      if (isValidIso(iso)) return iso;
    }

    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 8) {
      const y = digits.slice(0, 4);
      const m = digits.slice(4, 6);
      const d = digits.slice(6, 8);
      const iso = `${y}-${m}-${d}`;
      if (isValidIso(iso)) return iso;
    }

    return null;
  }

  function commitManualInput() {
    const normalized = normalizeManualInput(inputValue);
    if (normalized === (value ?? '')) {
      // nothing changed (e.g. focus moved into the calendar)
      setInputValue(normalized);
      return;
    }
    if (normalized === '') {
      onChange('');
      return;
    }
    if (!normalized) {
      // revert to last valid value
      setInputValue(value ?? '');
      return;
    }
    onChange(normalized);
    setViewDate(dateFromISO(normalized));
  }

  const calendarCells = buildCalendarMatrix(viewDate);
  const selectedIso = value ?? '';
  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();
  const yearPageStart = Math.floor(viewYear / YEAR_PAGE) * YEAR_PAGE;

  // Position: keep inside the viewport horizontally; open upward when there is not enough room below.
  useLayoutEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const triggerRect = containerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;
    const width = Math.min(POPOVER_WIDTH, viewportWidth - padding * 2);

    const popoverDefaultLeft = triggerRect.left;
    const overflowRight = popoverDefaultLeft + width + padding - viewportWidth;
    let translateX = overflowRight > 0 ? -overflowRight : 0;

    const overflowLeft = popoverDefaultLeft + translateX - padding;
    if (overflowLeft < 0) {
      translateX -= overflowLeft;
    }

    const popoverHeight = popoverRef.current?.offsetHeight ?? POPOVER_HEIGHT_ESTIMATE;
    const spaceBelow = viewportHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    setPlaceAbove(spaceBelow < popoverHeight + padding && spaceAbove > spaceBelow);

    setPopoverStyle({
      width,
      transform: `translateX(${translateX}px)`
    });
  }, [isOpen, selectedIso, view]);

  // Move keyboard focus to the active cell whenever it changes while open.
  useEffect(() => {
    if (!isOpen || !popoverRef.current) return;
    const target = popoverRef.current.querySelector<HTMLButtonElement>('[data-active="true"]');
    target?.focus();
  }, [isOpen, focusedIso, view, viewYear, viewMonth]);

  function moveFocus(next: Date) {
    setFocusedIso(isoFromDate(next));
    if (next.getFullYear() !== viewYear || next.getMonth() !== viewMonth) {
      setViewDate(new Date(next.getFullYear(), next.getMonth(), 1));
    }
  }

  function handlePopoverKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (view !== 'days') {
        setView(view === 'years' ? 'months' : 'days');
        return;
      }
      close(true);
      return;
    }

    if (view === 'days') {
      const current = dateFromISO(focusedIso);
      const keyMap: Record<string, () => Date> = {
        ArrowLeft: () => addDays(current, -1),
        ArrowRight: () => addDays(current, 1),
        ArrowUp: () => addDays(current, -7),
        ArrowDown: () => addDays(current, 7),
        PageUp: () => addMonths(current, event.shiftKey ? -12 : -1),
        PageDown: () => addMonths(current, event.shiftKey ? 12 : 1),
        Home: () => addDays(current, -current.getDay()),
        End: () => addDays(current, 6 - current.getDay())
      };
      const handler = keyMap[event.key];
      if (handler) {
        event.preventDefault();
        moveFocus(handler());
      }
      return;
    }

    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
    if (event.key in step) {
      event.preventDefault();
      if (view === 'months') {
        const nextMonth = Math.min(11, Math.max(0, viewMonth + step[event.key]));
        setViewDate(new Date(viewYear, nextMonth, 1));
      } else {
        setViewDate(new Date(viewYear + step[event.key], viewMonth, 1));
      }
    }
  }

  function shiftView(direction: -1 | 1) {
    if (view === 'days') {
      const next = new Date(viewYear, viewMonth + direction, 1);
      setViewDate(next);
      const focused = dateFromISO(focusedIso);
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      setFocusedIso(isoFromDate(new Date(next.getFullYear(), next.getMonth(), Math.min(focused.getDate(), lastDay))));
    } else if (view === 'months') {
      setViewDate(new Date(viewYear + direction, viewMonth, 1));
    } else {
      setViewDate(new Date(viewYear + direction * YEAR_PAGE, viewMonth, 1));
    }
  }

  function selectMonth(month: number) {
    const focused = dateFromISO(focusedIso);
    const lastDay = new Date(viewYear, month + 1, 0).getDate();
    setViewDate(new Date(viewYear, month, 1));
    setFocusedIso(isoFromDate(new Date(viewYear, month, Math.min(focused.getDate(), lastDay))));
    setView('days');
  }

  function selectYear(year: number) {
    setViewDate(new Date(year, viewMonth, 1));
    setView('months');
  }

  const headerTitle =
    view === 'days'
      ? `${viewYear} 年 ${MONTHS[viewMonth]}`
      : view === 'months'
        ? `${viewYear} 年`
        : `${yearPageStart} – ${yearPageStart + YEAR_PAGE - 1}`;

  const prevLabel = view === 'days' ? '上一個月' : view === 'months' ? '上一年' : '上一頁年份';
  const nextLabel = view === 'days' ? '下一個月' : view === 'months' ? '下一年' : '下一頁年份';

  const navButtonClass =
    'flex h-9 w-9 items-center justify-center rounded-[10px] bg-linen text-dusk transition-colors hover:bg-sand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/40';

  const selectedDate = selectedIso ? dateFromISO(selectedIso) : null;
  const todayDate = dateFromISO(todayIso);

  return (
    <div className={clsx('relative', className)} ref={containerRef}>
      <div className={clsx('relative w-full', disabled && 'opacity-60')}>
        <input
          ref={inputRef}
          type="text"
          name={name}
          className={clsx(
            'block min-h-[44px] w-full appearance-none rounded-xl border border-sand/60 bg-white py-0 pl-3 pr-11 text-sm tabular-nums text-dusk transition-[border-color,box-shadow] placeholder:text-dusk/50',
            'focus:border-clay focus:outline-none focus:ring-[3px] focus:ring-clay/20',
            isOpen && 'border-clay ring-[3px] ring-clay/20',
            disabled && 'cursor-not-allowed bg-linen'
          )}
          placeholder={placeholder || 'YYYY-MM-DD'}
          value={inputValue}
          inputMode="numeric"
          autoComplete="off"
          onChange={(event) => setInputValue(event.target.value)}
          onBlur={commitManualInput}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitManualInput();
            } else if (event.key === 'ArrowDown' && !isOpen) {
              event.preventDefault();
              open();
            } else if (event.key === 'Escape' && isOpen) {
              event.preventDefault();
              close(false);
            }
          }}
          disabled={disabled}
        />
        <button
          type="button"
          className={clsx(
            'absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-dusk/70 transition-colors hover:bg-sand/25 hover:text-dusk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/40',
            isOpen && 'bg-sand/25 text-dusk',
            disabled && 'cursor-not-allowed'
          )}
          onClick={() => (isOpen ? close(false) : open())}
          disabled={disabled}
          aria-label="開啟日期選擇"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
        >
          <CalendarIcon />
        </button>
      </div>

      {isOpen && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="日期選擇"
          className={clsx(
            'absolute left-0 z-50 box-border rounded-2xl bg-white p-4 text-dusk shadow-[0_12px_32px_rgba(70,63,58,0.16),0_1px_2px_rgba(70,63,58,0.08)]',
            placeAbove ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'
          )}
          style={popoverStyle}
          onKeyDown={handlePopoverKeyDown}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="rounded-lg px-1.5 py-1 text-[15px] font-semibold tabular-nums text-dusk transition-colors hover:bg-linen focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/40 disabled:cursor-default disabled:opacity-100 disabled:hover:bg-transparent"
              onClick={() => setView(view === 'days' ? 'months' : 'years')}
              disabled={view === 'years'}
              aria-label="切換年月"
            >
              {headerTitle}
            </button>
            <div className="flex gap-1">
              <button type="button" className={navButtonClass} onClick={() => shiftView(-1)} aria-label={prevLabel}>
                <Chevron direction="left" />
              </button>
              <button type="button" className={navButtonClass} onClick={() => shiftView(1)} aria-label={nextLabel}>
                <Chevron direction="right" />
              </button>
            </div>
          </div>

          {view === 'days' && (
            <div className="grid grid-cols-7 gap-0.5" role="grid">
              {WEEKDAYS.map((day) => (
                <div key={day} className="flex h-7 items-center justify-center text-xs text-dusk/60">
                  {day}
                </div>
              ))}
              {calendarCells.map((cellDate) => {
                const cellIso = isoFromDate(cellDate);
                const isCurrentMonth = cellDate.getMonth() === viewMonth;
                const isSelected = selectedIso === cellIso;
                const isToday = todayIso === cellIso;
                const isActive = focusedIso === cellIso;

                return (
                  <button
                    key={cellIso}
                    type="button"
                    tabIndex={isActive ? 0 : -1}
                    data-active={isActive}
                    aria-pressed={isSelected}
                    aria-label={`${cellDate.getFullYear()} 年 ${cellDate.getMonth() + 1} 月 ${cellDate.getDate()} 日`}
                    className={clsx(
                      'mx-auto flex aspect-square w-full max-w-[40px] items-center justify-center rounded-[10px] text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/50',
                      isSelected
                        ? 'bg-dusk font-semibold text-amber-50'
                        : isToday
                          ? 'font-semibold text-clay shadow-[inset_0_0_0_1.5px_#8A5A44] hover:bg-sand/25'
                          : isCurrentMonth
                            ? 'text-dusk hover:bg-sand/25'
                            : 'text-dusk/35 hover:bg-sand/20',
                      isActive && !isSelected && 'bg-sand/25'
                    )}
                    onClick={() => handleSelect(cellDate)}
                  >
                    {cellDate.getDate()}
                  </button>
                );
              })}
            </div>
          )}

          {view === 'months' && (
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {MONTHS.map((label, index) => {
                const isActive = index === viewMonth;
                const isSelected =
                  !!selectedDate && selectedDate.getFullYear() === viewYear && selectedDate.getMonth() === index;
                const isCurrent = todayDate.getFullYear() === viewYear && todayDate.getMonth() === index;
                return (
                  <button
                    key={label}
                    type="button"
                    tabIndex={isActive ? 0 : -1}
                    data-active={isActive}
                    className={clsx(
                      'h-12 rounded-xl text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/50',
                      isSelected
                        ? 'bg-dusk font-semibold text-amber-50'
                        : isCurrent
                          ? 'font-semibold text-clay shadow-[inset_0_0_0_1.5px_#8A5A44] hover:bg-sand/25'
                          : 'text-dusk hover:bg-sand/25',
                      isActive && !isSelected && 'bg-sand/25'
                    )}
                    onClick={() => selectMonth(index)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {view === 'years' && (
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {Array.from({ length: YEAR_PAGE }, (_, i) => yearPageStart + i).map((year) => {
                const isActive = year === viewYear;
                const isSelected = !!selectedDate && selectedDate.getFullYear() === year;
                const isCurrent = todayDate.getFullYear() === year;
                return (
                  <button
                    key={year}
                    type="button"
                    tabIndex={isActive ? 0 : -1}
                    data-active={isActive}
                    className={clsx(
                      'h-12 rounded-xl text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/50',
                      isSelected
                        ? 'bg-dusk font-semibold text-amber-50'
                        : isCurrent
                          ? 'font-semibold text-clay shadow-[inset_0_0_0_1.5px_#8A5A44] hover:bg-sand/25'
                          : 'text-dusk hover:bg-sand/25',
                      isActive && !isSelected && 'bg-sand/25'
                    )}
                    onClick={() => selectYear(year)}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
