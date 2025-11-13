'use client';

import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';

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

function formatDateDisplay(value?: string): string {
  if (!value) return '選擇日期';
  const date = dateFromISO(value);
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
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
  const [viewDate, setViewDate] = useState(() => (value ? dateFromISO(value) : new Date()));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const todayIso = useMemo(() => isoFromDate(new Date()), []);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (value) {
      setViewDate(dateFromISO(value));
    }
  }, [value]);

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

  function handleSelect(date: Date) {
    const iso = isoFromDate(date);
    onChange(iso);
    setIsOpen(false);
  }

  const calendarCells = buildCalendarMatrix(viewDate);
  const selectedIso = value ?? '';

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const triggerRect = containerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const padding = 8;
    const desiredWidth = 304; // 19rem
    const width = Math.min(desiredWidth, viewportWidth - padding * 2);

    const popoverDefaultLeft = triggerRect.left;
    const overflowRight = popoverDefaultLeft + width + padding - viewportWidth;
    let translateX = overflowRight > 0 ? -overflowRight : 0;

    const overflowLeft = popoverDefaultLeft + translateX - padding;
    if (overflowLeft < 0) {
      translateX -= overflowLeft;
    }

    setPopoverStyle({
      width,
      transform: `translateX(${translateX}px)`
    });
  }, [isOpen, selectedIso]);

  return (
    <div className={clsx('relative', className)} ref={containerRef}>
      <button
        type="button"
        name={name}
        className={clsx(
          'date-picker__button',
          disabled && 'opacity-60',
          !selectedIso && 'text-dusk/60'
        )}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
      >
        <span className="date-picker__value">
          {selectedIso ? formatDateDisplay(selectedIso) : placeholder}
        </span>
        <span className="date-picker__icon" aria-hidden>
          📅
        </span>
      </button>

      {isOpen && (
        <div className="date-picker__popover" style={popoverStyle}>
          <div className="date-picker__header">
            <button
              type="button"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
              aria-label="上一個月"
            >
              ‹
            </button>
            <div className="date-picker__title">
              {viewDate.getFullYear()} 年 {MONTHS[viewDate.getMonth()]}
            </div>
            <button
              type="button"
              onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
              aria-label="下一個月"
            >
              ›
            </button>
          </div>
          <div className="date-picker__grid">
            {WEEKDAYS.map((day) => (
              <div key={day} className="date-picker__weekday">
                {day}
              </div>
            ))}
            {calendarCells.map((cellDate) => {
              const cellIso = isoFromDate(cellDate);
              const isCurrentMonth = cellDate.getMonth() === viewDate.getMonth();
              const isSelected = selectedIso === cellIso;
              const isToday = todayIso === cellIso;

              return (
                <button
                  key={cellIso}
                  type="button"
                  className={clsx(
                    'date-picker__day',
                    !isCurrentMonth && 'date-picker__day--muted',
                    isToday && 'date-picker__day--today',
                    isSelected && 'date-picker__day--selected'
                  )}
                  onClick={() => handleSelect(cellDate)}
                >
                  {cellDate.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
