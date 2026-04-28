import clsx from 'clsx';
import React, { useId } from 'react';
import { MdArrowUpward, MdShield } from 'react-icons/md';

interface ReaderAIComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder: string;
  inputLabel: string;
  submitLabel?: string;
  disabled?: boolean;
  loading?: boolean;
}

export const ReaderAIComposer: React.FC<ReaderAIComposerProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  inputLabel,
  submitLabel = '发送问题',
  disabled = false,
  loading = false,
}) => {
  const inputId = useId();
  const trimmedValue = value.trim();
  const isSendDisabled = disabled || loading || !trimmedValue;

  const submit = () => {
    if (isSendDisabled) return;
    onSubmit(trimmedValue);
  };

  return (
    <form
      className={clsx(
        'border-base-content/10 bg-base-200/70 flex items-end gap-2 rounded-[1.25rem] border p-1.5 shadow-sm transition-colors',
        'focus-within:border-primary/40 focus-within:bg-base-100 focus-within:ring-primary/20 focus-within:ring-2',
        'eink:bg-base-100 eink:shadow-none',
      )}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={inputId} className='sr-only'>
        {inputLabel}
      </label>
      <textarea
        id={inputId}
        rows={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        className={clsx(
          'text-base-content max-h-28 min-h-11 min-w-0 flex-1 resize-none border-0 bg-transparent px-3 py-3 font-sans text-base leading-5 outline-none',
          'placeholder:text-base-content/45 disabled:text-base-content/40',
        )}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button
        type='submit'
        className={clsx(
          'btn btn-primary h-11 min-h-11 w-11 shrink-0 rounded-2xl p-0 transition-transform active:scale-95',
          'focus-visible:ring-primary focus-visible:ring-offset-base-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:border-base-content/10 disabled:bg-base-300 disabled:text-base-content/35',
        )}
        disabled={isSendDisabled}
        aria-label={loading ? '正在生成回答' : submitLabel}
      >
        <MdArrowUpward size={20} aria-hidden='true' />
      </button>
    </form>
  );
};

interface ReaderAISuggestionRailProps {
  suggestions: string[];
  selectedValue?: string;
  ariaLabel: string;
  onSelect: (suggestion: string) => void;
}

export const ReaderAISuggestionRail: React.FC<ReaderAISuggestionRailProps> = ({
  suggestions,
  selectedValue,
  ariaLabel,
  onSelect,
}) => (
  <div className='relative -mx-1'>
    <ul
      className='flex gap-2 overflow-x-auto px-1 pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
      aria-label={ariaLabel}
    >
      {suggestions.map((suggestion) => {
        const selected = selectedValue?.trim() === suggestion;
        return (
          <li key={suggestion} className='shrink-0'>
            <button
              type='button'
              onClick={() => onSelect(suggestion)}
              className={clsx(
                'min-h-11 max-w-[78vw] rounded-full border px-3.5 py-2 font-sans text-sm leading-5 transition-colors',
                'focus-visible:ring-primary focus-visible:ring-offset-base-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                selected
                  ? 'border-primary/40 bg-primary/10 text-primary font-medium'
                  : 'border-base-content/10 bg-base-100 text-base-content/75 not-eink:hover:bg-base-200',
              )}
              aria-label={`使用建议问题：${suggestion}`}
            >
              <span className='block truncate'>{suggestion}</span>
            </button>
          </li>
        );
      })}
    </ul>
  </div>
);

interface ReaderAISpoilerGuardProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  variant: 'row' | 'badge';
}

export const ReaderAISpoilerGuard: React.FC<ReaderAISpoilerGuardProps> = ({
  enabled,
  onChange,
  variant,
}) => {
  const descriptionId = useId();
  const label = enabled ? '防剧透已开启，只根据当前阅读进度回答' : '防剧透已关闭，可能包含未读内容';

  if (variant === 'badge') {
    return (
      <button
        type='button'
        role='switch'
        aria-checked={enabled}
        aria-label={label}
        aria-describedby={descriptionId}
        onClick={() => onChange(!enabled)}
        className={clsx(
          'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 font-sans text-xs font-medium transition-colors',
          'focus-visible:ring-primary focus-visible:ring-offset-base-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          enabled
            ? 'border-primary/30 bg-primary/10 text-primary'
            : 'border-base-content/10 bg-base-200 text-base-content/70',
        )}
      >
        <MdShield size={15} aria-hidden='true' />
        <span>{enabled ? '防剧透已开启' : '允许后文'}</span>
        <span id={descriptionId} className='sr-only'>
          {enabled ? '回答仅基于你已读到的位置。' : '回答可能包含未读内容。'}
        </span>
      </button>
    );
  }

  return (
    <button
      type='button'
      role='switch'
      aria-checked={enabled}
      aria-label={label}
      aria-describedby={descriptionId}
      onClick={() => onChange(!enabled)}
      className={clsx(
        'flex min-h-[68px] w-full items-center gap-3 rounded-2xl border p-3 text-left font-sans transition-colors',
        'focus-visible:ring-primary focus-visible:ring-offset-base-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        enabled
          ? 'border-primary/25 bg-primary/10 text-base-content'
          : 'border-base-content/10 bg-base-200/80 text-base-content',
      )}
    >
      <span
        className={clsx(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border',
          enabled
            ? 'border-primary/30 bg-base-100 text-primary'
            : 'border-base-content/10 bg-base-100 text-base-content/55',
        )}
        aria-hidden='true'
      >
        <MdShield size={20} />
      </span>
      <span className='min-w-0 flex-1'>
        <span className='block text-sm font-semibold leading-5'>
          {enabled ? '防剧透已开启' : '允许后文信息'}
        </span>
        <span id={descriptionId} className='text-base-content/60 mt-0.5 block text-xs leading-5'>
          {enabled ? '只根据你已读到的位置回答' : '回答可能包含未读内容'}
        </span>
      </span>
      <span
        className={clsx(
          'flex h-7 w-12 shrink-0 items-center rounded-full border p-0.5 transition-colors',
          enabled ? 'border-primary/30 bg-primary/20' : 'border-base-content/10 bg-base-300',
        )}
        aria-hidden='true'
      >
        <span
          className={clsx(
            'bg-base-100 h-6 w-6 rounded-full shadow-sm transition-transform',
            enabled ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </span>
    </button>
  );
};
