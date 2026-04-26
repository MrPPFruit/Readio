import clsx from 'clsx';
import React, { useState } from 'react';

interface AnnotationToolButtonProps {
  showTooltip: boolean;
  tooltipText: string;
  labelText?: string;
  disabled?: boolean;
  Icon: React.ElementType;
  onClick: () => void;
}

const AnnotationToolButton: React.FC<AnnotationToolButtonProps> = ({
  showTooltip,
  tooltipText,
  labelText,
  disabled,
  Icon,
  onClick,
}) => {
  const [buttonClicked, setButtonClicked] = useState(false);
  const handleClick = () => {
    setButtonClicked(true);
    onClick();
  };
  return (
    <div
      className='lg:tooltip lg:tooltip-bottom'
      title={!buttonClicked && showTooltip ? tooltipText : undefined}
    >
      <button
        onClick={handleClick}
        aria-label={tooltipText}
        className={clsx(
          'flex min-h-10 min-w-10 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1',
          disabled
            ? 'cursor-not-allowed opacity-50'
            : 'not-eink:hover:bg-gray-500 eink:hover:border',
        )}
        disabled={disabled}
      >
        <Icon className='text-base' />
        {labelText && <span className='text-[10px] leading-none'>{labelText}</span>}
      </button>
    </div>
  );
};

export default AnnotationToolButton;
